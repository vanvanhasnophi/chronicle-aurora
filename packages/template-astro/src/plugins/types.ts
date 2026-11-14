// ── 插件插件抽象层（主板开放给可插拔功能的注册契约）────────
// 聚合维度：内容消费上下文（见 docs/architecture-positioning.md）。
// 主板只保留：路由壳 + 数据契约 + 预设；功能按插件注册，一单元一 manifest。
import type { DataSource } from '../data/types';
import type { PluginDataHooks } from '../data/pluginHooks';

/** 页面级贡献：主板动态壳（pages/[lang]/[module].astro）按 route 渲染的页面体组件 */
export interface PluginPageContribution {
  /** 主板路由段（/zh/<route>/）——内核不预知，由插件声明 */
  route: string;
  /** 页面体组件（自含 Layout 包裹与数据读取） */
  component: any;
  /** 页面门控：featureFlag 关闭 → 动态壳 getStaticPaths 不生成该页（与静态壳门控同语义） */
  when?: { featureFlag?: string };
}

/** 槽位级贡献：注入主板页面预置的渲染槽（如文章页文末/评论位） */
export interface PluginSlotContribution {
  /** 主板槽位 id（如 'post-end-of-article'、'post-toc'、'post-collection-nav'） */
  slot: string;
  component: any;
  /** 槽位内位置：'top'（置顶，缺省）| 'bottom'（置底）。
      置顶允许多组件（主板 getPluginSlots 按 position 过滤，append 排列）；
      置底必须唯一（registerPlugin 强制——同一 slot 的 bottom 重复注册构建期报错） */
  position?: 'top' | 'bottom';
  /** 条件渲染（when 门控）：featureFlag 读 site.yml featureFlags 段（opt-out，!== false 即开）；
      两条件都通过才渲染；主板经 getPluginSlots(slot, ctx) 统一评估 */
  when?: {
    /** 站点 featureFlags 键（如 'comments'、'globalSearch'） */
    featureFlag?: string;
    /** 适配器能力探测：DataSource 方法名存在才渲染（内容源无关验证的关键） */
    capability?: keyof DataSource;
  };
}

/** activity 卡片条目（首页"最近更新"列表项）——插件 changeInterpreter 产物 */
export interface ActivityItem {
  /** 条目类型：'app' | 'post' | 'delete' 为 core 预设；插件可自定 tone（样式需主题支持） */
  tone: string;
  label?: string;
  title: string;
  href?: string;
  external?: boolean;
}

/** git 文件变化（recentUpdates 暴露的原始 data/ 变化） */
export interface ChangedFile {
  status: 'A' | 'M' | 'D';
  path: string;
}

/**
 * 非 posts/ 的 yml 文件在聚合窗口内的内容 diff——插件 YAML-as-DataSource 通道。
 * adapter（recentUpdates）算好旧版（窗口起点）vs 当前（HEAD）的内容，raw + yaml
 * 解析双通道：解释器拿 yaml 结构直接做业务 diff（哪个条目新增/修改），
 * yaml 解析失败时退回 raw 文本。posts/ 被排除——内容太重，core 只需文件级信号。
 */
export interface YamlFileChange {
  path: string;
  status: 'A' | 'M' | 'D';
  /** 窗口起点版本原文（A 时 null；无 baseCommit/git 不可读时 null） */
  previousRaw: string | null;
  /** 当前版本原文（D 时 null） */
  currentRaw: string | null;
  /** 窗口起点版本 yaml 解析结果（解析失败 null，用 raw） */
  previous: unknown | null;
  /** 当前版本 yaml 解析结果（解析失败 null，用 raw） */
  current: unknown | null;
}

/** 文件变化解释器上下文（解释器读取当前数据/设置） */
export interface ChangeInterpreterCtx {
  dataSource: DataSource;
  t?: (key: string) => string;
  /** 当前 locale（'en' | 'zh-CN'）——解释器构造本地化跳转链接用 */
  locale?: string;
  /** 仓库根路径——解释器读 git 旧版内容做内容级 diff（变化前 vs 当前） */
  root?: string;
  /** 聚合窗口起点 commit——解释器对比"变化前"内容；null 时无法对比（保守回退） */
  baseCommit?: string | null;
  /** 非 posts/ yml 的内容 diff（YAML-as-DataSource 通道）——按 path 自取 */
  yamlFileChanges?: YamlFileChange[];
}

/**
 * 文件变化解释器：把某类 data/ 文件变化理解为主页 activity 条目。
 * 插件声明关心的路径模式 + 解释函数——core 扫描 git 变化后分发给所有解释器，
 * 产物与原生条目（app/post/delete）并列（不单独成块）。
 */
