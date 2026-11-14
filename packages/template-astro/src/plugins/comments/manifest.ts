// ── comments 插件（评论）──────────────────────────────────
// 槽位：post-end-of-article（文章页文末，position bottom——置底：态度按钮 + 评论区，
//      when.capability 探测——适配器无评论能力不注入；attitude 归评论功能，随本插件）
// 数据：dataSource.getComments（localFs 读 comments/{id}.json；Waline 走 headless REST）
// 客户端水合：commentAdapter.ts（与 DOMPurify 独立 chunk 懒加载）
// 样式归属主题层：styles/components/comment-section.css
import type { PluginManifest } from '../types';
import EndOfArticleBottom from './EndOfArticleBottom.astro';
import { commentsDataHooks } from './data';

export const comments: PluginManifest = {
  id: 'comments',
  featureFlag: 'enabled',
  name: '评论插件（comments）',
  pages: {},
  slots: [
    // 文章页文末·置底：态度按钮 + 评论区（同属评论功能，合并为一个置底块；
    // T4 内容源适配器无评论能力 → 不注入；槽位契约 props：
    // { postId, locale, commentsEnabled, backend, walineServerUrl, showGeoAddress, imageUpload* }）
    // 置底必须唯一（registerPlugin 强制——同一 slot 的 bottom 重复注册构建期报错）
    { slot: 'post-end-of-article', position: 'bottom', component: EndOfArticleBottom, when: { capability: 'getComments' } },
  ],
  // 文章页左下角评论入口：无面板，点击滚动到评论区
  postActions: [
    {
      id: 'comments',
      labelKey: 'comment.title',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
      action: 'scrollToComment',
      isAvailable: ({ settings }) => settings?.comments !== false,
    },
  ],
  // 提供的能力：评论数据（getComments 实现已迁到 plugins/comments/data.ts）
  provides: ['getComments'],
  dataHooks: commentsDataHooks,
  settingsSchema: ['comments'],
};

// 注册式约定：manifest 默认导出（plugins/index.ts glob 收集）
export default comments;
