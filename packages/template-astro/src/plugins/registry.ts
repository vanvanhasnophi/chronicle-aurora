// ── 插件注册表（构建期静态收集）────────────────────────────
// 主板路由壳经 getPluginPage / getPluginSlots 查表渲染。
// 注册发生在 src/plugins/index.ts（静态 import 各插件 manifest）。
import type { PluginManifest, PluginSlotContribution, PluginChangeInterpreter, ChangedFile, ActivityItem, ChangeInterpreterCtx, PluginPostTypeContribution } from './types';
export type { PluginManifest, ActivityItem, ChangedFile, ChangeInterpreterCtx, PluginPostTypeContribution } from './types';
import type { DataSource } from '../data/types';

/** 槽位门控评估上下文（主板页面传入；不传 = 不过滤，全量返回） */
export interface SlotGateCtx {
  /** 站点 featureFlags（site.yml featureFlags 段，opt-out 语义） */
  featureFlags?: Record<string, boolean>;
  /** 当前 DataSource 适配器（capability 探测：方法存在性） */
  dataSource?: DataSource;
}

/** 评估单个槽位的 when 条件；无 when 恒通过 */
/** 已注册插件声明提供的能力集合（禁用/删除 → 不注册 → 能力消失） */
const providedCapabilities = new Set<string>();

/** 槽位唯一性索引：slot + position → 已注册插件 id
 *  唯一语义：置底（bottom）必须唯一——同一 slot 的 bottom 只允许一个组件；
 *  置顶（top）允许多组件（append 排列，不校验）。容器本身（slot 存在与否）由主板决定 */
const uniqueSlots = new Map<string, string>();

export function registerPlugin(manifest: PluginManifest): void {
  if (registry.has(manifest.id)) {
    // HMR / 重复 import 时 generated-registry 会再次执行；注册表是模块级
    // 单例，同一 manifest 的重复注册应幂等跳过，而不是中断 dev server。
    // 真正的配置冲突（不同插件抢同一个 bottom 槽位）仍在下面报错。
    return;
  }
  // 置底唯一校验：同一 slot 的 position:'bottom' 只允许一个组件（如 post-end-of-article
  // 置底——重复注册即构建期报错，不静默取首个）；置顶不校验（可多组件）
  for (const s of manifest.slots ?? []) {
    if ((s.position ?? 'top') !== 'bottom') continue;
    const key = `${s.slot}:bottom`;
    const existing = uniqueSlots.get(key);
    if (existing) {
      throw new Error(
        `[plugins] 槽位 ${s.slot} (bottom) 置底唯一冲突：${existing} 与 ${manifest.id} 都注册了——` +
        `置底只允许一个组件`,
      );
    }
    uniqueSlots.set(key, manifest.id);
  }
  registry.set(manifest.id, manifest);
  for (const cap of manifest.provides ?? []) providedCapabilities.add(cap);
  indexPostTypes(manifest);
}

function passesWhen(when: PluginSlotContribution['when'], ctx?: SlotGateCtx): boolean {
  if (!when) return true;
  if (when.featureFlag && ctx?.featureFlags?.[when.featureFlag] === false) return false;
  // capability：方法存在 && 有插件提供该能力（数据方声明 provides）——
  // 提供方禁用/删除 → 能力消失 → 消费方自动收敛（无需预知提供方键名/开关）
  if (when.capability &&
      (typeof ctx?.dataSource?.[when.capability] !== 'function' || !providedCapabilities.has(when.capability))) return false;
  return true;
}

const registry = new Map<string, PluginManifest>();


export function getPlugin(id: string): PluginManifest | undefined {
  return registry.get(id);
}

/** 取某插件注册的页面体组件（主板路由壳用）；未注册返回 undefined → 壳渲染空/预设 */
export function getPluginPage(clusterId: string, pageKey: string): any {
  return getPlugin(clusterId)?.pages?.[pageKey]?.component;
}

/** 全部插件注册的页面（动态壳 getStaticPaths 用）：route → 页面体 + 门控 */
export function getAllPluginPages(): { route: string; clusterId: string; pageKey: string; component: any; when?: { featureFlag?: string } }[] {
  const out: { route: string; clusterId: string; pageKey: string; component: any; when?: { featureFlag?: string } }[] = [];
  for (const plugin of registry.values()) {
    for (const [pageKey, contrib] of Object.entries(plugin.pages ?? {})) {
      out.push({
        route: contrib.route,
        clusterId: plugin.id,
        pageKey,
        component: contrib.component,
        when: contrib.when,
      });
    }
  }
  return out;
}

