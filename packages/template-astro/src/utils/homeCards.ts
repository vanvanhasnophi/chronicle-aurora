import { buildLocalizedPath } from './routeLocale';

/** Strip HTML/entities from a post summary for the recent-posts card. */
export function toPlainText(input: unknown): string {
  return String(input || '')
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

export function pickSummary(post: any, t: (key: string) => string): string {
  const raw = post?.summary || post?.excerpt || post?.description || post?.content || post?.html || '';
  const text = toPlainText(raw);
  if (!text) return t('home.noSummary');
  return text.slice(0, 140) + (text.length > 140 ? '…' : '');
}

export function normalizeTag(tag: unknown): string {
  return String(tag || '')
    .trim()
    .replace(/^#+/, '')
    .toLowerCase();
}

export function isFeaturedTag(tag: unknown): boolean {
  const normalized = normalizeTag(tag);
  return normalized === 'featured' || normalized === '精选';
}

export function canonicalTag(tag: unknown): string {
  return isFeaturedTag(tag) ? 'featured' : normalizeTag(tag);
}

export function safeDateValue(value: unknown): Date {
  const date = new Date(String(value || ''));
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

export function formatHomeDate(
  date: Date,
  locale: string,
  options: Intl.DateTimeFormatOptions = {},
): string {
  return date.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...options,
  });
}

export function postUrl(locale: string, postId: string): string {
  return buildLocalizedPath(locale, `/post/${encodeURIComponent(postId)}`);
}
