/**
 * Chronicle Manager — Electron Main Process
 *
 * Wraps the Vue 3 SPA (Vite build output) in a native desktop window.
 */

const { app, BrowserWindow, shell, Menu, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');
const { convertBackgroundVideo } = require('./video-convert.cjs');

const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');
const DEV_URL = process.env.VITE_DEV_URL || 'http://localhost:5173';

let mainWindow = null;

function getDistIndex() {
  const p = path.join(__dirname, '..', 'dist', 'index.html');
  if (fs.existsSync(p)) return p;
  throw new Error('dist/index.html not found. Run vite build first.');
}

// ── Helpers ─────────────────────────────────────────────────

function stripOrigin(win) {
  win.webContents.session.webRequest.onBeforeSendHeaders((details, callback) => {
    delete details.requestHeaders['origin'];
    callback({ requestHeaders: details.requestHeaders });
  });
}

function setupUnsavedGuard(win) {
  // Use the BrowserWindow 'close' event (not webContents 'will-prevent-unload')
  // because 'close' fires FIRST and is the only reliable way to prevent the
  // window from closing.  'will-prevent-unload' fires after the close has
  // already started and cannot stop a BrowserWindow.close() in progress.
  win.on('close', async (event) => {
    event.preventDefault();

    let isDirty = false;
    try {
      // 3 s timeout: prevents the window from being permanently
      // uncloseable if the renderer process is hung.
      isDirty = !!(await Promise.race([
        win.webContents.executeJavaScript('window.__chronicleDirty'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
      ]));
    } catch (_) {
      // Renderer not available or timed out — close immediately
    }

    if (!isDirty) {
      // No unsaved changes, allow close
      if (!win.isDestroyed()) win.destroy();
      return;
    }

    const choice = dialog.showMessageBoxSync(win, {
      type: 'question',
      buttons: ['Leave', 'Stay'],
      defaultId: 1,
      title: 'Unsaved changes',
      message: 'You have unsaved changes. Leave anyway?',
    });
    if (choice === 0) {
      // User chose Leave — destroy the window (bypasses the close guard)
      if (!win.isDestroyed()) win.destroy();
    }
    // If choice === 1 (Stay): close was already prevented via event.preventDefault(),
    // just let the user continue editing.
  });
}

function createChildWindow(url) {
  const newWin = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    frame: false,
    titleBarStyle: 'hidden',
    title: 'Chronicle Editor',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      // sandbox: true is NOT set — Electron's OS-level sandbox requires
      // user namespaces (Linux) or Seatbelt (Mac) to be pre-configured,
      // otherwise the renderer may fail to start. The combination of
      // contextIsolation + nodeIntegration:false + CSP provides a strong
      // enough isolation layer for this app's threat model.
    },
  });

  stripOrigin(newWin);
  setupMaximizeListener(newWin);
  setupUnsavedGuard(newWin);

  // Extract the route path from the incoming URL.
  // Electron resolves relative URLs before passing them to
  // setWindowOpenHandler, so we receive an absolute file:/// URL
  // (e.g. "file:///path/dist/editor?id=...") rather than a bare path.
  let routePath
  if (/^file:\/\//i.test(url)) {
    try {
      const parsed = new URL(url)
      // If the URL already has a hash (e.g. "#/editor?id=..."), use it.
      if (parsed.hash && parsed.hash.startsWith('#/')) {
        routePath = parsed.hash.slice(2)
      } else {
        // pathname is /path/to/dist/editor — take everything after /dist/
        const pathAfterDist = parsed.pathname.split('/dist/')[1] || ''
        if (pathAfterDist) {
          routePath = pathAfterDist + parsed.search
        } else {
          // Fallback: strip leading slash and Windows drive letter
          // (e.g. /H:/editor → editor) — Electron preserves the drive
          // prefix when resolving relative paths against file:// URLs.
          let p = parsed.pathname.replace(/^\//, '')
          p = p.replace(/^[A-Za-z]:\//, '')
          routePath = p + parsed.search
        }
      }
    } catch (_) {
      routePath = url
    }
  } else if (/^https?:\/\//i.test(url)) {
    try {
      const parsed = new URL(url)
      routePath = parsed.pathname.replace(/^\//, '') + parsed.search + parsed.hash
    } catch (_) {
      routePath = url.replace(/^\//, '')
    }
  } else {
    routePath = url.replace(/^\//, '')
  }

  const winUrl = isDev
    ? `${DEV_URL}/${routePath}`
    : `file:///${getDistIndex().replace(/\\/g, '/')}#/${routePath}`;

  newWin.loadURL(winUrl);
  return newWin;
}

// ── Main window ──────────────────────────────────────────────

function createWindow() {
  // Restore window state from .chronicle/state.json (P4-4)
  let winState = { x: null, y: null, width: 1400, height: 900, isMaximized: false }
  try {
    const saved = JSON.parse(fs.readFileSync(path.join(CHRONICLE_DIR, 'state.json'), 'utf-8'))
    winState = { ...winState, ...(saved.window || {}) }
  } catch {}

  mainWindow = new BrowserWindow({
    width: winState.width,
    height: winState.height,
    ...(winState.x != null && winState.y != null ? { x: winState.x, y: winState.y } : {}),
    minWidth: 900,
    minHeight: 600,
    title: 'Chronicle Manager',
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  if (winState.isMaximized) mainWindow.maximize();

  stripOrigin(mainWindow);

  // ── Navigation / external-link security ──────────────────
  // Prevent the renderer from navigating to unexpected URLs.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    // In dev mode, allow navigation to the dev server.
    if (isDev && url.startsWith(DEV_URL)) return;
    // In production, only allow the loaded file:// page.
    if (!isDev && url.startsWith('file://')) return;
    event.preventDefault();
  });

  // Prevent redirects in production (file:// pages shouldn't redirect).
  // Dev mode (Vite) uses redirects for HMR; allow them.
  if (!isDev) {
    mainWindow.webContents.on('will-redirect', (event, url) => {
      event.preventDefault();
    });
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Only allow https:// external URLs; everything else is internal.
    if (/^https:\/\//i.test(url)) { shell.openExternal(url); return { action: 'deny' }; }
    createChildWindow(url);
    return { action: 'deny' };
  });

  if (isDev) {
    mainWindow.loadURL(DEV_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(getDistIndex());
  }

  setupUnsavedGuard(mainWindow);
  setupMaximizeListener(mainWindow);

  // Persist window state on close (P4-4)
  mainWindow.on('close', () => {
    try {
      const bounds = mainWindow.getBounds()
      const isMax = mainWindow.isMaximized()
      const statePath = path.join(CHRONICLE_DIR, 'state.json')
      let state = {}
      try { state = JSON.parse(fs.readFileSync(statePath, 'utf-8')) } catch {}
      state.window = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, isMaximized: isMax }
      fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n', 'utf-8')
    } catch {}
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── Menu ────────────────────────────────────────────────────
if (Menu) {
  const viewSubmenu = isDev
    ? [{ role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' }]
    : [{ role: 'reload' }, { role: 'forceReload' }, { type: 'separator' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' }];

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'File', submenu: [{ role: 'quit', label: 'Quit Chronicle' }] },
    { label: 'Edit', submenu: [
      { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
      { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
    ]},
    { label: 'View', submenu: viewSubmenu },
    { label: 'Help', submenu: [
      { label: 'Chronicle Docs', click: () => shell.openExternal('https://github.com/vanvanhasnophi/chronicle-aurora') },
    ]},
  ]));
}

// ── Window Controls (frameless) ─────────────────────────────
// Each call targets the window that sent the IPC, not just mainWindow.
ipcMain.on('window-minimize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.minimize();
});

ipcMain.on('window-maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  if (win.isMaximized()) {
    win.unmaximize();
  } else {
    win.maximize();
  }
});

ipcMain.on('window-close', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.close();
});

ipcMain.handle('window-is-maximized', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  return win ? win.isMaximized() : false;
});

// Notify renderer when maximize state changes
function setupMaximizeListener(win) {
  win.on('maximize', () => {
    win.webContents.send('window-maximize-change', true);
  });
  win.on('unmaximize', () => {
    win.webContents.send('window-maximize-change', false);
  });
}

// Handle protocol URL on macOS (open-url event)
app.on('open-url', (event, url) => {
  event.preventDefault();
});

// Handle protocol URL on Windows/Linux (second-instance or argv)
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, argv) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// IPC: write print HTML to temp file and open in system browser
ipcMain.handle('open-print-in-browser', async (event, html, title) => {
  // Reject oversized payloads (max ~2 MB of HTML)
  if (typeof html !== 'string' || html.length > 2 * 1024 * 1024) return;
  if (typeof title !== 'string') title = 'chronicle-print';

  const tmpDir = require('os').tmpdir();
  const safeTitle = title.replace(/[^a-zA-Z0-9一-鿿_-]/g, '_').slice(0, 60);
  const fileName = `chronicle-print-${safeTitle}-${Date.now()}.html`;
  const filePath = path.join(tmpDir, fileName);
  fs.writeFileSync(filePath, html, 'utf-8');
  shell.openPath(filePath);
});

// IPC: read a local file by absolute path → base64.
// Used by the editor to recover File objects from file:/// URLs
// when fileMap is empty (page refresh). Bypasses fetch('file:///...')
// which fails in dev mode (http→file SOP) and may fail in production.
ipcMain.handle('read-file-by-path', async (event, absPath) => {
  if (typeof absPath !== 'string' || !absPath) return null;
  try {
    // Security: only allow absolute paths, reject protocol-style paths
    if (!path.isAbsolute(absPath)) return null;
    // Reject paths larger than 4KB (not a real path)
    if (absPath.length > 4096) return null;
    // Read and return as base64 — renderer decodes back to Blob → File
    const buf = fs.readFileSync(absPath);
    return buf.toString('base64');
  } catch { return null; }
});

// ═══════════════════════════════════════════════════════════════
// File system IPC handlers (replaces Host API)
//
// All paths from the renderer are relative to the repository root.
// The main process resolves them to absolute paths and enforces
// that they stay within the repo root — no path traversal.
// ═══════════════════════════════════════════════════════════════

function findRepoRoot() {
  // Start from the manager package and walk up until we find
  // a directory containing both "data/" and "packages/".
  let dir = path.join(__dirname, '..', '..', '..')  // packages/manager/electron → repo root
  dir = path.resolve(dir)
  if (fs.existsSync(path.join(dir, 'data')) && fs.existsSync(path.join(dir, 'packages'))) {
    return dir
  }
  // Fallback: walk up from __dirname
  dir = __dirname
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, 'data')) && fs.existsSync(path.join(dir, 'packages'))) {
      return dir
    }
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  throw new Error('Cannot find repository root (looking for data/ + packages/)')
}

