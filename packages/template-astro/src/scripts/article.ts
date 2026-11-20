/**
 * Article page interactive features.
 * Extracted from inline script to defer parsing and enable caching.
 *
 * Features: code copy, image viewer, Mermaid code block interactions.
 */

// ── Page lifecycle scope ──────────────────────────────────
interface ScopeEntry { t: EventTarget; ev: string; fn: EventListener; opts?: any }
let scope: { destroy(): void } | null = null;

function createScope() {
  const listeners: ScopeEntry[] = [];
  const bodyNodes: HTMLElement[] = [];
  return {
    on(ev: string, fn: EventListener, opts?: any) {
      document.addEventListener(ev, fn, opts);
      listeners.push({ t: document, ev, fn, opts });
    },
    onEl(el: EventTarget, ev: string, fn: EventListener, opts?: any) {
      el.addEventListener(ev, fn, opts);
      listeners.push({ t: el, ev, fn, opts });
    },
    toBody(el: HTMLElement) {
      document.body.appendChild(el);
      bodyNodes.push(el);
    },
    destroy() {
      listeners.forEach(l => l.t.removeEventListener(l.ev, l.fn, l.opts));
      listeners.length = 0;
      bodyNodes.forEach(el => el.remove());
      bodyNodes.length = 0;
    },
  };
}

// ── Code copy ─────────────────────────────────────────────
function showCopyInProgress(button: HTMLElement) {
  const copyIcon = button.querySelector('.copy-icon') as HTMLElement;
  if (copyIcon) copyIcon.style.opacity = '0.4';
  button.classList.add('copying');
}

function clearCopyInProgress(button: HTMLElement) {
  const copyIcon = button.querySelector('.copy-icon') as HTMLElement;
  if (copyIcon) copyIcon.style.opacity = '';
  button.classList.remove('copying');
}

function showCopySuccess(button: HTMLElement) {
  const copyIcon = button.querySelector('.copy-icon') as HTMLElement;
  const successIcon = button.querySelector('.success-icon') as HTMLElement;
  if (copyIcon) copyIcon.style.display = 'none';
  if (successIcon) successIcon.style.display = 'block';
  button.classList.add('success');
  setTimeout(() => {
    if (copyIcon) copyIcon.style.display = 'block';
    if (successIcon) successIcon.style.display = 'none';
    button.classList.remove('success');
  }, 1500);
}

function tryFallbackCopy(button: HTMLElement, code: string) {
  const textArea = document.createElement('textarea');
  textArea.value = code;
  textArea.style.position = 'fixed';
  textArea.style.left = '-9999px';
  document.body.appendChild(textArea);
  textArea.select();
  try {
    const successful = document.execCommand('copy');
    if (successful) {
      clearCopyInProgress(button);
      showCopySuccess(button);
    } else {
      clearCopyInProgress(button);
      console.error('Fallback copy failed');
    }
  } catch (backupErr) {
    clearCopyInProgress(button);
    console.error('复制失败:', backupErr);
  } finally {
    document.body.removeChild(textArea);
  }
}

function copyCode(button: HTMLElement) {
  const code = button.getAttribute('data-code');
  if (!code) return;
  showCopyInProgress(button);
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    navigator.clipboard.writeText(code).then(() => {
      clearCopyInProgress(button);
      showCopySuccess(button);
    }).catch(() => {
      tryFallbackCopy(button, code);
    });
    return;
  }
  tryFallbackCopy(button, code);
}

// ── Mermaid UI helpers ────────────────────────────────────
interface MermaidUiText {
  downloadSvg: string;
  split: string;
  code: string;
  preview: string;
  notPrerendered: string;
}

function getMermaidUiText(): MermaidUiText {
  const fallback: MermaidUiText = {
    downloadSvg: 'Download SVG',
    split: 'Split View',
    code: 'Code Only',
    preview: 'Preview Only',
    notPrerendered: 'No prerendered Mermaid SVG found.',
  };
  try {
    const el = document.querySelector('.post-content') as HTMLElement | null;
    const raw = el?.dataset.mermaidUi;
    if (raw) {
      const ui = JSON.parse(raw);
      return {
        downloadSvg: String(ui.downloadSvg || fallback.downloadSvg),
        split: String(ui.split || fallback.split),
        code: String(ui.code || fallback.code),
        preview: String(ui.preview || fallback.preview),
        notPrerendered: String(ui.notPrerendered || fallback.notPrerendered),
      };
    }
  } catch {}
  return fallback;
}

