// ── collections 插件（合集）────────────────────────────────
// 页面：/collection（主板壳渲染本插件页面体；单功能插件——enabled 总开关即页面开关，
//   不再设独立 featureFlag 键，避免 site.yml 键名重复）
// 数据：合集读取走主板 DataSource（getCollections/getCollectionPostIds）
// 槽位：home-card-taxonomy（首页 taxonomy 卡片合集列表块——主板卡片模板骨架渲染本槽位，
//   数据自读 getCollections；插件禁用/删除 → 块消失）
// 变化解释：changeInterpreter——data/collections.yml 变化 → 主页 activity 条目
//   （与原生 app/post/delete 并列，不单独成块；插件禁用/删除 → 合集活动项消失）
import type { PluginManifest } from '../types';
import CollectionPage from './CollectionPage.astro';
import CollectionNav from './CollectionNav.astro';
import TaxonomyCollectionBlock from './TaxonomyCollectionBlock.astro';
import NavCollectionLink from './NavCollectionLink.astro';
import collectionNavCritical from './styles/critical/collection-nav.css?raw';
import { collectionsChangeInterpreter } from './changeInterpreter';
import { collectionDataHooks } from './data';

export const collections: PluginManifest = {
  id: 'collections',
  featureFlag: 'enabled',
  name: '合集插件（collections）',
  pages: {
    collection: { route: 'collection', component: CollectionPage },
  },
  slots: [
    // 首页 taxonomy 卡片合集列表块（主板模板骨架渲染）
    { slot: 'home-card-taxonomy', component: TaxonomyCollectionBlock },
    // 导航链接（NavHeader nav-link 槽位）——插件禁用/删除 → 链接消失
    { slot: 'nav-link', component: NavCollectionLink },
    // 文章页侧栏；core 只渲染 post-sidebar 槽位，不知道这是合集
    { slot: 'post-sidebar', component: CollectionNav, when: { capability: 'getCollections' } },
  ],
  // 文章页左下角入口：core 遍历注册动作，不预知 collection
  postActions: [
    {
      id: 'collection',
      labelKey: 'nav.collection',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M 12 2 L 21 8 L 12 14 L 3 8 Z"/><path d="M 18 14 L 21 16 L 12 22 L 3 16 L 6 14"/></svg>',
      component: CollectionNav,
      isAvailable: ({ post, settings }) => {
        const nav = settings?.post?.postCollectionNav;
        const collection = (post?.extensions as any)?.collections;
        return !!collection?.name && nav?.enabled !== false;
      },
    },
  ],
  // 文章页布局让位：core 合并插件 body class，不预知 has-collection-nav
  postBodyClass: ({ post, settings }) => {
    const nav = settings?.post?.postCollectionNav;
    const collection = (post?.extensions as any)?.collections;
    return collection?.name && nav?.enabled !== false && nav?.alwaysCollapsed !== true
      ? 'has-collection-nav'
      : undefined;
  },
  // 文章页 critical：合集导航首帧布局让位；插件禁用 → 不注入
  critical: {
    post: collectionNavCritical,
  },
  // 文件变化解释器：collections.yml 变化 → activity 条目
  changeInterpreters: [collectionsChangeInterpreter],
  // 提供的能力：合集数据（getCollections/getCollectionPostIds 实现在 DataSource/localFs，
  // 能力声明随插件注册——禁用/删除 → 能力消失 → 消费方（reading-experience 导航槽位）自动收敛
  provides: ['getCollections', 'getCollectionPostIds'],
  dataHooks: collectionDataHooks,
  settingsSchema: ['collections'],
};

// 注册式约定：manifest 默认导出（plugins/index.ts glob 收集）
export default collections;
