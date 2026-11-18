import type { Locale } from './i18n';
import { withBase, stripBase } from './basePath';

/** All valid URL route locale prefixes. Add a new language here — the type derives from this. */
const ROUTE_LOCALES = ['en', 'zh'] as const;
export type RouteLocale = (typeof ROUTE_LOCALES)[number];

/** Maps a route language code to its content locale. Add a mapping when adding a new language. */
const ROUTE_TO_CONTENT: Record<string, Locale> = {
  en: 'en',
  zh: 'zh-CN',
};

function extractLang(locale: string | undefined): string {
  if (!locale) return '';
  return locale.split('-')[0].toLowerCase();
}

function isRouteLocale(s: string): s is RouteLocale {
  return (ROUTE_LOCALES as readonly string[]).includes(s);
}

export function toRouteLocale(locale: string | undefined): RouteLocale {
  const lang = extractLang(locale);
  if (isRouteLocale(lang)) return lang;
  return 'en';
}

export function toContentLocale(routeLocale: string | undefined): Locale {
  const lang = extractLang(routeLocale);
  if (lang && ROUTE_TO_CONTENT[lang]) return ROUTE_TO_CONTENT[lang];
  return 'en';
}

export function getRouteLocaleFromPath(pathname: string): RouteLocale | undefined {
  const bare = stripBase(pathname.startsWith('/') ? pathname : `/${pathname}`);
  const normalized = bare.startsWith('/') ? bare : `/${bare}`;
  const segments = normalized.split('/').filter(Boolean);

  if (isRouteLocale(segments[0])) {
    return segments[0];
  }

  return undefined;
}

export function buildLocalizedPath(locale: string | undefined, path: string): string {
  const routeLocale = toRouteLocale(locale);
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  if (normalizedPath === '/') {
    // 首页保留尾斜杠：/zh/ 直接命中 index.html；
    // /zh 在静态托管上会 301/308 到 /zh/，软路由会多一个 RTT。
    return withBase(`/${routeLocale}/`);
  }

  return withBase(`/${routeLocale}${normalizedPath}`);
}

export function stripRouteLocale(pathname: string): string {
  const bare = stripBase(pathname.startsWith('/') ? pathname : `/${pathname}`);
  const normalized = bare.startsWith('/') ? bare : `/${bare}`;
  const segments = normalized.split('/').filter(Boolean);

  if (isRouteLocale(segments[0])) {
    return `/${segments.slice(1).join('/')}` || '/';
  }

  return normalized;
}
