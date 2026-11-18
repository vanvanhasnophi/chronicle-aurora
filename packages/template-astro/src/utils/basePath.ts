/**
 * Deploy base path helpers.
 *
 * Astro's `base` option (set from the `BASE_PATH` env var in astro.config.mjs)
 * prefixes assets automatically, but not the absolute links this template
 * renders by hand (`/zh/...`, `/posts/index.json`, `/fonts/...`). Everything
 * that emits an absolute site path must go through `withBase`.
 *
 * Keep this file dependency-free: it is imported by both server-rendered
 * components and client bundles.
 */

/** '/' at the domain root, '/repo/' for a GitHub Pages project site. */
export const BASE_PATH: string = import.meta.env.BASE_URL || '/'

/** Prefix an absolute site path with the deploy base. Relative/external paths are untouched. */
export function withBase(path: string): string {
  if (!path.startsWith('/') || path.startsWith('//')) return path
  const base = BASE_PATH.replace(/\/+$/, '')
  if (!base) return path
  return `${base}${path}`
}

/** Remove the deploy base from a pathname produced by the browser. */
export function stripBase(pathname: string): string {
  const base = BASE_PATH.replace(/\/+$/, '')
  if (!base) return pathname
  if (pathname === base) return '/'
  if (pathname.startsWith(`${base}/`)) return pathname.slice(base.length)
  return pathname
}
