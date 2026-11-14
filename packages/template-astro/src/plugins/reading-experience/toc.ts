/** reading-experience TOC provider: owns heading extraction for post pages. */
import { buildTocItems } from '../../utils/toc';
import { extractHeadings } from '../../utils/chronicleMarkdown';

export function provideToc(ctx: { post?: any; content?: string }): any[] {
  const post = ctx.post;
  if (post && Array.isArray(post.toc) && post.toc.length > 0) {
    return buildTocItems('', true, post.toc);
  }
  const content = ctx.content || post?.content || '';
  return content ? extractHeadings(content) : [];
}
