import type { APIRoute } from 'astro';
import { dataSource } from '../data';
import { BASE_PATH } from '../utils/basePath';
import { getAllPluginPages } from '../plugins';

export const prerender = true;

/**
 * sitemap.xml (3.1.x) — SSG-generated. Base URL comes from the deploy-time
 * astro `site` config; without a configured origin the urlset is empty
 * (the Sitemap line in robots.txt is omitted too).
 * 插件路由动态加入：仅列出已注册插件页面（禁用/删除的插件不生成 sitemap URL）。
 */
export const GET: APIRoute = async ({ site }) => {
  // Base URL comes from the deploy-time astro `site` config, not content data.
  const base = site ? site.origin + BASE_PATH.replace(/\/+$/, '') : '';
  const posts = dataSource.getPublishedPosts() as any[];

  const escapeXml = (s: unknown) => String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

  const urls: string[] = [];
  if (base) {
    // 主板静态路由（非插件）
    const corePages = ['', '/blogs', '/about'];
    // 插件页面路由（构建期注册——禁用/删除的插件不在其中）
    const pluginRoutes = getAllPluginPages().map((p) => '/' + p.route);
    const pages = [...corePages, ...pluginRoutes];
    for (const lang of ['zh', 'en']) {
      for (const p of pages) {
        urls.push('  <url><loc>' + escapeXml(base + '/' + lang + p) + '</loc></url>');
      }
    }
    // Published posts (both locales)
    for (const post of posts) {
      const lastmod = String(post.updatedAt || post.date || '').slice(0, 10);
      for (const lang of ['zh', 'en']) {
        const loc = escapeXml(base + '/' + lang + '/post/' + encodeURIComponent(post.id));
        urls.push('  <url><loc>' + loc + '</loc>' + (lastmod ? '<lastmod>' + lastmod + '</lastmod>' : '') + '</url>');
      }
    }
  }

  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + urls.join('\n') + '\n'
    + '</urlset>\n';

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml' },
  });
};
