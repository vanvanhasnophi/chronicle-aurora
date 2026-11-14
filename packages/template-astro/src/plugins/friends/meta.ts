/** Serializable metadata for the friends plugin (Manager + settings). */
export const friendsMeta = {
  id: 'friends',
  key: 'friends',
  name: 'Friends 友链',
  description: 'Friend cards & global style — 好友卡片与全局样式',
  featureFlag: 'enabled',
  schemaId: 'chronicle:friends',
  filePath: 'data/friends.yml',
  format: 'yaml' as const,
  storage: 'file' as const,
  builtin: true,
  contentEditor: true,
  dataFiles: ['data/friends.yml'],
  contentType: {
    dir: 'data',
    idFrom: 'filename' as const,
    file: 'friends.yml',
    format: 'yaml' as const,
  },
};