function initMermaidCodeBlocks() {
  const ui = getMermaidUiText();
  const blocks = document.querySelectorAll('.code-chunk-container.mermaid');
  if (!blocks || blocks.length === 0) return;

  /**
   * Mermaid measures label boxes with the font family from its config, while the
   * stylesheet renders SVG text with the app stack. Both must be the same family
   * or the box comes out a few pixels narrow and the label's tail gets clipped.
   */
  const appFontStack = (() => {
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue('--app-font-stack').trim();
      if (v) return v;
    } catch {}
    return 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
  })();

  blocks.forEach((block: Element) => {
    if (!(block instanceof HTMLElement)) return;
    if (block.dataset.mermaidEnhanced === '1') return;

    const editorWrapper = block.querySelector('.editor-wrapper') as HTMLElement | null;
    const editorFooter = block.querySelector('.editor-footer') as HTMLElement | null;
    if (!(editorWrapper instanceof HTMLElement)) return;

    // Raw source comes from the copy button's data-code (same unescaped text as
    // the old <textarea>, which no longer exists in the markup). The <pre> only
    // holds highlighted HTML — not usable as a source for re-rendering.
    const copyBtn = block.querySelector('.copy-btn') as HTMLElement | null;
    const codeText = copyBtn?.dataset.code || '';
    if (!codeText.trim()) return;

    block.dataset.mermaidEnhanced = '1';

    const preview = block.querySelector('.mermaid-preview') as HTMLElement | null;
    const container = preview?.querySelector('.mermaid-container') as HTMLElement | null;
    let downloadBtn = block.querySelector('.mermaid-download-btn') as HTMLElement | null;
    let splitBtn   = block.querySelector('.mermaid-split-btn') as HTMLElement | null;
    let codeBtn    = block.querySelector('.mermaid-code-btn') as HTMLElement | null;
    let previewBtn = block.querySelector('.mermaid-preview-btn') as HTMLElement | null;

    const preSvg = container?.querySelector('svg');
    let lastRenderedSvg: string | null = preSvg ? preSvg.outerHTML : null;
    if (lastRenderedSvg && downloadBtn) (downloadBtn as HTMLButtonElement).disabled = false;

    let mode: 'split' | 'code' | 'preview' = 'preview';

    function setActiveButton() {
      splitBtn?.classList.toggle('active', mode === 'split');
      codeBtn?.classList.toggle('active', mode === 'code');
      previewBtn?.classList.toggle('active', mode === 'preview');
    }

    let mermaidRenderBusy = false;
    async function renderMermaidSvg() {
      if (mode === 'code' || !container) return;
      if (lastRenderedSvg) { container.innerHTML = lastRenderedSvg; return; }
      if (mermaidRenderBusy) return;
      mermaidRenderBusy = true;
      try {
        container.innerHTML = '<div class="mermaid-loading">Rendering…</div>';
        const mm = await import('mermaid');
        const mermaidLib = (mm as any).default || mm;
        // Measure with the same family the stylesheet renders with, and wait for
        // the (subsetted) webfont before mermaid takes its measurements.
        try { await (document as any).fonts?.ready; } catch {}
        mermaidLib.initialize({
          startOnLoad: false,
          theme: 'base',
          themeVariables: { fontFamily: appFontStack },
        });
        const id = 'mermaid_client_' + Math.random().toString(36).slice(2, 8);
        const { svg } = await mermaidLib.render(id, codeText);
        lastRenderedSvg = svg;
        container.innerHTML = svg;
        if (downloadBtn) (downloadBtn as HTMLButtonElement).disabled = false;
      } catch (e: any) {
        container.innerHTML = '<div class="mermaid-error">Mermaid render error</div>';
      } finally {
        mermaidRenderBusy = false;
      }
    }

    function applyMode(nextMode: 'split' | 'code' | 'preview') {
      mode = nextMode;
      setActiveButton();
      if (editorWrapper) editorWrapper.style.display = (mode === 'preview') ? 'none' : '';
      if (editorFooter) editorFooter.style.display = (mode === 'preview') ? 'none' : '';
      if (preview) preview.style.display = (mode === 'code') ? 'none' : '';
      if (mode !== 'code') {
        renderMermaidSvg();
      }
    }

    splitBtn?.addEventListener('click', () => applyMode('split'));
    codeBtn?.addEventListener('click', () => applyMode('code'));
    previewBtn?.addEventListener('click', () => applyMode('preview'));

    // Preview is the default mode, but the diagram is only rendered client-side on
    // demand. Auto-render once when the block scrolls into view (the mermaid runtime
    // stays a lazy dynamic import; scroll-driven rendering is excluded from CLS).
    if ('IntersectionObserver' in window && container) {
      const io = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            io.disconnect();
            applyMode('preview');
            break;
          }
        }
      }, { rootMargin: '300px 0px' });
      io.observe(block);
    }

    downloadBtn?.addEventListener('click', () => {
      if (!lastRenderedSvg) return;
      try {
        const raw = lastRenderedSvg;
        const parser = new DOMParser();
        const doc = parser.parseFromString(raw, 'image/svg+xml');
        const svgEl = doc.documentElement;

        let defs = svgEl.querySelector('defs');
        if (!defs) {
          defs = doc.createElementNS('http://www.w3.org/2000/svg', 'defs');
          svgEl.insertBefore(defs, svgEl.firstChild);
        }

        try {
          const globalMarker = document.querySelector('marker#chronicle-mermaid-arrow');
          if (globalMarker) {
            const cloned = globalMarker.cloneNode(true);
            const existing = defs.querySelector('#chronicle-mermaid-arrow');
            if (existing) existing.remove();
            defs.appendChild(doc.importNode(cloned, true));
          }
        } catch (e) {}

        try {
          const cs = getComputedStyle(document.documentElement);
          const vars: Record<string, string> = {
            '--comp-bg-glass': cs.getPropertyValue('--comp-bg-glass') || '#ffffff',
            '--border-color': cs.getPropertyValue('--border-color') || '#e6e6e6',
            '--app-text-pri': cs.getPropertyValue('--app-text-pri') || '#111111',
            '--comp-text-pri': cs.getPropertyValue('--comp-text-pri') || '#111111',
          };
          const styleContent = [
            `svg { background: ${vars['--comp-bg-glass']}; }`,
            `rect { fill: ${vars['--comp-bg-glass']}; stroke: ${vars['--app-text-pri']}; }`,
            `path { stroke: ${vars['--comp-text-pri']}; fill: none; }`,
            `text { fill: ${vars['--comp-text-pri']}; font-family: ${appFontStack}; }`,
          ].join('\n');
          const prevStyle = svgEl.querySelector('style[data-chronicle-inline]');
          if (prevStyle) prevStyle.remove();
          const styleEl = doc.createElementNS('http://www.w3.org/2000/svg', 'style');
          styleEl.setAttribute('data-chronicle-inline', '1');
          styleEl.textContent = styleContent;
          svgEl.insertBefore(styleEl, svgEl.firstChild);
        } catch (e) {}

        const serializer = new XMLSerializer();
        const outSvg = serializer.serializeToString(svgEl);
        const blob = new Blob([outSvg], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'mermaid-' + Date.now() + '.svg';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err) {
        const blob = new Blob([lastRenderedSvg], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'mermaid-' + Date.now() + '.svg';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    });

    if (!lastRenderedSvg && downloadBtn) (downloadBtn as HTMLButtonElement).disabled = true;

    // Reserve space synchronously to prevent CLS when the async SVG render
    // replaces this placeholder later (IntersectionObserver callback is async,
    // so the initial paint would see an empty 0-height container without this).
    if (container && !lastRenderedSvg) {
      container.innerHTML = '<div class="mermaid-placeholder" aria-label="Mermaid diagram placeholder" style="min-height:120px;display:flex;align-items:center;justify-content:center;color:var(--app-text-sec);font-size:0.85rem;opacity:0.5;">Diagram</div>';
    }

    // Lazy-render mermaid only when the block nears the viewport.
    // The dynamic import('mermaid') pulls ~100KB of JS — deferring it
    // keeps it off the critical path for pages where mermaid is below the fold.
    let rendered = false;
    const startLazyRender = () => {
      if (rendered) return;
      rendered = true;
      observer.disconnect();
      renderMermaidSvg();
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) startLazyRender();
      },
      { rootMargin: '400px' }
    );
    observer.observe(block);

    // Preview-only initially (hides code editor), but render lazily via observer.
    // User also triggers render by clicking the preview/split button.
    mode = 'preview';
    setActiveButton();
    if (editorWrapper) editorWrapper.style.display = 'none';
    if (editorFooter) editorFooter.style.display = 'none';
    if (preview) preview.style.display = '';
  });
}

