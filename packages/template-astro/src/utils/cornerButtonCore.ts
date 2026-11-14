/**
 * CornerButton interaction core — idle-loaded via requestIdleCallback.
 * Extracted from CornerButton.astro for lazy-loading.
 */
type E = { u: (() => void) | null; d(): void };
const M = new Map<HTMLElement, E>();
let _listenersBound = false;

// Lazy-load tocController — only imported when a page has TOC elements.
// BTT template uses a pure scroll listener (no tocController dependency).
let _tc: any = null;
function _ensureTc() {
  if (_tc) return Promise.resolve(_tc);
  return import('../utils/tocController').then(m => { _tc = m; return m; }).catch(() => null);
}

export function initCornerButton() {
  if (_listenersBound) return;
  _listenersBound = true;

  document.addEventListener('astro:page-load', init);
  document.addEventListener('astro:before-swap', () => {
    M.forEach(v => { if (v.u) v.u(); v.d(); });
    M.clear();
    if (_tc) _tc.destroyController();
  });
}

function init() {
    document.querySelectorAll('[data-cb-root]').forEach(r => {
      if (!(r instanceof HTMLElement) || M.has(r)) return;
      const b = r.querySelector('.cb__btn') as HTMLElement | null;
      if (!b) return;
      if (r.classList.contains('cb--left') && !document.documentElement.classList.contains('is-mobile')) return;
      const c = r.querySelector('.cb__content') as HTMLElement;
      if (c && c.hasAttribute('hidden')) c.removeAttribute('hidden');
      setup(r);
    });
  }

  function setup(r: HTMLElement) {
    if (r.parentElement !== document.body) document.body.appendChild(r);
    const b = r.querySelector('.cb__btn') as HTMLElement,
      d = r.querySelector('.cb__backdrop') as HTMLElement,
      c = r.querySelector('.cb__content') as HTMLElement,
      i = r.querySelector('.cb__icons') as HTMLElement,
      tmpl = r.getAttribute('data-cb-template') || '';
    let open = false, menu = '', st: number | null = null, animating = false;
    let fh: ((e: TransitionEvent) => void) | null = null;
    const ct = () => { if (st !== null) { clearTimeout(st); st = null; } };
    let _dur = -1;
    const gst = () => { if (_dur < 0) _dur = 1000 * (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--transition-duration').trim()) || 1); return _dur; };
    const sw = (m: string) => {
      c.querySelectorAll(':scope > [data-menu]').forEach(el => {
        if ((el as HTMLElement).dataset.menu === m) el.removeAttribute('hidden');
        else el.setAttribute('hidden', '');
      });
    };
    const ea = () => {
      const li = c.querySelector('.cb__list-item.cb--active') as HTMLElement | null;
      if (li) { c.scrollTo({ top: Math.min(c.scrollHeight - c.clientHeight, Math.max(0, li.offsetTop - c.clientHeight / 2 + li.offsetHeight / 2)), behavior: 'instant' }); }
    };
    const ao = () => {
      animating = true; b.style.transition = ''; b.style.overflow = ''; open = true; b.classList.add('cb--open'); d.removeAttribute('hidden'); sw(menu);
      requestAnimationFrame(() => ea());
      const F = () => {
        ct(); animating = false; fh = null; b.removeEventListener('transitionend', T);
        _ensureTc().then(m => m?.default.computeLiveActiveFromBaseline());
      };
      function T(e: TransitionEvent) { if (e.propertyName === 'max-height') F(); }
      fh = T; b.addEventListener('transitionend', T);
      st = window.setTimeout(() => { st = null; F(); }, gst());
    };
    const ac = () => {
      ct(); b.style.transition = ''; b.style.overflow = 'hidden'; animating = true; open = false; b.classList.remove('cb--open'); d.setAttribute('hidden', '');
      const F = () => { ct(); animating = false; fh = null; menu = ''; b.style.overflow = ''; c.scrollTop = 0; b.removeEventListener('transitionend', T); };
      function T(e: TransitionEvent) { if (e.propertyName === 'max-height') F(); }
      fh = T; b.addEventListener('transitionend', T);
      st = window.setTimeout(() => { st = null; F(); }, gst());
    };
    const ix = (next: string) => {
      if (fh) { b.removeEventListener('transitionend', fh); fh = null; b.style.transition = ''; b.style.overflow = ''; }
      ct(); animating = false; menu = next; open = true; b.classList.add('cb--open'); d.removeAttribute('hidden'); sw(next);
      requestAnimationFrame(() => ea());
    };
    i.addEventListener('click', (e: Event) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-menu],[data-action]');
      if (!btn) return;
      const mid = btn.dataset.menu;
      if (mid) {
        if (open && menu === mid) ac();
        else if (animating) { e.stopPropagation(); ix(mid); }
        else { e.stopPropagation(); menu = mid; if (!open) ao(); else sw(mid); }
      } else if (btn.dataset.action === 'scrollToTop') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        const mc = document.querySelector('.main-content,main');
        if (mc) mc.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (btn.dataset.action === 'scrollToComment') {
        const target = document.getElementById('__chronicle-comment') || document.getElementById('comments');
        if (target) {
          const mc = document.querySelector('.main-content,main') as HTMLElement | null;
          if (mc) {
            const top = target.getBoundingClientRect().top - mc.getBoundingClientRect().top + mc.scrollTop;
            mc.scrollTo({ top, behavior: 'smooth' });
          } else {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }
      }
    });
    d.addEventListener('click', () => { if (open) ac(); });
    c.addEventListener('click', (e: Event) => {
      const a = (e.target as HTMLElement).closest<HTMLElement>('a[data-toc-id]');
      if (!a) return;
      e.preventDefault();
      const id = a.dataset.tocId!;
      ac();
      _ensureTc().then(m => { if (!m) return;
        m.default.lockActiveId(id); history.pushState(null, '', '#' + id); m.default.scrollToHeading(id);
      });
    });
    if (tmpl === 'btt') {
      const mc = document.querySelector('.main-content,main') as HTMLElement | null;
      const U = () => {
        const st = mc ? mc.scrollTop : (window.scrollY || document.documentElement.scrollTop || 0);
        b.classList.toggle('cb--btt-visible', st > 300);
      };
      window.addEventListener('scroll', U, { passive: true });
      if (mc) mc.addEventListener('scroll', U, { passive: true });
      const E = M.get(r); if (E) {
        if (E.u) E.u();
        E.u = () => { window.removeEventListener('scroll', U); if (mc) mc.removeEventListener('scroll', U); };
      }
      U();
    }
    if (tmpl === 'toc-list' || (tmpl === 'menu' && c.querySelector('[data-toc-id]'))) {
      _ensureTc().then(m => { if (!m) return;
        const U = () => {
          const aid = m.default.state.liveActiveId;
          c.querySelectorAll('[data-toc-id]').forEach(li => li.classList.toggle('cb--active', (li as HTMLElement).dataset.tocId === aid));
        };
        const E = M.get(r); if (E) { if (E.u) E.u(); E.u = m.default.subscribe(U); }
        U();
      });
    }
    M.set(r, { u: null, d() { ct(); if (r.parentElement) r.parentElement.removeChild(r); } });
  }


export { init };