/** 按路由段取页面体（动态壳渲染用） */
export function getPluginPageByRoute(route: string): { component: any; when?: { featureFlag?: string } } | undefined {
  for (const plugin of registry.values()) {
    for (const contrib of Object.values(plugin.pages ?? {})) {
      if (contrib.route === route) return { component: contrib.component, when: contrib.when };
    }
  }
  return undefined;
}

/** 取某槽位的贡献组件列表（主板页面槽渲染用）；经 when 门控过滤。
 *  position：可选按位置过滤（'top' | 'bottom'）——top 允许多组件（append 排列），
 *  bottom 唯一（见 getPluginSlot） */
export function getPluginSlots(slot: string, ctx?: SlotGateCtx, position?: 'top' | 'bottom'): any[] {
  const out: any[] = [];
  for (const plugin of registry.values()) {
    for (const s of plugin.slots ?? []) {
      if (s.slot === slot &&
          (position === undefined || (s.position ?? 'top') === position) &&
          passesWhen(s.when, ctx)) {
        out.push(s.component);
      }
    }
  }
  return out;
}

/** 取某槽位的唯一贡献组件（主板槽渲染用；未注册或门控不过 → undefined）。
 *  position 缺省取置顶（兼容旧槽位语义）——bottom 唯一槽位（如 post-end-of-article
 *  置底）注册时已强制唯一（重复注册构建期报错），这里直接返回该组件 */
export function getPluginSlot(slot: string, ctx?: SlotGateCtx, position: 'top' | 'bottom' = 'top'): any {
  for (const plugin of registry.values()) {
    for (const s of plugin.slots ?? []) {
      if (s.slot === slot && (s.position ?? 'top') === position && passesWhen(s.when, ctx)) {
        return s.component;
      }
    }
  }
  return undefined;
}

/**
 * 文件变化解释：把 git 扫描到的 data/ 变化分发给各插件 changeInterpreter，
 * 汇总为 activity 条目（与原生 app/post/delete 并列，不单独成块）。
 * 插件禁用/删除 → 解释器不注册 → 其数据文件变化不再产生 activity 条目。
 */
export function interpretChanges(changes: ChangedFile[], ctx: ChangeInterpreterCtx): ActivityItem[] {
  const out: ActivityItem[] = [];
  for (const plugin of registry.values()) {
    for (const interpreter of plugin.changeInterpreters ?? []) {
      const matched = changes.filter((c) =>
        typeof interpreter.match === 'string'
          ? c.path === interpreter.match || c.path.startsWith(interpreter.match + '/')
          : interpreter.match(c.path),
      );
      if (matched.length) out.push(...interpreter.interpret(matched, ctx));
    }
  }
  return out;
}

/**
 * 收集某页面类型的插件 critical CSS（如 post 页的合集导航布局偏移规则）。
 * 插件禁用/删除 → 不注册 → 对应 critical 不注入（core 零插件样式）。
 */
export function getPluginCritical(pageType: string): string {
  let out = '';
  for (const plugin of registry.values()) {
    const css = plugin.critical?.[pageType];
    if (css) out += css + '\n';
  }
  return out;
}

/** 文章类型索引：type → 贡献（构建期收集——插件禁用/删除 → 不在索引 → 类型无匹配） */
const postTypeIndex = new Map<string, PluginPostTypeContribution>();

/** 收集文章类型贡献（registerPlugin 内调用） */
function indexPostTypes(manifest: PluginManifest): void {
  for (const t of manifest.postTypes ?? []) {
    if (!postTypeIndex.has(t.type)) postTypeIndex.set(t.type, t);
  }
}

/** 文章类型是否被某插件匹配（有注册贡献 = 可渲染） */
export function isPostTypeRegistered(type: string): boolean {
  return postTypeIndex.has(type);
}

/** 文章类型的渲染槽位（插件注册的视图槽位名；无匹配 → undefined） */
export function getPostTypeSlot(type: string): string | undefined {
  return postTypeIndex.get(type)?.slot;
}

/** 文章类型的降级目标（插件禁用时降级为；缺省 'article'；无匹配也回 'article'） */
export function getPostTypeFallback(type: string): string {
  const t = postTypeIndex.get(type);
  if (!t) return 'article';
  const fb = t.fallbackType || 'article';
  // 降级类型也无匹配 → 继续降级到 article
  return fb === 'article' || postTypeIndex.has(fb) ? fb : 'article';
}

/** 文章类型的徽章（label + icon；无注册/无徽章 → undefined = 不挂徽章） */
export function getPostTypeBadge(type: string): { label: string; icon?: string } | undefined {
  return postTypeIndex.get(type)?.badge;
}

/** 文章类型是否忽略 prev/next 导航队列（插件声明 queueIgnored；
 *  无注册/未声明 → false = 参与导航） */
export function isPostTypeQueueIgnored(type: string): boolean {
  return postTypeIndex.get(type)?.queueIgnored === true;
}