const REPO_ROOT = findRepoRoot()
const DATA_DIR = path.join(REPO_ROOT, 'data')
const CHRONICLE_DIR = path.join(REPO_ROOT, '.chronicle')

console.log('[chronicle] Repo root:', REPO_ROOT)

function resolveRepoPath(relativePath) {
  // Normalize: strip leading slashes, resolve relative components
  const normalized = path.normalize(relativePath.replace(/^[/\\]+/, ''))
  // Security: reject paths that escape the repo root
  const absPath = path.join(REPO_ROOT, normalized)
  if (!absPath.startsWith(REPO_ROOT + path.sep) && absPath !== REPO_ROOT) {
    throw new Error(`Path traversal rejected: ${relativePath}`)
  }
  return absPath
}

// ── YAML ──────────────────────────────────────────────────

ipcMain.handle('fs:readYaml', async (_event, relativePath) => {
  try {
    const absPath = resolveRepoPath(relativePath)
    if (!fs.existsSync(absPath)) return null
    const content = fs.readFileSync(absPath, 'utf-8')
    return yaml.load(content) ?? null
  } catch (e) {
    console.error('[fs:readYaml]', e.message)
    return null
  }
})

ipcMain.handle('fs:writeYaml', async (_event, relativePath, data) => {
  try {
    const absPath = resolveRepoPath(relativePath)
    const dir = path.dirname(absPath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o775 })
    // Serialization options must stay in sync with renderer dataAccess.writeYaml (YAML.stringify).
    // Note: yaml 2.9 has no 'noRefs' option for dump() — lineWidth: -1 disables wrapping.
    const content = yaml.dump(data, { lineWidth: -1 })
    fs.writeFileSync(absPath, content, 'utf-8')
    return true
  } catch (e) {
    console.error('[fs:writeYaml]', e.message)
    return false
  }
})

