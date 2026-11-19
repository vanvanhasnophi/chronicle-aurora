import enJSON from '../locales/en.json';
import zhCNJSON from '../locales/zh-CN.json';
import { pluginLocales } from '../plugins/generated-locales';

export type Locale = 'en' | 'zh-CN';
type LocaleDict = Record<string, any>;

/**
 * Deep-merge plugin locale bundles over the core dictionary. Plugins only
 * contribute the namespaces they own (e.g. `comment.*`), so a plugin can be
 * disabled (and removed from the generated import list) without leaving its
 * translations in the core files.
 */
function deepMerge(base: LocaleDict, extra: unknown): LocaleDict {
  if (!extra || typeof extra !== 'object') return base;
  for (const [key, value] of Object.entries(extra as LocaleDict)) {
    const current = base[key];
    const bothObjects =
      value && typeof value === 'object' && !Array.isArray(value) &&
      current && typeof current === 'object' && !Array.isArray(current);
    base[key] = bothObjects ? deepMerge({ ...current }, value) : value;
  }
  return base;
}

const translations: Record<Locale, LocaleDict> = {
  'en': pluginLocales.reduce(
    (acc, pack) => deepMerge(acc, (pack as Record<string, unknown>).en),
    { ...enJSON } as LocaleDict,
  ),
  'zh-CN': pluginLocales.reduce(
    (acc, pack) => deepMerge(acc, (pack as Record<string, unknown>)['zh-CN']),
    { ...zhCNJSON } as LocaleDict,
  ),
};

/**
 * Get translation for a given key using dot notation
 * @param locale - The locale to use ('en' | 'zh-CN')
 * @param key - Translation key in dot notation (e.g., 'nav.home')
 * @returns The translated string, or the key itself if not found
 */
export function getTranslation(locale: Locale, key: string): string {
  const keys = key.split('.');
  let value: any = translations[locale];

  for (const k of keys) {
    if (value && typeof value === 'object') {
      value = value[k];
    } else {
      // Fallback to key if not found
      return key;
    }
  }

  return typeof value === 'string' ? value : key;
}

/**
 * Get locale from Astro context locals (set by middleware), or from a locale
 * string directly. Normalizes the route-style 'zh' to the content locale
 * 'zh-CN'; anything else falls back to 'zh-CN'.
 * @param locals - Astro.locals object ({ locale }) or a locale string
 * @returns Content locale ('en' | 'zh-CN')
 */
export function getLocale(locals: { locale?: unknown } | string): Locale {
  const raw = typeof locals === 'string' ? locals : locals?.locale;
  if (raw === 'en') return 'en';
  if (raw === 'zh' || raw === 'zh-CN') return 'zh-CN';
  return 'zh-CN';
}

/**
 * Get locale from client-side (for use in browser scripts)
 * Priority: localStorage > navigator language > default (zh-CN)
 * @returns Detected locale
 */
export function getClientLocale(): Locale {
  if (typeof window === 'undefined') return 'zh-CN';

  try {
    const stored = localStorage.getItem('locale');

    if (stored === 'en' || stored === 'zh-CN') {
      return stored as Locale;
    }

    // If 'follow' or not set, use navigator language
    const nav = navigator.language || 'en';
    return nav.startsWith('zh') ? 'zh-CN' : 'en';
  } catch (e) {
    return 'zh-CN';
  }
}

/**
 * Create a translation helper function bound to a specific locale
 * @param locale - The locale to bind
 * @returns A function that takes a key and returns the translation
 */
export function createT(locale: Locale): (key: string) => string {
  return (key: string) => getTranslation(locale, key);
}