// ── Init ──────────────────────────────────────────────────
function initPostPageFeatures() {
  if (scope) scope.destroy();
  scope = createScope();

  import('../utils/mathTooltip').then(({ initMathTooltip }) => {
    initMathTooltip(document.querySelector('.post-content'));
  }).catch((err) => {
    console.error('初始化数学公式 tooltip 失败:', err);
  });

  initMermaidCodeBlocks();

  // Idle-preload mermaid: start downloading after first paint so it's ready
  // when the user scrolls to a mermaid block (IntersectionObserver).
  const _preloadMermaid = () => {
    if (document.querySelector('.code-chunk-container.mermaid')) {
      import('mermaid').catch(() => {});
    }
  };
  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(_preloadMermaid);
  } else {
    setTimeout(_preloadMermaid, 2000);
  }

  // Reset copy buttons
  const copyButtons = document.querySelectorAll('.copy-btn');
  copyButtons.forEach(button => {
    const copyIcon = button.querySelector('.copy-icon') as HTMLElement;
    const successIcon = button.querySelector('.success-icon') as HTMLElement;
    if (copyIcon) copyIcon.style.display = 'block';
    if (successIcon) successIcon.style.display = 'none';
  });

  copyButtons.forEach(button => {
    (button as HTMLElement).removeEventListener('click', (button as any).__copyHandler__);
    const handler = (e: Event) => {
      e.stopPropagation();
      copyCode(button as HTMLElement);
    };
    (button as any).__copyHandler__ = handler;
    (button as HTMLElement).addEventListener('click', handler);
  });

}

// ── Bootstrap ─────────────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPostPageFeatures, { once: true });
} else {
  initPostPageFeatures();
}

document.addEventListener('astro:page-load', () => {
  if (scope) scope.destroy();
  initPostPageFeatures();
});

document.addEventListener('astro:before-swap', () => {
  if (scope) { scope.destroy(); scope = null; }
});