// ── JSON ──────────────────────────────────────────────────

ipcMain.handle('fs:readJson', async (_event, relativePath) => {
  try {
    const absPath = resolveRepoPath(relativePath)
    if (!fs.existsSync(absPath)) return null
    const content = fs.readFileSync(absPath, 'utf-8')
    return JSON.parse(content)
  } catch (e) {
    console.error('[fs:readJson]', e.message)
    return null
  }
})

ipcMain.handle('fs:writeJson', async (_event, relativePath, data) => {
  try {
    const absPath = resolveRepoPath(relativePath)
    const dir = path.dirname(absPath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o775 })
    fs.writeFileSync(absPath, JSON.stringify(data, null, 2) + '\n', 'utf-8')
    return true
  } catch (e) {
    console.error('[fs:writeJson]', e.message)
    return false
  }
})

// ── Directory / existence ─────────────────────────────────

ipcMain.handle('fs:readDir', async (_event, relativePath) => {
  try {
    const absPath = resolveRepoPath(relativePath)
    if (!fs.existsSync(absPath)) return []
    return fs.readdirSync(absPath, { withFileTypes: true })
      .filter(e => !e.name.startsWith('.'))
      .map(e => e.name)
  } catch (e) {
    console.error('[fs:readDir]', e.message)
    return []
  }
})

ipcMain.handle('fs:exists', async (_event, relativePath) => {
  try {
    const absPath = resolveRepoPath(relativePath)
    return fs.existsSync(absPath)
  } catch (e) {
    return false
  }
})

