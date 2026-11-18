import type { APIRoute } from 'astro';
import { dataSource } from '../data';
import { BASE_PATH } from '../utils/basePath';

export const GET: APIRoute = ({ site }) => {
  const origin = site ? site.origin.replace(/\/$/, '') + BASE_PATH.replace(/\/+$/, '') : '';
  const lines = [
    'User-agent: *',
    'Allow: /',
  ];
  if (origin) {
    lines.push('', 'Sitemap: ' + origin + '/sitemap.xml');
  }

  return new Response(lines.join('\n') + '\n', {
    headers: { 'Content-Type': 'text/plain' },
  });
};
