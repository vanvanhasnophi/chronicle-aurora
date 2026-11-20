import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import chronicleData from './vite-data.mjs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))
// Single source of truth for the app version: the root package.json.
const rootPkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf-8'))
const VERSION = rootPkg.version || pkg.version
const __dirname = fileURLToPath(new URL('.', import.meta.url))
const sharedPath = resolve(__dirname, '..', 'shared')
const repoRoot = resolve(__dirname, '..', '..')

// Electron build: `vite build --mode electron`.
// (The old `ELECTRON=true vite build` prefix is cmd.exe syntax error on Windows,
// which is why `npm run electron:build` never produced a package there.)
export default defineConfig(({ mode }) => {
  const isElectron = mode === 'electron' || !!process.env.ELECTRON

  return {
    plugins: [
      vue(),
      chronicleData(),
      { name: 'fix-font-paths', transformIndexHtml(html: string) { return isElectron ? html.replace('/fonts/', './fonts/') : html } },
    ],
    resolve: {
      alias: {
        // 统一约定：import 一律 @chronicle/shared/src/...（与 template-astro 一致）
        '@chronicle/shared': resolve(sharedPath),
      },
    },
    base: isElectron ? './' : '/',
    define: {
      __VERSION__: JSON.stringify(VERSION),
      __YEAR__: JSON.stringify(new Date().getFullYear()),
      // Survives in the bundle: lets you tell WHICH build a running window is.
      __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    },
    server: {
      // The CMS dev URL is documented as :5173 and the editor window / bookmarks
      // point at it. Silent auto-increment (:5174, :5175 …) leaves an old tab
      // talking to a stale server, so fail loudly instead.
      port: 5173,
      strictPort: true,
      fs: { strict: false, allow: [repoRoot, resolve(__dirname, '..', 'template-astro'), sharedPath] },
      proxy: {
        // Proxy /api/* to a mini Express handler that does CRUD on the filesystem
      },
    },
  }
})
