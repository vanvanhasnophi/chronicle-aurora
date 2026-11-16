// ── 主题运行时（延迟非阻塞）──────────────────────────────
// 主题拥有的全部运行时视觉行为：
//   · 软路由后恢复主题/accent/字体（防 SPA 切换丢失）
//   · 系统主题变化监听（follow/system 模式）
//   · WebKit backdrop-filter + View Transition workaround（bug 302256）
//   · home-transition-disabled 清理
// 以及 layout-init（移动端类、性能模式、背景层淡入）。
// 由 ThemeRuntime.astro 组件引入，与框架数据桥（__CHRONICLE_SETTINGS__）解耦。
import './layout-init'
import { applyTheme } from './theme-utils'

// ── 主题监听（follow/system 模式跟随系统变化）───────────
function initThemeListener() {
  try {
    const settings = JSON.parse(localStorage.getItem('chronicle.settings') || '{}');
    const theme = settings.theme || 'follow';

    if (theme === 'follow' || theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

      const handleThemeChange = (e: { matches: boolean }) => {
        document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
      };

      if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener('change', handleThemeChange);
      } else if (mediaQuery.addListener) {
        mediaQuery.addListener(handleThemeChange);
      }
    }
  } catch (e) {
    console.error('Theme listener error:', e);
  }
}

// ── 应用主题/accent/字体（读框架数据桥 __CHRONICLE_SETTINGS__）──
function applySettings() {
  const settings = { ...(window as any).__CHRONICLE_SETTINGS__ };
  if (!settings) return;

  // 本地保存的主题覆盖 SSR 设置
  try {
    const localSettings = JSON.parse(localStorage.getItem('chronicle.settings') || '{}');
    if (localSettings.theme) {
      settings.theme = localSettings.theme;
    }
  } catch (e) {}

  try {
    // 主题：设置 <html data-theme>，背景/遮罩/底色均由 CSS 变量按主题解析
    applyTheme(settings.theme);

    // 应用 accent 颜色
    if (settings.accent) {
      document.documentElement.style.setProperty('--accent-base', settings.accent);
    }

    // 应用字体
    if (settings.font === 'serif') {
      document.documentElement.style.setProperty('--app-font-stack', 'var(--app-font-stack-serif)');
    } else {
      document.documentElement.style.setProperty('--app-font-stack', 'var(--app-font-stack-inter)');
    }
  } catch (e) {
    console.error('[Layout] Error applying settings:', e);
  }
}

let initialized = false;

function init() {
  if (!initialized) {
    // 首次硬加载：完整初始化（主题、监听器）
    applySettings();
    initThemeListener();
    initialized = true;
  } else {
    // 软路由：重新应用主题/accent/字体到新的 <html>
    applySettings();
  }
}

// Astro 每次路由切换完毕会抛出 page-load 事件 (包含首次加载)
document.addEventListener('astro:page-load', init);

document.addEventListener('astro:after-swap', () => {
  document.documentElement.classList.remove('home-transition-disabled');
});

// ── iOS WebKit backdrop-filter + View Transition workaround ──
// WebKit bug 302256: backdrop-filter is not composited into View Transition
// snapshots, so the bg-overlay blur "pops" out and back in during soft
// routing. Chrome/Android composite it correctly. Workaround: turn the blur
// off before the old snapshot is captured, fade it back in after the swap.
// https://wiki.webkit.org/show_bug.cgi?id=302256
if (typeof document !== 'undefined' && 'startViewTransition' in document
  && /^((?!chrome|android).)*safari/i.test(navigator.userAgent)) {
  let _bgOverlayBlur: { filter: string; webkitFilter: string } | null = null;
  const _bgOverlayEl = () => {
    const layer = document.getElementById('chr-bg-layer');
    return layer ? (layer.querySelector('.bg-overlay') as HTMLElement | null) : null;
  };

  document.addEventListener('astro:after-preparation', () => {
    const overlay = _bgOverlayEl();
    if (!overlay) return;
    _bgOverlayBlur = {
      filter: overlay.style.backdropFilter || '',
      webkitFilter: overlay.style.webkitBackdropFilter || '',
    };
    // Instant off — the old snapshot is captured right after this event,
    // so the change must not animate into the snapshot.
    overlay.style.transition = 'none';
    overlay.style.backdropFilter = 'none';
    overlay.style.webkitBackdropFilter = 'none';
    void overlay.offsetHeight; // commit the style change before snapshot
  });

  document.addEventListener('astro:after-swap', () => {
    const overlay = _bgOverlayEl();
    if (!overlay || !_bgOverlayBlur) return;
    // Restore the CSS transition first, then re-apply the blur so it
    // fades in (backdrop-filter 0.3s ease) after the transition ends.
    overlay.style.transition = '';
    void overlay.offsetHeight; // commit the transition property first
    overlay.style.backdropFilter = _bgOverlayBlur.filter;
    overlay.style.webkitBackdropFilter = _bgOverlayBlur.webkitFilter;
    _bgOverlayBlur = null;
  });
}

// 监听页面 DOM 替换后，立即恢复主题，防止浅色模式和独立主题配置在 SPA 切换时丢失
document.addEventListener('astro:after-swap', () => {
  try {
    const settings = JSON.parse(localStorage.getItem('chronicle.settings') || '{}');
    const theme = settings.theme || 'follow';

    if (theme === 'follow' || theme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
});
