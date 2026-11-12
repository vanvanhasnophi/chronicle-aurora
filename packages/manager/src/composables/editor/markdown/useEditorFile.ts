/**
 * useEditorFile — 编辑器文件 I/O 操作
 *
 * 职责：保存、发布、导出、打印、Mermaid 渲染。
 * 支持三条保存路径：
 *   1. 本地文件   — File System Access API / Blob 下载
 *   2. 云端草稿   — POST /api/post (status=draft)
 *   3. 云端发布   — POST /api/post (status=published) → 触发 Astro 构建
 *
 * 依赖：useEditorFrontmatter（frontmatter 状态）、useEditorMedia（本地文件上传解析）
 */
import { ref, type Ref, type ComputedRef } from 'vue'
import type { SavedFm } from './useFrontmatter'
import { extractMarpKeys } from './useFrontmatter'
import { openAllDetails } from '@chronicle/shared/src/utils'
import { triggerBuild } from '../../useAstroBuild'
import { settingsStore } from '../../settingsApi'
import pptxgen from 'pptxgenjs'

// ══════════════════════════════════════════════════════
// 从拆分模块导入（原 inline 定义已提取）
// ══════════════════════════════════════════════════════
import { renderSlidesToHTML } from '../slides/useMarpEngine'
import { parseSlideHTMLToTextObjects, extractSlideSections } from '../slides/useSlideExport'
import {
  CHRONICLE_CSS, EXPORT_OVERRIDE, KATEX_TAG, escapeHtml,
  buildArticleStandaloneHtml, buildSlidesStandaloneHtml,
  buildSlidesPrintHtml, buildStandalonePrintHtml,
} from './useHTMLTemplates'
import {
  renderStaticHTML,
  renderMermaidBlocksInMarkdown,
} from './useStaticRenderer'
import { createCloudSave } from '../cloud/useCloudSave'
import { savePost, saveDraft as _saveDraft, clearDraft as _clearDraft, saveAbout } from '../cloud/useCloudRelay'
import type { DraftMeta } from '../cloud/useCloudRelay'

/**
 * useEditorFile 的依赖注入选项。
 * 所有外部状态和函数通过此接口传入，保持 composable 无隐式依赖。
 */
export interface EditorFileOptions {
  editorType: Ref<'article' | 'slides'>
  editorBasePath: string
  localValue: Ref<string>
  // ── Frontmatter state (来自 useEditorFrontmatter) ──
  postTitle: Ref<string>
  isDefaultTitle: Ref<boolean>
  postId: Ref<string | null>
  postStatus: Ref<'local' | 'draft' | 'published' | 'building'>
  postDate: Ref<string>
  postUpdated: Ref<string>
  postTags: Ref<string[]>
  postSlug: Ref<string>
  postFont: Ref<string>
  postAuthor: Ref<string>
  postAIGenerated: Ref<boolean>
  slideshowConfig: Ref<Record<string, any>>
  // ── 编辑模式 ──
  isCloudEditing: ComputedRef<boolean>
  isAboutMode: ComputedRef<boolean>
  // ── 认证 ──
  // ── Frontmatter 工具函数 ──
  buildSavedFm: () => SavedFm
  normalizeBody: (raw: string) => string
  stringifyFrontmatter: (data: Record<string, any>, content: string) => string
  CHRONICLE_FM_KEYS: Set<string>
  // ── 模态框 ──
  activeModal: Ref<string>
  // ── 通知 / i18n / 网络 ──
  showToast: (msg: string, opts?: any) => void
  t: (key: string) => string
  // ── 文件句柄 ──
  currentFileHandle: Ref<any>
  currentFilePath: Ref<string | null>
  // ── 脏检测基线 ──
  savedContent: Ref<string>
  savedFm: Ref<SavedFm>
  // ── 路由 ──
  route: any
  router: any
  locale: Ref<string>
  // ── 资源 ──
  assetMap: Ref<Record<string, string>>
  // ── 媒体解析 ──
  fileMap: Map<string, File>
  // ── HTML 工具 ──
  escapeHtml: (text: string) => string
  // ── 最近项目 ──
  pushRecentProject: (meta: { title: string; path?: string; cloud?: boolean }) => void
  // ── preSave contract（cloud 层盲调，body 注入实现）──
  preSave?: (content: string) => Promise<string>
}