ipcMain.handle('fs:deletePlugin', async (_event, pluginKey) => {
    // 专用删除：只允许 packages/template-astro/src/plugins/<key>，key 白名单校验防穿越
    if (typeof pluginKey !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(pluginKey)) return false
    const rel = path.join('packages', 'template-astro', 'src', 'plugins', pluginKey)
    const abs = resolveRepoPath(rel)
    if (!abs) return false
    try {
      if (existsSync(abs)) { rmSync(abs, { recursive: true, force: true }); return true }
    } catch { return false }
    return false
  })
  ipcMain.handle('fs:mkdir', async (_event, relativePath) => {
  try {
    const absPath = resolveRepoPath(relativePath)
    if (!fs.existsSync(absPath)) {
      fs.mkdirSync(absPath, { recursive: true, mode: 0o775 })
    }
    return true
  } catch (e) {
    console.error('[fs:mkdir]', e.message)
    return false
  }
})

// ── Path info ─────────────────────────────────────────────

ipcMain.handle('fs:getRepoRoot', async () => REPO_ROOT)
ipcMain.handle('fs:getDataDir', async () => DATA_DIR)


// ── Git (commit = save, push = deploy) ─────────────────────
const { execFile } = require('child_process');
function runGit(args, cwd) {
  return new Promise((resolve) => {
    execFile('git', args, { cwd, timeout: 120000, maxBuffer: 10 * 1024 * 1024, encoding: 'utf-8' }, (err, stdout, stderr) => {
      if (err) resolve({ ok: false, message: String(stderr || err.message || '').trim() })
      else resolve({ ok: true, stdout: String(stdout || '').trim() })
    })
  })
}

ipcMain.handle('git:status', async () => {
  const status = await runGit(['status', '--porcelain'], REPO_ROOT)
  const branch = await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], REPO_ROOT)
  return { ok: status.ok, dirty: status.ok && status.stdout.length > 0, branch: branch.ok ? branch.stdout : '', message: status.ok ? '' : status.message }
})

ipcMain.handle('git:sync', async (_event, opts = {}) => {
  const add = await runGit(['add', '-A'], REPO_ROOT)
  if (!add.ok) return { ok: false, message: add.message, commits: 0, pushed: false }
  const staged = await runGit(['diff', '--cached', '--quiet'], REPO_ROOT)
  if (staged.ok) return { ok: true, commits: 0, pushed: false, message: 'Nothing to commit' }
  // Commit message from workspace.json gitCommitTemplate ({title}/{slug} replaced).
  let ws = {}
  try { ws = JSON.parse(fs.readFileSync(path.join(CHRONICLE_DIR, 'workspace.json'), 'utf-8')) } catch {}
  const template = typeof ws.gitCommitTemplate === 'string' && ws.gitCommitTemplate.trim() ? ws.gitCommitTemplate : 'Update: {title}'
  const message = template.replace(/\{title\}/g, String((opts && opts.title) || '')).replace(/\{slug\}/g, String((opts && opts.slug) || ''))
  const commit = await runGit(['commit', '-m', message], REPO_ROOT)
  if (!commit.ok) return { ok: false, message: commit.message, commits: 0, pushed: false }
  const doPush = (opts && opts.push === true) || ws.gitAutoPush === true
  let pushed = false
  if (doPush) {
    const push = await runGit(['push'], REPO_ROOT)
    if (!push.ok) return { ok: true, commits: 1, pushed: false, message: 'Committed, but push failed: ' + push.message }
    pushed = true
  }
  return { ok: true, commits: 1, pushed, message: 'Committed' + (pushed ? ' and pushed' : '') }
})


/**
 * Auto-commit after saving a post/about markdown when workspace.json has
 * gitAutoCommit enabled (Electron side — mirrors the dev plugin's hook).
 * Push only when gitAutoPush is also enabled. Failures are non-fatal.
 */
function maybeAutoGitCommit(relativePath, content) {
  try {
    if (!/^data\/(?:posts\/[^/]+|__about__)\/index\.md$/.test(String(relativePath))) return
    const ws = JSON.parse(fs.readFileSync(path.join(CHRONICLE_DIR, 'workspace.json'), 'utf-8'))
    if (ws.gitAutoCommit !== true) return
    const slug = String(relativePath).includes('__about__') ? '__about__' : String(relativePath).split('/')[2]
    const m = String(content || '').match(/^title:\s*(.+)$/m)
    const title = m ? m[1].trim() : ''
    const template = typeof ws.gitCommitTemplate === 'string' && ws.gitCommitTemplate.trim() ? ws.gitCommitTemplate : 'Update: {title}'
    const message = template.replace(/\{title\}/g, title).replace(/\{slug\}/g, slug)
    execFile('git', ['add', '-A'], { cwd: REPO_ROOT }, () => {
      execFile('git', ['commit', '-m', message], { cwd: REPO_ROOT }, (err) => {
        if (err) return
        if (ws.gitAutoPush === true) execFile('git', ['push'], { cwd: REPO_ROOT }, () => {})
      })
    })
  } catch {}
}

