/** Serializable metadata for the slides plugin. */
export const slidesMeta = {
  id: 'slides',
  key: 'slides',
  name: 'Slides 幻灯片',
  description: 'Marp slide rendering — Marp 幻灯片渲染（post 级配置走 frontmatter slideshow 段）',
  featureFlag: 'enabled',
  schemaId: 'chronicle:slideshow',
  filePath: 'data/site.yml',
  format: 'yaml' as const,
  storage: 'post' as const,
  builtin: true,
};
