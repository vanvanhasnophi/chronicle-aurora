// ── 数据层注册点（主板唯一入口）──────────────────────────
// 渲染层组件/页面只 import 这里：换数据源 = 换适配器，消费方零改动。
import { localFsAdapter } from './adapters/localFs';
import { contentCollectionsAdapter } from './adapters/contentCollections';
import { getDataHook } from './pluginHooks';
import type { DataSource } from './types';

// 当前数据源实例：
// - 默认：本地文件系统 data/（localFsAdapter）
// - DATA_ADAPTER=content-collections：T4 内容无关验证（消费 src/content/posts/，见
//   adapters/contentCollections.ts 头注释）——换内容源 = 换适配器，主板/主题/插件零改动。
const baseSource: DataSource =
  process.env.DATA_ADAPTER === 'content-collections' ? contentCollectionsAdapter : localFsAdapter;

// Plugin data hooks extend the base DataSource. Lookup is lazy because the
// proxy is created before plugin manifests register their hooks.
export const dataSource: DataSource = new Proxy(baseSource, {
  get(target, prop, receiver) {
    if (typeof prop === 'string') {
      const hook = getDataHook(prop as keyof DataSource);
      if (hook) return hook;
    }
    return Reflect.get(target, prop, receiver);
  },
});

// 类型与纯工具重导出（消费方保持命名兼容）
export type {
  DataSource,
  PostMeta,
  LocalPost,
  CommentConfig,
  PostPageConfig,
  LocalSettings,
  ChronicleComment,
  CommentTreeNode,
} from './types';
export { buildCommentTree } from './adapters/localFs';