// ── Storage stats (Dashboard) ──
ipcMain.handle('fs:getStorageStats', async () => {
  // Mirror the dev plugin's /api/storage shape: { total, categories, labels }
  const CATS = { images: 0, videos: 0, audio: 0, documents: 0, config: 0, other: 0 }
  const EXT = {
    images: ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.svg', '.ico'],
    videos: ['.mp4', '.webm', '.mov', '.avi', '.mkv'],
    audio: ['.mp3', '.wav', '.ogg', '.flac', '.aac'],
    documents: ['.md', '.html', '.txt', '.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.csv'],
    config: ['.yml', '.yaml', '.json'],
  }
  let total = 0
  function walk(dir) {
    try {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name)
        if (e.isDirectory()) { walk(p); continue }
        const size = fs.statSync(p).size; total += size
        const ext = path.extname(e.name).toLowerCase()
        let cat = 'other'
        for (const [k, exts] of Object.entries(EXT)) { if (exts.includes(ext)) { cat = k; break } }
        CATS[cat] += size
      }
    } catch {}
  }
  walk(DATA_DIR)
  return { total, categories: CATS, labels: { images: 'Images', videos: 'Videos', audio: 'Audio', documents: 'Documents', config: 'Config', other: 'Other' } }
})

// ── Rebuild post index (canonical indexer from gen) ──
ipcMain.handle('posts:reindex', async () => {
  try {
    const mod = await import(path.join(REPO_ROOT, 'packages', 'gen', 'src', 'builder', 'indexer.mjs'))
    const count = mod.rebuildPostIndex(DATA_DIR)
    return { ok: true, count }
  } catch (e) {
    return { ok: false, message: String((e && e.message) || e) }
  }
})

// ── First-run initialization ────────────────────────────────────
// Ensure .chronicle/ exists with default workspace files, and
// migrate legacy settings.json → data/site.yml + .chronicle/workspace.json
// when the new format files are missing but the old one is present.

const WORKSPACE_SCHEMA_PATH = path.join(__dirname, '..', 'schemas', 'system-settings.schema.json');

/**
 * Recursive schema → defaults. Same rules as scripts/lib/schema-defaults.mjs
 * and manager/src/composables/useSchemaForm.ts, so a fresh `.chronicle/` boots
 * with exactly the values the settings UI would show.
 */
function buildSchemaDefaults(schema) {
  if (schema?.type === 'array') return [];
  const out = {};
  for (const [key, prop] of Object.entries(schema?.properties || {})) {
    const p = prop || {};
    if (p.default !== undefined) out[key] = JSON.parse(JSON.stringify(p.default));
    else if (p.type === 'object') out[key] = buildSchemaDefaults(p);
    else if (p.type === 'array') out[key] = [];
    else if (p.type === 'boolean') out[key] = false;
    else if (p.type === 'number' || p.type === 'integer') out[key] = 0;
    else out[key] = '';
  }
  return out;
}

/** .chronicle/workspace.json defaults (schema-driven; see T3 in the assessment). */
function buildWorkspaceDefaults() {
  let defaults;
  try {
    const schema = JSON.parse(fs.readFileSync(WORKSPACE_SCHEMA_PATH, 'utf-8'));
    defaults = buildSchemaDefaults(schema);
  } catch (e) {
    console.warn('[chronicle] Could not read system-settings schema, using minimal defaults:', e.message);
    defaults = { backendTheme: 'dark', backendAccent: '#2ea35f', backendFont: 'sans', backendLocale: 'en' };
  }
  // Component-held background meta (kept in sync with scripts/reset-cms.mjs).
  defaults.backendBackgroundMeta = {
    mode: 'cover', posX: 50, posY: 50, size: 100, blur: 0,
    overlayLightColor: '#000000', overlayLightOpacity: 0,
    overlayDarkColor: '#000000', overlayDarkOpacity: 0,
    videoAutoplay: true, videoLoop: true, videoPlaybackRate: 1,
  };
  return defaults;
}

