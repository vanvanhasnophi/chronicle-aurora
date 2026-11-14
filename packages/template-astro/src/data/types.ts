// ── 数据契约（主板）────────────────────────────────────────
// DataSource 接口 = 渲染层与内容源之间的唯一契约（主题视角：最小方法集）。
// 现状实现：LocalFsAdapter（data/ 文件系统）。
// 第三方适配器：实现本接口即可让任意内容源跑这套 UI（见 architecture-positioning.md）。
//
// 能力边界：接口方法均为必选（消费者无空值负担）；第三方适配器对不支持的能力
// 返回空集/空对象即可——消费者按 featureFlags 门控渲染（如评论关闭时不渲染 CommentSection）。

export interface DataSource {
  // ── 标准内容能力（主题所需最小集）──
  /** 已发布文章元数据列表 */
  getPublishedPosts(): PostMeta[]
  /** 单篇文章（含正文与编译 HTML） */
  getPostById(id: string, locale?: string): LocalPost | null
  /** 作者资料（头像自动发现） */
  getProfile(): Record<string, unknown>
  /** 站点设置（site.yml 归一化） */
  getPublicSettings(): LocalSettings
  /** 文章评论（数据/comments/{id}.json 快照层） */
  getComments(postId: string): ChronicleComment[]
  /** 合集定义（collections.yml） */
  getCollections(): Record<string, unknown>
  /** 合集中按人工顺序展平的帖子 id 列表 */
  getCollectionPostIds(collectionName: string): string[]
}

// ── 共享类型 ──────────────────────────────────────────────

export interface PostMeta {
    id: string;
    title: string;
    date: string;
    updatedAt?: string;
    filename: string;
    summary: string;
    tags: string[];
    status: string;
    font?: string;
    /** Generic plugin-owned post extensions (e.g. { collections: { name, path } }) */
    extensions?: Record<string, unknown>;
    author?: string;
    authors?: string[];
    aiGenerated?: boolean;
    dir: string;
    toc: { id: string; text: string; level: number }[];
    hasHtml?: boolean;
    type?: string;
    slideshow?: any;
}

export interface LocalPost extends PostMeta {
    content: string;
    compiledHtml: string;
}

export interface CommentConfig {
  backend: '' | 'waline';
  walineServerUrl?: string;
}

/** Post page config (3.1.x) — flat top-level groups from site.yml */
export interface PostPageConfig {
  postMeta?: { metaUpdated?: boolean; metaStats?: boolean; metaAiBadge?: boolean; showTags?: boolean };
  postTocEnabled?: boolean;
  postToc?: { inlineToc?: boolean; tocFloat?: boolean; tocFloatAlwaysExpanded?: boolean; mobileTocControl?: boolean };
  postCollectionNavEnabled?: boolean;
  postCollectionNav?: { alwaysCollapsed?: boolean };
  postEndOfArticle?: { relatedPosts?: boolean; prevNext?: boolean; prevNextMode?: 'both' | 'next-only'; prevNextScope?: 'global' | 'collection'; prevNextOrder?: 'asc' | 'desc'; authorCard?: boolean; share?: boolean; shareChannels?: string[] };
  postComments?: { backend?: string; walineServerUrl?: string; attitude?: boolean; showGeoAddress?: boolean; imageUploadEnabled?: boolean; imageUploadEndpoint?: string; imageUploadToken?: string };
}

export interface LocalSettings {
    siteName?: string;
    siteDescription?: string;
    theme?: string;
    accent?: string;
    background?: unknown;
    backgroundVideo?: string;
    backgroundPoster?: string;
    /** Compressed variants for the bg image, best first (avif > webp > original). */
    backgroundCandidates?: string[];
    /** Compressed variants for the poster, best first (avif > webp > original). */
    backgroundPosterCandidates?: string[];
    backgroundMeta?: string;
    baseColorLight?: string;
    baseColorDark?: string;
    /** @deprecated 旧名——兼容读取 */
    backgroundColorLight?: string;
    backgroundColorDark?: string;
    font?: string;
    locale?: string;
    featureFlags?: Record<string, boolean>;
    friendsCards?: unknown;
    friendsGlobalStyle?: unknown;
    homepageMode?: string;
    singleColumnHomepage?: boolean;
    cardVisibility?: { author?: boolean; taxonomy?: boolean; activity?: boolean };
    recentUpdates?: { staleDays?: number; aggregateDays?: number };
    gaMeasurementId?: string;
    /** 3.1.x — analytics backend config (site.yml analytics: block). */
    analytics?: Record<string, any>;
    icpNumber?: string;
    defaultPerformanceMode?: string;
    comment?: CommentConfig;
    /** 3.1.x — nested post-page config (data/site.yml post: block). */
    post?: PostPageConfig;
    // Feature toggles
    aboutPage?: boolean;
    friendsPage?: boolean;
    rss?: boolean;
    searchSuggestions?: boolean;
    globalSearch?: boolean;
    fullTextSearch?: boolean;
    traffic?: boolean;
    comments?: boolean;
}

export interface ChronicleComment {
  id: string;
  author: string;
  email?: string;
  website?: string;
  content: string;
  date: string;
  /** Flat parent reference — null for top-level, commentId for replies (Staticman format). */
  parent?: string | null;
  /** Root comment ID of this thread. Set at creation, never changes. */
  rootId?: string;
  /** Only on approved comments — hide from public display. Default false. */
  hidden?: boolean;
  /** 3.1.x — commenter geo address (country/province), never the raw IP. */
  location?: string;
}

export interface CommentTreeNode extends ChronicleComment {
  replies: CommentTreeNode[];
}