export interface PluginChangeInterpreter {
  /** 匹配的 data/ 路径（如 'data/collections.yml'；支持前缀 'data/xxx/'） */
  match: string | ((path: string) => boolean);
  /** 解释变化 → activity 条目（返回空数组 = 无可见活动） */
  interpret(changes: ChangedFile[], ctx: ChangeInterpreterCtx): ActivityItem[];
}

/** 插件文章类型贡献：插件声明自己处理的文章类型 + 降级 + 徽章 + 导航队列 */
export interface PluginPostTypeContribution {
  /** 文章类型（post.type / frontmatter type 值），如 'slides' */
  type: string;
  /** 渲染槽位（文章页该类型的视图槽位，如 'post-slides-view'） */
  slot?: string;
  /** 降级类型：插件禁用/删除时文章降级为的类型（缺省 'article'）。
      若降级类型也无匹配插件 → 继续降级到 'article' */
  fallbackType?: string;
  /** 类型徽章（列表/卡片/标题展示；可选——无徽章则该类型不挂徽章） */
  badge?: {
    /** 徽章文案（如 "幻灯片" / "Slides"） */
    label: string;
    /** 徽章图标 SVG */
    icon?: string;
  };
  /** 是否忽略 prev/next 导航队列（默认 false）：true → 该类型文章不参与
      上/下篇导航，也不作为其他文章的候选（如 slides 无正文阅读顺序） */
  queueIgnored?: boolean;
}

export interface PluginTocContext {
  post: any;
  content?: string;
  html?: string;
}

/** 文章页插件动作（左下角 CornerActions）——core 只渲染注册表，不预知插件语义 */
export interface PluginPostAction {
  /** 动作 id，同时作为 data-menu / aria 标识 */
  id: string;
  /** 文案 i18n key；缺省用 id */
  labelKey?: string;
  /** 原始 SVG 图标 HTML */
  icon?: string;
  /** 动作面板组件；core 以 postId + variant="inline" 渲染 */
  component?: any;
  /** 无面板的简单动作（如 scrollToComment），映射到 data-action */
  action?: string;
  /** 面板组件额外 props（可依据文章上下文动态生成） */
  props?: Record<string, unknown> | ((ctx: PluginPostContext) => Record<string, unknown>);
  /** 与槽位相同的 featureFlag/capability 门控 */
  when?: { featureFlag?: string; capability?: keyof DataSource };
  /** 文章级可用性判断（如该文章是否在某个合集内） */
  isAvailable?: (ctx: PluginPostContext) => boolean;
}

export interface PluginPostContext {
  post?: any;
  postId?: string;
  dataSource?: DataSource;
  settings?: Record<string, any>;
  toc?: any[];
}

/** 插件 manifest：一单元注册（页面 + 槽位 + 数据钩子 + 变化解释器 + critical + 设置 schema） */
export interface PluginManifest {
  id: string;
  /** 插件级开关键（site.yml featureFlags/顶层布尔）：构建期 false → 不注册（禁用=构建时忽略，与删除同效果） */
  featureFlag?: string;
  /** 提供的能力（DataSource 方法名）：禁用/删除 → 不注册 → 能力消失，
      when.capability 探测同时要求「方法存在 && 有插件提供」——消费方无需预知提供方 */
  provides?: string[];
  name: string;
  pages?: Record<string, PluginPageContribution>;
  slots?: PluginSlotContribution[];
  /** 文章页左下角动作：core 只遍历注册表，不硬编码 collection/TOC 外的插件入口 */
  postActions?: PluginPostAction[];
  /** 文章页 body class 钩子：core 合并所有注册插件返回值，不预知插件语义 */
  postBodyClass?: (ctx: PluginPostContext) => string | undefined;
  /** TOC provider: reading-experience owns heading extraction. */
  tocProvider?: (ctx: PluginTocContext) => any[];
  /** 数据钩子扩展：插件专属能力（叠加在 DataSource 上，可缺省） */
  dataHooks?: PluginDataHooks;
  /** 文件变化解释器：把 data/ 变化理解为主页 activity 条目（core 分发变化，插件自解释） */
  changeInterpreters?: PluginChangeInterpreter[];
  /** 页面级 critical CSS（页面类型 → CSS 文本，插件 ?raw 提供）：
      主板页面在对应槽位/页面注册时内联——插件禁用/删除 → 不注入（core 零插件样式） */
  critical?: Record<string, string>;
  /** 文章类型贡献：声明处理的类型 + 降级 + 徽章——插件禁用/删除 → 类型无匹配
      → 文章降级为 fallbackType（默认 article）且无徽章 */
  postTypes?: PluginPostTypeContribution[];
  /** 设置 schema 贡献（manager 侧，T5 接入 SCHEMA_REGISTRY） */
  settingsSchema?: string[];
}