function ensureChronicleDir() {
  if (!fs.existsSync(CHRONICLE_DIR)) {
    fs.mkdirSync(CHRONICLE_DIR, { recursive: true, mode: 0o775 })
    fs.mkdirSync(path.join(CHRONICLE_DIR, 'thumbs'), { recursive: true, mode: 0o775 })
  }

  // Create defaults if missing
  const workspacePath = path.join(CHRONICLE_DIR, 'workspace.json')
  if (!fs.existsSync(workspacePath)) {
    const defaults = buildWorkspaceDefaults()
    fs.writeFileSync(workspacePath, JSON.stringify(defaults, null, 2) + '\n', 'utf-8')
    console.log('[chronicle] Created default workspace from settings schema:', workspacePath)
  }

  const statePath = path.join(CHRONICLE_DIR, 'state.json')
  if (!fs.existsSync(statePath)) {
    const defaults = {
      window: { x: null, y: null, width: 1400, height: 900, isMaximized: false },
      lastOpenedPost: null,
      sidebarCollapsed: false,
      settingsTab: null,
    }
    fs.writeFileSync(statePath, JSON.stringify(defaults, null, 2) + '\n', 'utf-8')
  }

  const recentPath = path.join(CHRONICLE_DIR, 'recently-opened.json')
  if (!fs.existsSync(recentPath)) {
    fs.writeFileSync(recentPath, '[]\n', 'utf-8')
  }
}

function runDataMigration() {
  const settingsPath = path.join(DATA_DIR, 'settings.json')
  const siteYmlPath = path.join(DATA_DIR, 'site.yml')

  // Migration: settings.json exists but site.yml doesn't — split into two files
  if (!fs.existsSync(settingsPath)) return
  if (fs.existsSync(siteYmlPath)) return  // already migrated

  console.log('[chronicle] Running data migration: settings.json → site.yml + workspace.json')

  try {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))

    // Frontend fields → data/site.yml
    const siteFields = {
      siteName: settings.siteName,
      siteDescription: settings.siteDescription,
      homepageMode: settings.homepageMode,
      singleColumnHomepage: settings.singleColumnHomepage,
      cardVisibility: settings.cardVisibility,
      frontendTheme: settings.frontendTheme,
      frontendAccent: settings.frontendAccent,
      frontendFont: settings.frontendFont,
      frontendLocale: settings.frontendLocale,
      defaultPerformanceMode: settings.defaultPerformanceMode,
      frontendBackground: settings.frontendBackground,
      frontendBackgroundMeta: settings.frontendBackgroundMeta,
      frontendBackgroundCompression: settings.frontendBackgroundCompression,
      collectionPage: settings.collectionPage,
      aboutPage: settings.aboutPage,
      friendsPage: settings.friendsPage,
      rss: settings.rss,
      sitemap: settings.sitemap,
      searchSuggestions: settings.searchSuggestions,
      relatedPosts: settings.relatedPosts,
      traffic: settings.traffic,
      gaMeasurementId: settings.gaMeasurementId,
      icpNumber: settings.icpNumber,
      comment: settings.comment,
    }
    const siteYml = yaml.dump(siteFields, { lineWidth: -1, noRefs: true })
    fs.writeFileSync(siteYmlPath, siteYml, 'utf-8')
    console.log('[chronicle] Created data/site.yml')

    // Backend fields → .chronicle/workspace.json
    const workspacePath = path.join(CHRONICLE_DIR, 'workspace.json')
    const workspaceFields = {
      backendTheme: settings.backendTheme,
      backendAccent: settings.backendAccent,
      backendFont: settings.backendFont,
      backendLocale: settings.backendLocale,
      backendBackground: settings.backendBackground,
      backendBackgroundMeta: settings.backendBackgroundMeta,
      backendBackgroundCompression: settings.backendBackgroundCompression,
      frontendCodeDir: settings.frontendCodeDir,
      frontendBuildTargetDir: settings.frontendBuildTargetDir,
      autoBuildOnPublish: settings.autoBuildOnPublish,
      buildGranularity: settings.buildGranularity,
      scheduledBuildEnabled: settings.scheduledBuildEnabled,
      scheduledBuildMode: settings.scheduledBuildMode,
      scheduledBuildMinute: settings.scheduledBuildMinute,
      scheduledBuildHour: settings.scheduledBuildHour,
      scheduledBuildWeekday: settings.scheduledBuildWeekday,
      scheduledBuildCron: settings.scheduledBuildCron,
      frontendUrl: settings.frontendUrl,
    }
    fs.writeFileSync(workspacePath, JSON.stringify(workspaceFields, null, 2) + '\n', 'utf-8')
    console.log('[chronicle] Updated .chronicle/workspace.json')

    // Rename settings.json → settings.json.bak so migration doesn't re-run
    fs.renameSync(settingsPath, settingsPath + '.bak')
    console.log('[chronicle] Migration complete — settings.json → settings.json.bak')
  } catch (e) {
    console.error('[chronicle] Migration failed:', e.message)
  }

  // JSON → YAML conversions: rename each .json → .json.bak once .yml exists
  const jsonToYml = ['profile', 'friends', 'collections']
  for (const name of jsonToYml) {
    const jsonPath = path.join(DATA_DIR, `${name}.json`)
    const ymlPath = path.join(DATA_DIR, `${name}.yml`)
    if (fs.existsSync(jsonPath) && fs.existsSync(ymlPath)) {
      try {
        fs.renameSync(jsonPath, jsonPath + '.bak')
        console.log(`[chronicle] Renamed ${name}.json → ${name}.json.bak`)
      } catch (e) {
        console.error(`[chronicle] Failed to rename ${name}.json:`, e.message)
      }
    }
  }

  // Migrate legacy UUID-based post directories → slug-based
  // UUID directories (32 hex chars) renamed to .bak after content is in slug dirs
  const postsDir = path.join(DATA_DIR, 'posts')
  if (fs.existsSync(postsDir)) {
    try {
      const entries = fs.readdirSync(postsDir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue
        // UUID dirs are exactly 32 hex chars
        if (/^[a-f0-9]{32}$/.test(entry.name)) {
          const oldPath = path.join(postsDir, entry.name)
          const bakPath = oldPath + '.bak'
          if (!fs.existsSync(bakPath)) {
            fs.renameSync(oldPath, bakPath)
            console.log(`[chronicle] Renamed legacy post dir: ${entry.name} → ${entry.name}.bak`)
          }
        }
      }
    } catch (e) {
      console.error('[chronicle] Post dir migration failed:', e.message)
    }
  }
}

