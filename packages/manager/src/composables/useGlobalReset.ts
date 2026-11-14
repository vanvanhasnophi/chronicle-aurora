/**
 * Chronicle Aurora — 全局重置（UI 版本）
 *
 * 与 scripts/reset-site.mjs / reset-cms.mjs / reset-data.mjs 逻辑一致：
 *   1. resetSite()   — 模板设置 → schema 默认（site/profile/friends/collections/background.yml）
 *   2. resetCms()    — CMS 配置 → system-settings 默认（.chronicle/workspace.json）
 *   3. resetData()   — 清空 data/ 内容（文章/评论/媒体），重建空索引
 *
 * UI 通过 dataAccess（fs IPC）直接读写，不调用外部脚本。
 */

import { ref } from 'vue'
import { schemaStore, syncSchemas } from './schemaApi'
import { writeYaml, writeJson, writeText, deleteDir, deleteFile, mkdir, readDir } from '../data/dataAccess'
import systemSettings from '../../schemas/system-settings.schema.json'
import { collectionsMeta } from '../../../template-astro/src/plugins/collections/meta'
import { friendsMeta } from '../../../template-astro/src/plugins/friends/meta'

const SCHEMAS: Record<string, any> = {
  'chronicle:homepage': () => schemaStore['chronicle:homepage'],
  'chronicle:appearance': () => schemaStore['chronicle:appearance'],
  'chronicle:post-page': () => schemaStore['chronicle:post-page'],
  'chronicle:profile': () => schemaStore['chronicle:profile'],
  [friendsMeta.schemaId]: () => schemaStore[friendsMeta.schemaId],
  [collectionsMeta.schemaId]: () => schemaStore[collectionsMeta.schemaId],
}

/** 背景渲染 meta 默认值（与 BackgroundEditorModal.defaultMeta 对齐） */
const BACKGROUND_META_DEFAULTS: Record<string, any> = {
  mode: 'cover', posX: 50, posY: 50, size: 100, blur: 20,
  overlayLightColor: '#fefbfb', overlayLightOpacity: 75,
  overlayDarkColor: '#000000', overlayDarkOpacity: 80,
  videoAutoplay: true, videoLoop: true, videoPlaybackRate: 1,
  baseColorLight: '', baseColorDark: '',
}

function buildDefaults(schema: Record<string, any>): Record<string, any> {
  if (schema?.type === 'array') return []
  const defaults: Record<string, any> = {}
  const props = schema?.properties || {}
  for (const [key, prop] of Object.entries(props)) {
    const p = prop as Record<string, any>
    if (p.default !== undefined) {
      defaults[key] = JSON.parse(JSON.stringify(p.default))
    } else if (p.type === 'object') {
      defaults[key] = buildDefaults(p)
    } else if (p.type === 'array') {
      defaults[key] = []
    } else if (p.type === 'boolean') {
      defaults[key] = false
    } else if (p.type === 'number' || p.type === 'integer') {
      defaults[key] = 0
    } else {
      defaults[key] = ''
    }
  }
  return defaults
}

/** 剔除不入 site.yml 的字段：x-persist:false / x-file / $ 前缀虚拟键 */
function stripVirtual(defaults: Record<string, any>, schema: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {}
  for (const [k, v] of Object.entries(defaults)) {
    const prop = schema?.properties?.[k]
    if (k.startsWith('$')) continue
    if (prop?.['x-persist'] === false) continue
    if (prop?.['x-file']) continue
    if (prop?.['x-widget'] === 'fieldset' && prop.properties) {
      out[k] = stripVirtual(v as Record<string, any>, prop)
    } else {
      out[k] = v
    }
  }
  return out
}

export function useGlobalReset() {
  const running = ref(false)

  /** ① 重置模板设置 */
  async function resetSite(): Promise<boolean> {
    await syncSchemas() // schemaStore 静态可用，但同步一次确保全部注册
    const coreSchemas = [
      SCHEMAS['chronicle:homepage'](),
      SCHEMAS['chronicle:appearance'](),
    ]
    const ppSchema = SCHEMAS['chronicle:post-page']()
    if (coreSchemas.some((s) => !s) || !ppSchema) return false

    // site.yml：模板核心模块（homepage/appearance/plugins）默认树合并 + post 子树默认
    const siteDefaults = Object.assign(
      {},
      ...coreSchemas.map((sc) => stripVirtual(buildDefaults(sc), sc)),
    )
    const postDefaults = stripVirtual(buildDefaults(ppSchema).post || {}, ppSchema.properties?.post || {})
    siteDefaults.post = postDefaults
    let ok = await writeYaml('data/site.yml', siteDefaults)
    if (!ok) return false

    // profile / friends / collection plugin data
    for (const id of ['chronicle:profile', friendsMeta.schemaId, collectionsMeta.schemaId]) {
      const sch = SCHEMAS[id]()
      if (!sch) continue
      const file = id === 'chronicle:profile' ? 'data/profile.yml'
        : id === friendsMeta.schemaId ? friendsMeta.filePath : collectionsMeta.filePath
      const defaults = stripVirtual(buildDefaults(sch), sch)
      // 数组 schema（collections）→ YAML 全量序列化（applyPayload 对数组顶层无效）；对象 → Document API 保注释
      if (sch.type === 'array') {
        const YAML = await import('yaml')
        ok = await writeText(file, YAML.stringify(defaults, { lineWidth: -1 }))
      } else {
        ok = await writeYaml(file, defaults)
      }
      if (!ok) return false
    }

    // background.yml：背景 meta 重置（含 baseColorLight/Dark）
    ok = await writeYaml('data/background/background.yml', BACKGROUND_META_DEFAULTS)
    return ok
  }

  /** ② 重置 CMS 配置 */
  async function resetCms(): Promise<boolean> {
    const defaults = buildDefaults(systemSettings as any) as Record<string, any>
    // backendBackgroundMeta 保持默认 meta 结构
    defaults.backendBackgroundMeta = {
      mode: 'cover', posX: 50, posY: 50, size: 100, blur: 0,
      overlayLightColor: '#000000', overlayLightOpacity: 0,
      overlayDarkColor: '#000000', overlayDarkOpacity: 0,
      videoAutoplay: true, videoLoop: true, videoPlaybackRate: 1,
    }
    return writeJson('.chronicle/workspace.json', defaults)
  }

  /** ③ 清空 data/ 内容（含文章），重建骨架 */
  async function resetData(): Promise<boolean> {
    const dirs = ['data/posts', 'data/comments', 'data/comments-pending', 'data/assets', 'data/avatar', 'data/branding', 'data/__about__']
    for (const d of dirs) {
      try { await deleteDir(d) } catch { /* ignore */ }
    }
    // background：清媒体但保留 background.yml
    try {
      const files = await readDir('data/background')
      for (const f of files) {
        if (f === 'background.yml') continue
        if (/\.(jpg|jpeg|png|gif|webp|avif|svg|mp4|webm|mov|heic)$/i.test(f)) {
          await deleteFile('data/background/' + f)
        }
      }
    } catch { /* ignore */ }
    // 重建骨架
    try { await mkdir('data/posts') } catch { /* ignore */ }
    try { await mkdir('data/comments') } catch { /* ignore */ }
    try { await mkdir('data/comments-pending') } catch { /* ignore */ }
    await writeText('data/posts/index.json', '{}\n')
    return true
  }

  return { running, resetSite, resetCms, resetData }
}
