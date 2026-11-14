// ── friends 插件（友链）──────────────────────────────────
// 页面：/friends（主板壳渲染本插件页面体；单功能插件——enabled 总开关即页面开关，
//   不再设独立 featureFlag 键，避免 site.yml 键名重复）
// 数据：settings.friendsCards / friendsGlobalStyle（getPublicSettings 已从 friends.yml 读取，
//   无独立 DataSource 方法，dataHooks 留空）
// 样式归属主题层：styles/pages/friends.css（页面样式归主题，插件不吞样式）
import type { PluginManifest } from '../types';
import FriendsPage from './FriendsPage.astro';
import NavFriendsLink from './NavFriendsLink.astro';
import { friendsDataHooks } from './data';

export const friends: PluginManifest = {
  id: 'friends',
  featureFlag: 'enabled',
  name: '友链插件（friends）',
  pages: {
    friends: { route: 'friends', component: FriendsPage },
  },
  slots: [
    // 导航链接（NavHeader nav-link 槽位）——插件禁用/删除 → 链接消失
    { slot: 'nav-link', component: NavFriendsLink },
  ],
  dataHooks: friendsDataHooks,
  settingsSchema: ['friends'],
};

// 注册式约定：manifest 默认导出（plugins/index.ts glob 收集）
export default friends;