// ── Run initialization ──────────────────────────────────────
ensureChronicleDir()
runDataMigration()

// ── Raw text (for markdown, HTML, etc.) ──────────────────

ipcMain.handle('fs:readText', async (_event, relativePath) => {
  try {
    const absPath = resolveRepoPath(relativePath)
    if (!fs.existsSync(absPath)) return null
    return fs.readFileSync(absPath, 'utf-8')
  } catch (e) {
    console.error('[fs:readText]', e.message)
    return null
  }
})

ipcMain.handle('fs:writeText', async (_event, relativePath, content) => {
  try {
    const absPath = resolveRepoPath(relativePath)
    const dir = path.dirname(absPath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o775 })
    fs.writeFileSync(absPath, String(content), 'utf-8')
    maybeAutoGitCommit(relativePath, content)
    return true
  } catch (e) {
    console.error('[fs:writeText]', e.message)
    return false
  }
})

// ── Delete (directories and files) ────────────────────────

ipcMain.handle('fs:deleteDir', async (_event, relativePath) => {
  try {
    // Resolve asset:// protocol → data/assets/
    if (relativePath.startsWith('asset://')) {
      relativePath = path.join('data', 'assets', relativePath.slice('asset://'.length))
    }
    const absPath = resolveRepoPath(relativePath)
    if (!fs.existsSync(absPath)) return true
    fs.rmSync(absPath, { recursive: true, force: true })
    return true
  } catch (e) {
    console.error('[fs:deleteDir]', e.message)
    return false
  }
})

ipcMain.handle('fs:deleteFile', async (_event, relativePath) => {
  try {
    // Resolve asset:// protocol → data/assets/
    if (relativePath.startsWith('asset://')) {
      relativePath = path.join('data', 'assets', relativePath.slice('asset://'.length))
    }
    const absPath = resolveRepoPath(relativePath)
    if (!fs.existsSync(absPath)) return true
    fs.unlinkSync(absPath)
    return true
  } catch (e) {
    console.error('[fs:deleteFile]', e.message)
    return false
  }
})

// ── Auto-copy background/avatar to canonical directory ─────

ipcMain.handle('fs:autoCopyBg', async (_event, sourceUrl, targetRelDir, stem) => {
  try {
    const src = path.resolve(REPO_ROOT, String(sourceUrl).replace(/^\/+/, ''))
    if (!fs.existsSync(src)) return null
    const targetDir = path.resolve(REPO_ROOT, String(targetRelDir).replace(/^\/+/, ''))
    if (src.startsWith(targetDir)) return null // already in target dir
    const ext = path.extname(src)
    const destAbs = path.join(targetDir, `${stem}${ext}`)
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true, mode: 0o775 })
    // Remove old images in target dir
    for (const e of fs.readdirSync(targetDir, { withFileTypes: true })) {
      if (e.isFile() && /\.(jpg|jpeg|png|webp|avif|gif|svg)$/i.test(e.name)) {
        fs.unlinkSync(path.join(targetDir, e.name))
      }
    }
    fs.copyFileSync(src, destAbs)
    const relResult = `/${path.relative(REPO_ROOT, destAbs)}`
    console.log('[chronicle] autoCopyBg:', path.basename(src), '→', relResult)
    return relResult
  } catch (e) {
    console.error('[fs:autoCopyBg]', e.message)
    return null
  }
})

// ── Copy file (for background/avatar/favicon) ─────────────

