import type { APIRoute } from 'astro';
import { dataSource } from '../data';
import { loadSiteSettings } from '../utils/siteSettings';
import { buildLocalizedPath } from '../utils/routeLocale';
import { withBase } from '../utils/basePath';

export const prerender = true;

interface Post {
  id: string;
  title: string;
  date: string;
  updatedAt?: string;
  summary?: string;
  excerpt?: string;
  description?: string;
  content?: string;
  html?: string;
  tags?: string[];
  author?: string;
}

function normalizeBaseUrl(rawUrl: unknown) {
  const value = String(rawUrl || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value.replace(/\/$/, '');
  return `https://${value.replace(/\/$/, '')}`;
}

function escapeXml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function stripHtml(value: unknown) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateText(value: string, maxLength = 240) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength).trimEnd()}…`;
}

function safeDateValue(value: unknown) {
  const date = new Date(String(value || ''));
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

function buildSummary(post: Post) {
  const raw = post.summary || post.excerpt || post.description || post.content || post.html || '';
  return truncateText(stripHtml(raw));
}

function buildAbsoluteUrl(baseUrl: string, path: string) {
  return new URL(path.startsWith('/') ? path : `/${path}`, baseUrl).href;
}

// Single RSS feed — canonical locale is zh (project default). Localized links
// point to the zh route so the feed is consistent for all readers.
const FEED_LOCALE = 'zh';

function buildPostUrl(baseUrl: string, postId: string) {
  const localizedPath = buildLocalizedPath(FEED_LOCALE, `/post/${encodeURIComponent(postId)}`);
  return buildAbsoluteUrl(baseUrl, localizedPath);
}

async function loadPosts(): Promise<Post[]> {
  try {
    return dataSource.getPublishedPosts() as Post[];
  } catch {
    return [];
  }
}

export const GET: APIRoute = async ({ site }) => {
  const settings = await loadSiteSettings();
  // Absolute links come from the deploy-time astro `site` config.
  const baseUrl = site ? site.origin : '';
  const siteTitle = String(settings?.siteName || 'Chronicle').trim();
  const siteDescription = String(settings?.siteDescription || 'Latest posts from Chronicle').trim();
  const feedTitle = `${siteTitle} RSS`;

  const posts = await loadPosts();
  const sortedPosts = [...posts].sort(
    (a, b) => safeDateValue(b.updatedAt || b.date).getTime() - safeDateValue(a.updatedAt || a.date).getTime(),
  );
  const feedItems = sortedPosts.slice(0, 20);
  const latestBuildDate = feedItems.length
    ? safeDateValue(feedItems[0].updatedAt || feedItems[0].date).toUTCString()
    : new Date().toUTCString();

  const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(feedTitle)}</title>
    <description>${escapeXml(siteDescription)}</description>
    <link>${escapeXml(buildAbsoluteUrl(baseUrl, withBase('/')))}</link>
    <language>zh-CN</language>
    <lastBuildDate>${escapeXml(latestBuildDate)}</lastBuildDate>
    <atom:link href="${escapeXml(buildAbsoluteUrl(baseUrl, withBase('/rss.xml')))}" rel="self" type="application/rss+xml" />
${feedItems.map((post) => {
      const postUrl = buildPostUrl(baseUrl, post.id);
      const title = escapeXml(post.title || 'Untitled');
      const summary = escapeXml(buildSummary(post));
      const pubDate = safeDateValue(post.date).toUTCString();
      const categories = Array.isArray(post.tags) ? post.tags.filter(Boolean) : [];

      return `    <item>
      <title>${title}</title>
      <link>${escapeXml(postUrl)}</link>
      <guid isPermaLink="true">${escapeXml(postUrl)}</guid>
      <pubDate>${escapeXml(pubDate)}</pubDate>
      <description>${summary}</description>${categories.map((tag) => `
      <category>${escapeXml(tag)}</category>`).join('')}
    </item>`;
    }).join('\n')}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
