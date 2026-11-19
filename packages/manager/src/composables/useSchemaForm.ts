/**
 * Chronicle Manager — Schema-driven settings form (Aurora)
 *
 * Reads/writes settings via the data access layer (IPC → fs) instead of
 * the old Host API. Schema $id is resolved to a file path via the
 * schema registry, and data is read/written as YAML or JSON.
 *
 * No HTTP, no fetchWithAuth, no API endpoints.
 */

import { ref, type Ref } from 'vue'
import { readYaml, readJson, writeYaml, writeJson, reindexPosts } from '../data/dataAccess'
import { getMapping } from '../data/schemaRegistry'
import { schemaStore, syncSchemas } from './schemaApi'
import { resolveBackgroundUrlAsync, readBackgroundMeta, discoverBackendBgUrlAsync } from '../utils/backgroundSettings'

import systemSettings from '../../schemas/system-settings.schema.json'

const LOCAL_REGISTRY: Record<string, any> = {
  'chronicle:system-settings': systemSettings,
}

/** Build default data object (or array) from schema */
function buildDefaults(schema: Record<string, any>): Record<string, any> {
  if (schema.type === 'array') return []
  const defaults: Record<string, any> = {}
  const props = schema.properties || {}
  for (const [key, prop] of Object.entries(props)) {
    const p = prop as Record<string, any>
    if (p.default !== undefined) {
      defaults[key] = JSON.parse(JSON.stringify(p.default))
    } else if (p.type === 'object') {
      defaults[key] = {}
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

/** Collect property keys marked `x-site-flag` — their value lives in site.yml, not this schema's file. */
function collectSiteFlags(schema: Record<string, any>): string[] {
  const flags: string[] = []
  const props = schema.properties || {}
  for (const [key, prop] of Object.entries(props)) {
    if ((prop as Record<string, any>)?.['x-site-flag'] === true) flags.push(key)
  }
  return flags
}

export interface SchemaFormState {
  schema: Ref<Record<string, any> | null>
  data: Ref<Record<string, any>>
  defaults: Ref<Record<string, any>>
  loading: Ref<boolean>
  saving: Ref<boolean>
  error: Ref<string>
}

export function useSchemaForm(schemaId: string) {
  const schema = ref<Record<string, any> | null>(null)
  const defaults = ref<Record<string, any>>({})
  const data = ref<Record<string, any>>({})
  const loading = ref(false)
  const saving = ref(false)
  const error = ref('')
  const metaRefs = ref<Record<string, any>>({})
  const activeSchemaId = ref(schemaId)

  // ── Master switch (site.yml feature flag gating this page) ──────────
  const headerFlagName = ref<string | null>(null)
  const headerFlagEnabled = ref(true)

  // ── Load schema ──────────────────────────────────────────
  async function loadSchema(id: string): Promise<Record<string, any> | null> {
    // 1. Local (bundled with manager)
    if (LOCAL_REGISTRY[id]) {
      schema.value = LOCAL_REGISTRY[id]
      defaults.value = buildDefaults(LOCAL_REGISTRY[id])
      return LOCAL_REGISTRY[id]
    }

    // 2. Template-astro schemas — statically imported via schemaApi.ts
    // syncSchemas ensures schemaStore is populated (no-op if already done)
    await syncSchemas()
    const sch = schemaStore[id]
    if (sch) {
      schema.value = sch
      defaults.value = buildDefaults(sch)
      return sch
    }

    error.value = `Schema not found: ${id}`
    return null
  }

  // ── Load data from filesystem ────────────────────────────
  /** Legacy homepage switches -> cardColumns (mirrors the template data layer). */
function deriveLegacyHomeColumns(home: Record<string, any>): Array<{
  width: number
  cards: Array<{ type: string }>
}> {
  const visibility = home.cardVisibility || {}
  const secondary = [
    ...(visibility.author === false ? [] : ['author']),
    ...(visibility.taxonomy === false ? [] : ['taxonomy']),
    ...(visibility.activity === false ? [] : ['activity']),
  ].map((type) => ({ type }))

  if (home.singleColumnHomepage === true) {
    return [{ width: 300, cards: [{ type: 'intro' }, { type: 'recent' }, ...secondary] }]
  }

  return [
    { width: 300, cards: [{ type: 'intro' }, { type: 'recent' }] },
    { width: 200, cards: secondary },
  ].filter((column) => column.cards.length > 0)
}

async function load(schemaIdOverride?: string) {
    const id = schemaIdOverride || schemaId
    activeSchemaId.value = id
    loading.value = true
    error.value = ''

    const sch = await loadSchema(id)
    if (!sch) { loading.value = false; return }

    const mapping = getMapping(id)
    if (!mapping) {
      // Schema has no file mapping — use defaults only (e.g. for schemas
      // that are UI-only or whose data comes from elsewhere)
      data.value = { ...defaults.value }
      loading.value = false
      return
    }

    // Load the page's master switch from site.yml (defaults to enabled).
    headerFlagName.value = mapping.headerFlag ?? null
    if (mapping.headerFlag) {
      const site = await readYaml<Record<string, any>>('data/site.yml')
      headerFlagEnabled.value = site?.[mapping.headerFlag] !== false
    } else {
      headerFlagEnabled.value = true
    }

    try {
      let fileData: any = null
      if (mapping.format === 'yaml') {
        fileData = await readYaml(mapping.filePath)
        // Auto-discover background from directory (site.yml doesn't store these)——仅 appearance 模块
        if (id === 'chronicle:appearance') {
          fileData = fileData ?? {}
          if (!fileData.background) {
            fileData.background = await resolveBackgroundUrlAsync('frontend')
          }
          if (!fileData.backgroundMeta) {
            const meta = await readBackgroundMeta('frontend')
            if (meta) fileData.backgroundMeta = typeof meta === 'string' ? meta : meta
          }
        }
      } else {
        fileData = await readJson(mapping.filePath)
        // Auto-discover backend background from directory (workspace.json doesn't store URL)
        if (id === 'chronicle:system-settings') {
          fileData = fileData ?? {}
          if (!fileData.backendBackground) {
            fileData.backendBackground = await discoverBackendBgUrlAsync()
          }
        }
      }

      if (sch.type === 'array') {
        data.value = Array.isArray(fileData) ? fileData : (defaults.value as any[])
      } else {
        const merged = { ...defaults.value as Record<string, any> }
        if (fileData && typeof fileData === 'object' && !Array.isArray(fileData)) {
          for (const [key, val] of Object.entries(fileData as Record<string, any>)) {
            if (val !== undefined && val !== null) merged[key] = val
          }
        }
        // Fields marked x-site-flag live in site.yml, not this schema's file.
        const siteFlags = collectSiteFlags(sch)
        if (siteFlags.length > 0) {
          const site = await readYaml<Record<string, any>>('data/site.yml')
          for (const key of siteFlags) {
            if (site?.[key] !== undefined) merged[key] = site[key]
          }
        }

        // Fields marked x-file live in another file (e.g. background → background.yml).
        // Cross-file persistence: UI stays with this schema, data lands in the target file.
        // 按 schema 树路径合并（appearance.baseColorLight），而非顶层散键。
        const xFileGroups = collectXFileFields(sch)
        console.log('[load] xFileGroups:', JSON.stringify(xFileGroups))
        for (const [file, fields] of Object.entries(xFileGroups)) {
          const ext = await readYaml<Record<string, any>>(resolveXFilePath(file))
          if (ext && typeof ext === 'object') {
            for (const { path, key } of fields) {
              if (ext[key] !== undefined) setAtPath(merged, path, ext[key])
            }
          }
        }

        // Pre-populate metaRefs from *Meta fields
        for (const key of Object.keys(merged)) {
          if (key.endsWith('Meta') && merged[key]) {
            const baseKey = key.replace(/Meta$/, '')
            try {
              metaRefs.value[baseKey] = typeof merged[key] === 'string'
                ? JSON.parse(merged[key])
                : merged[key]
            } catch { metaRefs.value[baseKey] = merged[key] }
          }
        }
        // Legacy homepage settings (singleColumnHomepage / cardVisibility)
        // are rendered through the new column editor so an old site can be
        // edited and saved without losing its layout.
        if (id === 'chronicle:homepage') {
          const home = merged.homepage as Record<string, any> | undefined
          if (home && typeof home === 'object') {
            if (!Array.isArray(home.cardColumns) || home.cardColumns.length === 0) {
              home.cardColumns = deriveLegacyHomeColumns(home)
            }
            if (!(Number(home.cardFlowMaxWidth) > 0)) home.cardFlowMaxWidth = 1200
          }
        }

        data.value = merged
        console.log('[load] merged.appearance:', JSON.stringify((merged as any)?.appearance))
      }
    } catch (e: any) {
      data.value = { ...defaults.value }
      if (e?.message) error.value = e.message
    } finally {
      loading.value = false
    }
  }


/**
 * Recursively remove UI-virtual keys ($/_ prefixed — e.g. _localId, $about_edit,
 * $waline_admin) from a payload so they never leak into content files (P2-5).
 */
/** 递归在 schema properties（含嵌套 fieldset）中按字段名或点路径查找定义（appearance.background）。 */
function findNestedProp(schemaProps: Record<string, any>, key: string): Record<string, any> | undefined {
  if (key.includes('.')) {
    let node: any = schemaProps
    for (const p of key.split('.')) {
      if (!node || typeof node !== 'object') return undefined
      const next = node[p]
      if (next === undefined && node.properties) node = node.properties[p] || undefined
      else node = next
    }
    return node
  }
  for (const [k, v] of Object.entries(schemaProps)) {
    if (k === key) return v
    if (v?.['x-widget'] === 'fieldset' && v.properties) {
      const found = findNestedProp(v.properties, key)
      if (found) return found
    }
  }
  return undefined
}

/** 解析 x-file 目标路径：兼容逻辑名（background → data/background/background.yml）与完整路径。 */
function resolveXFilePath(file: string): string {
  const ALIASES: Record<string, string> = { background: 'data/background/background.yml' }
  return ALIASES[file] || file
}

/** Set a value at a nested path on a plain object (creates intermediate objects). */
function setAtPath(node: Record<string, any>, path: string[], val: any): void {
  let cur = node
  for (let i = 0; i < path.length - 1; i++) {
    const p = path[i]
    if (!cur[p] || typeof cur[p] !== 'object') cur[p] = {}
    cur = cur[p]
  }
  cur[path[path.length - 1]] = val
}

/** Collect schema fields marked x-file (cross-file persistence), grouped by target path.
 *  递归遍历嵌套块（如 appearance）内的字段；返回字段在 schema 树中的完整路径，
 *  load 时据此把外部文件值合并到正确层级（appearance.baseColorLight 等）。 */
function collectXFileFields(schema: Record<string, any>): Record<string, { path: string[]; key: string }[]> {
  const groups: Record<string, { path: string[]; key: string }[]> = {}
  const walk = (props: Record<string, any>, prefix: string[]): void => {
    for (const [key, prop] of Object.entries(props)) {
      const file = prop['x-file']
      if (file) (groups[file] = groups[file] || []).push({ path: [...prefix, key], key })
      if (prop['x-widget'] === 'fieldset' && prop.properties) walk(prop.properties, [...prefix, key])
    }
  }
  walk(schema.properties || {}, [])
  return groups
}

function stripVirtualKeys(value: any): any {
  if (Array.isArray(value)) return value.map(stripVirtualKeys)
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {}
    for (const [k, v] of Object.entries(value)) {
      if (k.startsWith('$') || k.startsWith('_')) continue
      out[k] = stripVirtualKeys(v)
    }
    return out
  }
  return value
}
  // ── Save data to filesystem ──────────────────────────────
  async function save(): Promise<boolean> {
    saving.value = true
    const mapping = getMapping(activeSchemaId.value)
    if (!mapping) { saving.value = false; return false }

    try {
      const isArraySchema = schema.value?.type === 'array'
      let payload: any = isArraySchema
        ? (Array.isArray(data.value) ? data.value : [])
        : { ...data.value as Record<string, any> }

      // 递归处理 schema 顶层与嵌套块（如 appearance）内的字段：
      //  - x-persist: false → 从 payload 树删除（幽灵 background 等）
      //  - x-file       → 提取到对应文件（background.yml），不进 site.yml
      //  - x-site-flag  → 保留在 site.yml（本就是顶层）
      const siteFlags: string[] = []
      const xFilePayloads: Record<string, Record<string, any>> = {}
      console.log('[save] payload.appearance:', JSON.stringify((payload as any)?.appearance))
      if (!isArraySchema && schema.value?.properties) {
        const getAt = (node: any, path: string[]): any => {
          let cur: any = node
          for (const p of path) {
            if (cur == null || typeof cur !== 'object') return undefined
            cur = cur[p]
          }
          return cur
        }
        const deleteAt = (node: any, path: string[]): void => {
          if (path.length === 0) return
          const parent = path.slice(0, -1).reduce<any>((acc, p) => (acc == null || typeof acc !== 'object') ? undefined : acc[p], node)
          if (parent && typeof parent === 'object') delete parent[path[path.length - 1]]
        }
        const stripNested = (node: Record<string, any>, schemaProps: Record<string, any>, prefix: string[]): void => {
          for (const [key, prop] of Object.entries(schemaProps)) {
            if (prop['x-persist'] === false) {
              deleteAt(node, [...prefix, key])
              deleteAt(node, [...prefix, `${key}Meta`])
              continue
            }
            const file = prop['x-file']
            if (file) {
              const val = getAt(node, [...prefix, key])
              if (val !== undefined) {
                xFilePayloads[file] = xFilePayloads[file] || {}
                xFilePayloads[file][key] = val
              }
              deleteAt(node, [...prefix, key])
              continue
            }
            if (prop['x-site-flag'] === true) {
              if (getAt(node, [...prefix, key]) !== undefined) deleteAt(node, [...prefix, key])
              siteFlags.push(key)
              continue
            }
            if (prop['x-widget'] === 'fieldset' && prop.properties) {
              stripNested(node, prop.properties, [...prefix, key])
            }
          }
        }
        stripNested(payload, schema.value.properties, [])
        // 兜底：x-persist false 字段的顶层幽灵键（background/backgroundMeta 等——旧残留进入
        // merged 顶层后不删会一直写回 site.yml）
        for (const key of Object.keys(payload)) {
          const prop = findNestedProp(schema.value?.properties || {}, key)
          if (prop?.['x-persist'] === false) delete payload[key]
        }
        console.log('[save] xFilePayloads:', JSON.stringify(Object.keys(xFilePayloads)), JSON.stringify(xFilePayloads))
      }

      // Strip UI-virtual keys ($/_ prefixed) — never persisted (P2-5).
      payload = stripVirtualKeys(payload)

      // 清理幽灵 Meta 键（backgroundMeta 等）：背景 meta 由组件 persistBg 写 background.yml，
      // 对应字段 x-persist false / hidden / schema 无此字段 → 从 payload 删除（否则 Document API 崩）
      for (const key of Object.keys(payload)) {
        if (key.endsWith('Meta')) {
          const base = key.replace(/Meta$/, '')
          const prop = findNestedProp(schema.value?.properties || {}, base)
          if (!prop || prop['x-persist'] === false || prop['x-widget'] === 'hidden') {
            console.log('[save] cleanup ghost Meta:', key)
            delete payload[key]
          }
        }
      }
      console.log('[save] data keys:', Object.keys(data.value || {}))

      // Inject meta refs into payload (e.g. backgroundMeta ← metaRefs.background)
      console.log('[save] metaRefs keys:', Object.keys(metaRefs.value))
      if (!isArraySchema) {
        for (const [key, meta] of Object.entries(metaRefs.value)) {
          if (meta) {
            const metaKey = `${key}Meta`
            // 递归查找（字段可能在嵌套块内，如 appearance.background）
            const prop = findNestedProp(schema.value?.properties || {}, key)
            // 背景 meta 由组件 persistBg 写 background.yml：x-persist false / hidden 虚拟字段
            // / schema 无此字段（幽灵键）一律不注入 site.yml（否则 Document API 崩）
            if (!prop) { console.log('[save] skip meta (no field):', key); continue }
            if (prop['x-persist'] === false) { console.log('[save] skip meta (x-persist):', key); continue }
            if (prop['x-widget'] === 'hidden') { console.log('[save] skip meta (hidden):', key); continue }
            payload[metaKey] = typeof meta === 'string' ? meta : JSON.stringify(meta)
          }
        }
      }
      console.log('[save] payload Meta keys:', Object.keys(payload).filter((k) => k.endsWith('Meta')))

      let ok = false
      if (mapping.format === 'yaml') {
        ok = await writeYaml(mapping.filePath, payload)
      } else {
        ok = await writeJson(mapping.filePath, payload)
      }

      // Write cross-file fields (x-file) — Document API preserves hand-written comments.
      console.log('[save] before x-file writes, ok =', ok)
      if (ok) {
        for (const [file, xf] of Object.entries(xFilePayloads)) {
          console.log('[save] writing x-file:', resolveXFilePath(file), JSON.stringify(xf))
          ok = await writeYaml(resolveXFilePath(file), xf)
          console.log('[save] x-file write result:', ok)
          if (!ok) break
        }
      }
      console.log('[save] final ok =', ok)

      // Persist the master-switch flag to site.yml when it lives outside this
      // page's data file (friends → friends.yml, collections → collections.yml).
      // When the flag is in site.yml already (comments), it was written above.
      if (ok && headerFlagName.value && mapping.filePath !== 'data/site.yml') {
        const site = (await readYaml<Record<string, any>>('data/site.yml')) ?? {}
        site[headerFlagName.value] = headerFlagEnabled.value
        ok = await writeYaml('data/site.yml', site)
      }

      // Persist x-site-flag fields to site.yml (e.g. profile's aboutPage).
      if (ok && siteFlags.length > 0) {
        const site = (await readYaml<Record<string, any>>('data/site.yml')) ?? {}
        for (const key of siteFlags) {
          site[key] = (data.value as Record<string, any>)?.[key]
        }
        ok = await writeYaml('data/site.yml', site)
      }

      // After saving collections, rebuild the full post index
      // (rebuildPostIndex handles both article metadata and collection assignments)
      if (ok && activeSchemaId.value === 'chronicle:collections') {
        try {
          await reindexPosts()
          console.log('[useSchemaForm] post index rebuilt')
        } catch {}
      }

      return ok
    } catch {
      return false
    } finally {
      saving.value = false
    }
  }

  function reset() {
    data.value = Array.isArray(defaults.value) ? [...defaults.value] : { ...defaults.value }
    metaRefs.value = {}
  }

  /** Re-read the current file from disk, discarding unsaved in-memory edits. */
  async function restore() {
    metaRefs.value = {}
    await load()
  }

  function setDataValue(key: string, val: any) {
    if (Array.isArray(data.value)) {
      data.value = val
    } else {
      data.value = { ...data.value, [key]: val }
    }
  }

  function setMeta(key: string, val: any) {
    metaRefs.value = { ...metaRefs.value, [key]: val }
  }

  /**
   * Toggle the page's master switch (in-memory only — persisted by save()).
   * When the flag lives in the same file the page edits (comments → site.yml),
   * the in-memory form data is kept in sync so save() writes it naturally.
   */
  function toggleHeaderFlag(enabled: boolean) {
    const name = headerFlagName.value
    if (!name) return
    headerFlagEnabled.value = enabled

    const mapping = getMapping(activeSchemaId.value)
    if (
      mapping?.filePath === 'data/site.yml'
      && data.value
      && typeof data.value === 'object'
      && !Array.isArray(data.value)
    ) {
      data.value = { ...(data.value as Record<string, any>), [name]: enabled }
    }
  }

  return {
    schema, data, defaults, loading, saving, error,
    load, save, reset, restore, setDataValue, setMeta, metaRefs,
    headerFlagName, headerFlagEnabled, toggleHeaderFlag,
    dataEndpoint: mappingName(activeSchemaId.value),
  }
}

function mappingName(schemaId: string): string {
  const m = getMapping(schemaId)
  return m ? m.filePath : ''
}