ipcMain.handle('fs:copyFile', async (_event, sourceAbs, destRel) => {
  try {
    if (typeof sourceAbs !== 'string' || !sourceAbs) return false
    if (typeof destRel !== 'string' || !destRel) return false
    // Resolve asset:// protocol → data/assets/
    if (sourceAbs.startsWith('asset://')) {
      sourceAbs = path.join(DATA_DIR, 'assets', sourceAbs.slice('asset://'.length))
    }
    const destAbs = resolveRepoPath(destRel)
    const destDir = path.dirname(destAbs)
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true, mode: 0o775 })
    fs.copyFileSync(sourceAbs, destAbs)
    // Replace any existing file with same purpose but different name
    const ext = path.extname(destAbs)
    const baseName = path.basename(destAbs, ext)
    const entries = fs.readdirSync(destDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isFile()) continue
      if (entry.name === path.basename(destAbs)) continue
      const eName = path.basename(entry.name, path.extname(entry.name))
      if (eName !== baseName) {
        const eExt = path.extname(entry.name).toLowerCase()
        if (['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.svg', '.ico'].includes(eExt)) {
          fs.unlinkSync(path.join(destDir, entry.name))
        }
      }
    }
    console.log('[chronicle] Copied file:', path.basename(sourceAbs), '→', destRel)
    return true
  } catch (e) {
    console.error('[fs:copyFile]', e.message)
    return false
  }
})

// ── Base64 write (for file uploads from renderer) ─────────

ipcMain.handle('fs:writeBase64', async (_event, relativePath, base64) => {
  try {
    const absPath = resolveRepoPath(relativePath)
    const dir = path.dirname(absPath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o775 })
    const buf = Buffer.from(base64, 'base64')
    fs.writeFileSync(absPath, buf)
    return true
  } catch (e) {
    console.error('[fs:writeBase64]', e.message)
    return false
  }
})

// ── Background compression (local) ─────────────────────────

ipcMain.handle('build:compress-background', async (_event, options) => {
  // Image compression is primarily a CI/CD concern.
  // In local dev mode, return a skipped result — the actual
  // compression happens in the build pipeline.
  console.log('[chronicle] Background compress requested (deferred to CI/CD):', options?.background?.sourcePath || 'unknown')
  return { success: true, skipped: true, message: 'Compression deferred to CI/CD build pipeline' }
})

// ── Background video conversion (compress + poster) ────────

ipcMain.handle('video:convert-background', async (_event, options) => {
  try {
    const { sourceUrl, posterExt, crf, maxHeight } = options || {}
    if (!sourceUrl) return { success: false, error: 'Missing sourceUrl' }
    // Resolve asset:// protocol → data/assets/
    let srcRel = String(sourceUrl).replace(/^[/\\]+/, '')
    if (srcRel.startsWith('asset://')) srcRel = path.join('data', 'assets', srcRel.slice('asset://'.length))
    const srcAbs = resolveRepoPath(srcRel)
    const targetDir = path.join(DATA_DIR, 'background')
    const result = await convertBackgroundVideo(srcAbs, targetDir, { posterExt, crf, maxHeight })
    if (!result) return { success: false, error: 'ffmpeg unavailable or conversion failed' }
    return { success: true, ...result }
  } catch (e) {
    console.error('[video:convert-background]', e.message)
    return { success: false, error: e.message }
  }
})

// ── Build trigger ──────────────────────────────────────────

ipcMain.handle('build:astro', async (_event, options) => {
  const { codeDir, granularity } = options || {}
  const buildDir = codeDir || path.join(REPO_ROOT, 'packages', 'template-astro')

  console.log('[chronicle] Build triggered:', buildDir, granularity || 'full')

  try {
    const { execSync } = require('child_process')
    const result = execSync('npx astro build', {
      cwd: buildDir,
      stdio: 'pipe',
      env: process.env,
      timeout: 300000, // 5 min timeout
    })
    console.log('[chronicle] Build completed successfully')
    return { success: true, output: result.toString() }
  } catch (e) {
    console.error('[chronicle] Build failed:', e.message)
    return { success: false, error: e.message, stderr: e.stderr?.toString() ?? '' }
  }
})

// ── Content Security Policy ────────────────────────────────────
// Restrict what the renderer can load and execute. The CSP is
// applied to all file:// and internal pages.
app.on('web-contents-created', (event, contents) => {
  contents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': isDev
          ? ["default-src 'self' http://localhost:* ws://localhost:*; style-src 'self' 'unsafe-inline' http://localhost:*; script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:*; img-src 'self' data: blob: file: http://localhost:* https:; media-src 'self' file: http://localhost:* https:; object-src 'self' file: https:; frame-src 'self' https:; font-src 'self' http://localhost:*; connect-src 'self' file: http://localhost:* ws://localhost:* https:"]
          : ["default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; img-src 'self' data: blob: file: https:; media-src 'self' file: https:; object-src 'self' file: https:; frame-src 'self' https:; font-src 'self'; connect-src 'self' file: https://*"],
      },
    });
  });
});

// ── App Lifecycle ───────────────────────────────────────────
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});