export function useEditorFile(options: EditorFileOptions) {
  const {
    editorType, editorBasePath, localValue, postTitle, isDefaultTitle, postId, postStatus,
    postDate, postUpdated, postTags, postSlug, postFont, postAuthor, postAIGenerated,
    slideshowConfig, isCloudEditing, isAboutMode,
    buildSavedFm, normalizeBody, activeModal, showToast, t, currentFileHandle, currentFilePath, savedContent, savedFm,
    route, router, locale, assetMap,
    escapeHtml, CHRONICLE_FM_KEYS, stringifyFrontmatter,
    pushRecentProject,
    preSave,
  } = options

  // ══════════════════════════════════════════════════════
  // 状态
  // ══════════════════════════════════════════════════════

  /** 正在保存中（禁用保存按钮、显示 spinner） */
  const isSaving = ref(false)
  /** 正在触发 Astro SSG 构建 */
  const isBuilding = ref(false)
  /** 最近一次保存时间（ISO 字符串），用于状态栏展示 */
  const lastSavedTime = ref('')
  /** 保存/发布弹窗中编辑的临时标题 */
  const tempTitle = ref('')

  // ══════════════════════════════════════════════════════
  // 文件内容构建
  // ══════════════════════════════════════════════════════

  /**
   * 将当前 frontmatter 状态 + 正文序列化为完整 .md 文件内容。
   *
   * 幻灯片特殊处理：
   *   - 检测正文中的 Marp frontmatter（`marp: true`, `theme:`, `size:` 等）
   *   - 将 Marp 专属键合并到 Chronicle frontmatter 中
   *   - 合并 slideshowConfig 面板设置（theme, ratio, footer）
   */
  function buildFileContent(): string {
    console.log('[buildFileContent] building...')
    const now = new Date().toISOString()
    const fm: Record<string, any> = {
      title: postTitle.value || '',
      date: postDate.value || now,
      updatedAt: postUpdated.value || now,
      tags: postTags.value.length ? postTags.value : [],
      author: postAuthor.value || '',
      aiGenerated: postAIGenerated.value || false,
      status: postStatus.value === 'local' ? 'draft' : postStatus.value,
    }
    if (editorType.value !== 'slides') {
      fm.font = postFont.value || 'sans'
    }
    // Slug lives in the directory name, NOT in frontmatter.
    // Derived on save by deriveSlug() / doImport() — not auto-filled into input.
    let body = localValue.value
    if (editorType.value === 'slides') {
      const { marp, cleanBody } = extractMarpKeys(body, CHRONICLE_FM_KEYS)
      body = cleanBody
      Object.assign(fm, marp)
      fm.marp = true
      // slideshowConfig 面板设置作为 fallback（正文 Marp FM 优先）
      const ss = slideshowConfig.value || {}
      if (ss.theme && !fm.theme) fm.theme = ss.theme
      if (ss.ratio && !fm.size) fm.size = ss.ratio
      if (ss.footer && !fm.footer) fm.footer = ss.footer
    }
    const result = stringifyFrontmatter(fm, body)
    console.log('[buildFileContent] result length:', result?.length ?? 0, 'slug:', postSlug.value, 'title:', fm.title)
    console.log('[buildFileContent] frontmatter keys:', Object.keys(fm).join(', '))
    return result
  }

  // ══════════════════════════════════════════════════════
  // 本地文件写入
  // ══════════════════════════════════════════════════════

  /**
   * 写入 File System Access API 文件句柄。
   * 兼容新旧 API：createWritable（现代）/ write（旧版）。
   */
  async function writeFileHandle(handle: any, contents: string) {
    if (!handle) return false
    try {
      if (handle.createWritable) {
        const writable = await handle.createWritable()
        await writable.write(contents)
        await writable.close()
        return true
      } else if (handle.write) {
        await handle.write(contents)
        return true
      }
    } catch (e) { console.error('writeFileHandle error', e) }
    return false
  }

  /**
   * 保存到当前文件句柄（已有路径）。
   * 无句柄时退化为 saveAs()。
   */
  async function saveFile() {
    try {
      console.log('[saveFile] currentFileHandle:', !!currentFileHandle.value, 'currentFilePath:', currentFilePath.value)
      if (currentFileHandle.value) {
        if (!postDate.value) postDate.value = new Date().toISOString()
        const contents = buildFileContent()
        console.log('[saveFile] writing via file handle, content length:', contents.length)
        const ok = await writeFileHandle(currentFileHandle.value, contents)
        console.log('[saveFile] writeFileHandle returned:', ok)
        if (ok) {
          savedContent.value = editorType.value === 'slides' ? localValue.value : normalizeBody(localValue.value)
          savedFm.value = buildSavedFm()
          pushRecentProject({ title: postTitle.value, path: currentFilePath.value || undefined, cloud: false })
          showToast(t('editor.file.savedToFile') as string)
          activeModal.value = 'none'
          return true
        }
      }
      console.log('[saveFile] no handle, falling back to saveAs')
      return await saveAs()
    } catch (e) { console.error('[saveFile] failed', e); return false }
  }

  /**
   * 另存为：优先 File System Access API 弹出保存对话框，
   * 浏览器不支持时 fallback 到 Blob 下载。
   */
  function safeFilename(title: string): string {
    // 保留中文等 Unicode，只替换文件系统非法字符
    const name = (title || 'untitled').trim()
    // 去掉路径分隔符和其他非法字符
    const cleaned = name.replace(/[\\/:*?"<>|]/g, '_').trim()
    return cleaned || 'untitled'
  }

  async function saveAs() {
    if (!postDate.value) postDate.value = new Date().toISOString()
    const contents = buildFileContent()
    const filename = safeFilename(postTitle.value) + '.md'

    // 优先 File System Access API
    if ((window as any).showSaveFilePicker) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: filename,
          types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md'] } }],
        })
        const ok = await writeFileHandle(handle, contents)
        if (ok) {
          currentFileHandle.value = handle
          currentFilePath.value = handle.name || null
          savedContent.value = editorType.value === 'slides' ? localValue.value : normalizeBody(localValue.value)
          savedFm.value = buildSavedFm()
          pushRecentProject({ title: postTitle.value, path: currentFilePath.value || undefined, cloud: false })
          showToast(t('editor.file.savedToFile') as string)
          activeModal.value = 'none'
          return true
        }
      } catch (e: any) {
        if (e?.name === 'AbortError') return false // 用户主动取消 — 静默
        // API 调用失败（非取消）— 继续走下载 fallback
      }
    }

    // 下载 fallback（API 不支持或调用失败）
    const blob = new Blob([contents], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    activeModal.value = 'none'
    showToast(t('editor.file.savedToFile') as string)
    return true
  }

  // ══════════════════════════════════════════════════════

  // ══════════════════════════════════════════════════════

  // ══════════════════════════════════════════════════════
  // 导出
  // ══════════════════════════════════════════════════════

  /** 写文件或下载：优先 File System API，否则 Blob 下载 */
  async function writeOrDownload(contents: string | Blob, filename: string, mimeType: string) {
    if ((window as any).showSaveFilePicker) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: filename,
          types: [{ description: mimeType.split('/')[1]?.toUpperCase() || 'File', accept: { [mimeType]: [`.${filename.split('.').pop()}`] } }],
        })
        if (handle.createWritable) {
          const writable = await handle.createWritable()
          await writable.write(contents)
          await writable.close()
          return true
        }
      } catch (e: any) {
        if (e?.name === 'AbortError') return false
      }
    }
    // 下载 fallback
    const blob = contents instanceof Blob ? contents : new Blob([contents], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    return true
  }

  /** 导出为自包含 HTML 文件（无外部依赖）。Slides 使用 Marp 渲染。 */
  async function exportAsHTML() {
    try {
      const ext = '.html'
      const filename = safeFilename(postTitle.value || (editorType.value === 'slides' ? 'slides' : 'untitled')) + ext
      let fullHtml: string
      if (editorType.value === 'slides') {
        const { html, css } = await renderSlidesToHTML(localValue.value)
        fullHtml = buildSlidesStandaloneHtml(postTitle.value, html, css, locale.value || 'en')
      } else {
        const renderedHtml = await renderStaticHTML(localValue.value)
        fullHtml = buildArticleStandaloneHtml(postTitle.value, renderedHtml, locale.value || 'en', postFont.value)
      }
      await writeOrDownload(fullHtml, filename, 'text/html')
      activeModal.value = 'none'
    } catch (e) { console.error('exportAsHTML failed', e) }
  }

  /** 导出为 PPTX（仅幻灯片）。使用 Marp 渲染后转换为 PowerPoint 幻灯片。 */
  async function exportAsPPTX() {
    if (editorType.value !== 'slides') return
    try {
      const filename = safeFilename(postTitle.value || 'slides') + '.pptx'
      const { html } = await renderSlidesToHTML(localValue.value)
      const sections = extractSlideSections(html)

      const pptx = new pptxgen()
      pptx.layout = 'LAYOUT_16x9'
      pptx.author = postAuthor.value || 'Chronicle'
      pptx.title = postTitle.value || 'Slides'

      for (const sectionHTML of sections) {
        const slide = pptx.addSlide()
        const texts = parseSlideHTMLToTextObjects(sectionHTML)
        if (texts.length > 0) {
          slide.addText(texts, { x: '5%', y: '5%', w: '90%', h: '90%', valign: 'top' })
        } else {
          slide.addText(`Slide ${sections.indexOf(sectionHTML) + 1}`, {
            x: '10%', y: '40%', w: '80%', h: '20%',
            fontSize: 24, color: '999999', align: 'center',
          })
        }
      }

      // pptxgenjs writeFile 自带文件保存对话框，直接使用
      await pptx.writeFile({ fileName: filename })
      activeModal.value = 'none'
    } catch (e: any) {
      if (e?.name !== 'AbortError') console.error('exportAsPPTX failed', e)
    }
  }

  // ══════════════════════════════════════════════════════
  // 认证工具
  // ══════════════════════════════════════════════════════

  /** 本地优先 — 无认证门槛 */
  const requireCloudAuth = (): boolean => true

  // ══════════════════════════════════════════════════════
  // Astro 构建
  // ══════════════════════════════════════════════════════

  /**
   * 触发 Astro SSG 构建。
   * 设置 isBuilding 标志，构建完成后更新 postStatus 为 'published'。
   */
  async function triggerAstroBuild(postIdVal: string) {
    const source = postIdVal === '__about__'
      ? (t('notification.source.aboutPublish') as string)
      : (t('notification.source.publish') as string)
    isBuilding.value = true
    try {
      await triggerBuild({ source, postId: postIdVal, t: (k: string) => t(k) as string })
      postStatus.value = 'published'
    } catch {} finally {
      isBuilding.value = false
    }
  }

  // ══════════════════════════════════════════════════════
  // 保存 / 发布流程
  // ══════════════════════════════════════════════════════

  /** 关闭所有模态框 */
  function closeModals() {
    activeModal.value = 'none'
  }

  /**
   * 本地直接保存（不弹窗）。
   * 本地模式下调用此函数。
   */
  async function saveLocalDirect(titleArg?: string) {
    try {
      console.log('[saveLocalDirect] called, titleArg:', titleArg)
      const titleToKeep = (titleArg && titleArg.trim())
        ? titleArg.trim()
        : (isDefaultTitle.value ? t('editor.untitled') : postTitle.value)
      const now = new Date().toISOString()
      postId.value = null
      postTitle.value = titleToKeep
      postStatus.value = 'local'
      postUpdated.value = now
      if (!postDate.value) postDate.value = now
      savedContent.value = editorType.value === 'slides' ? localValue.value : normalizeBody(localValue.value)
      savedFm.value = buildSavedFm()
      console.log('[saveLocalDirect] calling saveFile')
      return await saveFile()
    } catch (e) { console.error('[saveLocalDirect] failed', e); return false }
  }

  /** 工具栏保存按钮入口：本地直接写文件，仓库直接写盘保持当前 status */
  function handleTopRightSave(_type?: 'draft' | 'publish') {
    if (!isCloudEditing.value) { void saveLocalDirect(); return }
    // Repo: status preserved — draft stays draft, published stays published
    const action = _type || (postStatus.value === 'published' ? 'publish' : 'draft') as 'draft' | 'publish'
    void doSave(action)
  }

  /**
   * 核心保存逻辑 — 根据环境和意图分发到三条路径之一。
   *
   * 路径 1: 本地      → saveFile() 写入本地文件系统/下载
   * 路径 2: 上传      → 分配云端 ID → 递归 doSave('publish')
   * 路径 3: 云端草稿/发布 → POST /api/post → 可选触发 Astro 构建
   *
   * @param action 'local' → 写本地文件 ｜ 'draft'/'publish' → 写仓库，决定 status
   */
  async function doSave(action?: 'local' | 'draft' | 'publish') {
    console.log('[doSave] ═══════════════════════════════════════════════')
    console.log('[doSave] action:', action, 'postId:', postId.value, 'isCloudEditing:', isCloudEditing.value)
    console.log('[doSave] isAboutMode:', isAboutMode.value, 'hasPreSave:', !!preSave, 'postStatus:', postStatus.value)
    console.log('[doSave] activeModal:', activeModal.value)
    // ══ About 页面 — 同仓库保存流程，写 data/__about/index.md ══
    if (isAboutMode.value) {
      console.log('[doSave] → about branch')
      isSaving.value = true
      try {
        const content = buildFileContent()
        const ok = await saveAbout(content)
        console.log('[doSave] saveAbout returned:', ok)
        if (!ok) throw new Error('Save failed')
        savedContent.value = editorType.value === 'slides' ? localValue.value : normalizeBody(localValue.value)
        activeModal.value = 'none'
        showToast(t('editor.saved') as string, { status: 'success', position: 'bottom-center', shape: 'capsule' })
        const settings = settingsStore.value
        if (settings?.autoBuildOnPublish) { try { await triggerAstroBuild('__about__') } catch {} }
      } catch (e: any) {
        console.error('[doSave] about save failed:', e)
        showToast((e?.message || t('editor.saveFailed')) as string, { status: 'error', position: 'bottom-center', shape: 'capsule' })
      } finally { isSaving.value = false }
      return
    }

    // ══ 绿色分支：preSave contract 存在时，委托 cloud/useCloudSave ══
    if (preSave && action !== 'local') {
      console.log('[doSave] → preSave/cloud branch')
      const intent = action || (activeModal.value || 'draft')
      console.log('[doSave] intent:', intent)
      if (intent === 'local') {
        console.log('[doSave] intent is local, skipping cloud')
        // 本地保存不走 cloud
      } else {
        const cloudCtx = {
          preSave,
          buildFileContent,
          setLocalValue: (v: string) => { localValue.value = v },
          postId: postId.value,
          localValue: localValue.value,
          draftMeta: {
            title: postTitle.value, tags: postTags.value, author: postAuthor.value,
            aiGenerated: postAIGenerated.value,
            date: postDate.value || undefined,
            font: postFont.value,
            slideshow: slideshowConfig.value,
          } as DraftMeta,
          router,
          showToast,
          t,
        }
        console.log('[doSave] creating cloud save with postId:', cloudCtx.postId)
        const cloud = createCloudSave({
          savePost: (payload) => savePost(payload),
          saveDraft: (id, content, meta) => _saveDraft(id, content, meta),
          clearDraft: (id) => _clearDraft(id),
        })

        isSaving.value = true
        try {
          const status = intent === 'publish' ? 'published' : 'draft'
          console.log('[doSave] computed status:', status)
          console.log('[doSave] calling cloud.save...')
          const { result, processed } = await cloud.save(status, cloudCtx)
          console.log('[doSave] cloud.save returned: result=', result ? JSON.stringify(result) : 'null', 'processed len=', processed?.length ?? 0)
          if (result) {
            if (processed) localValue.value = processed
            if (result.id) postId.value = result.id
            postStatus.value = status as typeof postStatus.value
            postUpdated.value = new Date().toISOString()
            savedContent.value = editorType.value === 'slides' ? localValue.value : normalizeBody(localValue.value)
            savedFm.value = buildSavedFm()
            activeModal.value = 'none'
            showToast(t('editor.saved') as string, { status: 'success', position: 'bottom-center', shape: 'capsule' })
            console.log('[doSave] save SUCCESS, postId now:', postId.value)
          } else {
            console.error('[doSave] cloud.save returned null/empty result')
          }
        } catch (e: any) {
          console.error('[doSave] cloud save exception:', e)
          showToast((e?.message || t('editor.saveFailed')) as string, { status: 'error', position: 'bottom-center', shape: 'capsule' })
        } finally { isSaving.value = false }
        return
      }
    }

    // ── 路径 1: 本地保存 ──
    const intent = action || (activeModal.value || 'draft')
    console.log('[doSave] → local save branch, intent:', intent)
    if (intent === 'local' || !intent && (!isCloudEditing.value && activeModal.value !== 'publish')) {
      const titleToKeep = (tempTitle.value && tempTitle.value.trim())
        ? tempTitle.value
        : (isDefaultTitle.value ? t('editor.untitled') : postTitle.value)
      const now = new Date().toISOString()
      postId.value = null
      postTitle.value = titleToKeep
      postStatus.value = 'local'
      postUpdated.value = now
      if (!postDate.value) postDate.value = now
      savedContent.value = editorType.value === 'slides' ? localValue.value : normalizeBody(localValue.value)
      savedFm.value = buildSavedFm()
      activeModal.value = 'none'
      console.log('[doSave] calling saveFile...')
      const fileResult = await saveFile()
      console.log('[doSave] saveFile returned:', fileResult)
      return
    }
    console.log('[doSave] ⚠️ No branch matched! action:', action, 'activeModal:', activeModal.value, 'isCloudEditing:', isCloudEditing.value)
  }

  // 打印预览
  // ══════════════════════════════════════════════════════

  /** 构建打印快照（通过 localStorage token 传递到打印页面） */
  function buildPrintSnapshot() {
    return {
      title: postTitle.value, content: localValue.value, font: postFont.value,
      assetMap: assetMap.value, postId: postId.value, postStatus: postStatus.value,
      postDate: postDate.value, postUpdated: postUpdated.value,
      tags: postTags.value, author: postAuthor.value, aiGenerated: postAIGenerated.value,
      locale: locale.value, createdAt: Date.now(),
      editorType: editorType.value,
    }
  }

  async function openPrintPreview(printOptions?: { autoPrint?: boolean }) {
    // 打印准备遮罩
    const overlay = document.createElement('div')
    overlay.id = 'chronicle-print-overlay'
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99998;background:rgba(0,0,0,.65);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;font-family:var(--app-font-stack)'
    overlay.innerHTML = '<div style="background:#1e1e1e;color:#e5e7eb;padding:24px 40px;border-radius:12px;font-size:16px;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,.3)"><div style="width:32px;height:32px;border:3px solid var(--border-color,#444);border-top-color:var(--accent,#3b82f6);border-radius:50%;animation:spin .8s linear infinite;margin:0 auto 16px"></div><span>' + (t('editor.printLoading') || 'Preparing print…') + '</span></div>'
    document.body.appendChild(overlay)
    // 注入 spinner 动画
    if (!document.getElementById('chronicle-spin-keyframes')) {
      const kf = document.createElement('style')
      kf.id = 'chronicle-spin-keyframes'
      kf.textContent = '@keyframes spin{to{transform:rotate(360deg)}}'
      document.head.appendChild(kf)
    }
    try {
      let printHtml: string
      if (editorType.value === 'slides') {
        const { html, css } = await renderSlidesToHTML(localValue.value || '')
        printHtml = buildSlidesPrintHtml(postTitle.value || '', html, css, locale.value || 'en')
      } else {
        const renderedHtml = await renderStaticHTML(localValue.value || '')
        // Print output exposes every <details> — same spirit as Mermaid fences
        // being prerendered instead of printed as code.
        printHtml = buildStandalonePrintHtml(postTitle.value || '', openAllDetails(renderedHtml), locale.value || 'en', postFont.value)
      }
      // 确保页面有 @media print 规则隐藏编辑器，只暴露打印层
      const printStyleId = 'chronicle-print-media-style'
      if (!document.getElementById(printStyleId)) {
        const style = document.createElement('style')
        style.id = printStyleId
        style.textContent = '@media print{body>*:not(#chronicle-print-frame){display:none!important}#chronicle-print-frame{position:fixed!important;inset:0!important;width:100%!important;height:100%!important;border:none!important;z-index:99999!important;background:#fff!important}}'
        document.head.appendChild(style)
      }
      // 移除旧 iframe
      const oldFrame = document.getElementById('chronicle-print-frame') as HTMLIFrameElement | null
      if (oldFrame) oldFrame.remove()
      // 创建打印层 iframe——用户不可见（被编辑器覆盖），打印时才暴露
      const frame = document.createElement('iframe')
      frame.id = 'chronicle-print-frame'
      frame.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:none;z-index:-1;background:#fff'
      document.body.appendChild(frame)
      const doc = frame.contentDocument || frame.contentWindow?.document
      if (!doc) throw new Error('Cannot access iframe document')
      doc.open()
      doc.write(printHtml)
      doc.close()
      // 等字体 / 外链 CSS / 图片就绪后再打印（防重入）
      let printed = false
      const doPrint = () => {
        if (printed) return
        printed = true
        try {
          if (printOptions?.autoPrint !== false) {
            try { frame.contentWindow?.print() } catch {}
          }
        } finally {
          overlay.remove()
        }
      }
      const waitForFontsAndStyles = async () => {
        try {
          const fonts = frame.contentWindow?.document.fonts
          if (fonts?.ready) await fonts.ready
        } catch {}
        const links = Array.from(doc.querySelectorAll('link[rel="stylesheet"]'))
        await Promise.all(links.map((link) => new Promise<void>((resolve) => {
          if ((link as HTMLLinkElement).sheet) { resolve(); return }
          const done = () => resolve()
          link.addEventListener('load', done, { once: true })
          link.addEventListener('error', done, { once: true })
          setTimeout(done, 3000)
        })))
        // Google Fonts is imported via CSS @import, not a <link>; give it a tick.
        await new Promise<void>((resolve) => setTimeout(resolve, 100))
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        })
      }
      const waitImages = () => {
        const imgs = frame.contentDocument?.querySelectorAll('img')
        if (!imgs || imgs.length === 0) { setTimeout(doPrint, 300); return }
        let pending = imgs.length
        let timeout: ReturnType<typeof setTimeout>
        const done = () => { pending--; if (pending <= 0) { clearTimeout(timeout); doPrint() } }
        timeout = setTimeout(() => doPrint(), 5000) // 5s 兜底
        imgs.forEach((img) => {
          if (img.complete && img.naturalWidth > 0) { done(); return }
          img.addEventListener('load', done, { once: true })
          img.addEventListener('error', done, { once: true })
        })
      }
      let started = false
      const startPrint = async () => {
        if (started) return
        started = true
        await waitForFontsAndStyles()
        waitImages()
      }
      frame.onload = () => { void startPrint() }
      setTimeout(() => { void startPrint() }, 200)
    } catch (e) {
      console.error('[useEditorFile] failed to open print preview', e)
      try { overlay.remove() } catch {}
    }
  }

  // ══════════════════════════════════════════════════════
  // 对外 API
  // ══════════════════════════════════════════════════════

  return {
    // 状态
    isSaving,
    isBuilding,
    lastSavedTime,
    tempTitle,
    currentFileHandle,
    currentFilePath,
    // 本地文件操作
    saveFile,
    saveAs,
    saveLocalDirect,
    buildFileContent,
    writeFileHandle,
    exportAsHTML,
    exportAsPPTX,
    // 云端操作
    doSave,
    triggerAstroBuild,
    requireCloudAuth,
    // 模态框
    handleTopRightSave,
    closeModals,
    // 打印
    buildPrintSnapshot,
    buildStandalonePrintHtml,
    openPrintPreview,
    // Mermaid
    renderMermaidBlocksInMarkdown,
  }
}
