<template>
    <div class="file-picker" :style="allowLocalPick? { 'grid-template-rows': 'auto auto 1fr auto auto' } : { 'grid-template-rows': '1fr auto auto' }">
        <!-- Part 1: Local pick (small height) -->
        <div v-if="allowLocalPick" class="local-pick">
            <label class="local-label">{{ t('filePicker.localPickLabel') || '从本地文件中选择' }}</label>
            <div class="local-actions">
                <input ref="localInput" type="file" style="display:none" @change="onLocalSelect"
                    :multiple="allowMultiple" />
                <button class="primary" @click="triggerLocalPicker">{{ t('filePicker.selectFile') || '选择文件' }}</button>
            </div>
        </div>

        <div v-if="allowLocalPick" class="cloud-area-title">
            <label>{{ t('filePicker.cloudPickLabel') || '从云端文件中选择' }}</label>
        </div>

        <!-- Part 2: Cloud resource area -->
        <div class="cloud-area">
                <div class="cloud-leftbar sidebar">
                    <!-- Source switch (only when postId provided) -->
                    <div v-if="showSourceSwitch" class="sidebar-source-switch">
                        <button type="button" class="sidebar-items"
                            :class="{ active: currentSource === 'post' }" @click="currentSource = 'post'; loadCloudFiles()">
                            <span class="icon-svg" v-html="Icons.folder"></span> {{ t('filePicker.attached') || 'Attached' }}
                        </button>
                        <button type="button" class="sidebar-items"
                            :class="{ active: currentSource === 'assets' }" @click="currentSource = 'assets'; loadCloudFiles()">
                            <span class="icon-svg" v-html="Icons.archive"></span> {{ t('filePicker.assets') || 'Assets' }}
                        </button>
                    </div>
                    <div v-if="showSourceSwitch" class="sidebar-divider"></div>
                    <button v-for="tab in fileTypeTabs" :key="tab.id" type="button" class="sidebar-items"
                        :class="{ active: activeTypeTab === tab.id }" @click="activeTypeTab = tab.id">
                        {{ tab.label }}
                    </button>
                </div>

                <div class="cloud-main">
                    <div class="cloud-toolbar">
                        <div class="segment-control-bar view-toggle">
                            <button type="button"
                                :class="['segment-control-item', 'icon-label-btn', 'view-btn', view === 'card' ? 'active' : '']"
                                @click="view = 'card'"><svg width="24" height="24" viewBox="0 0 24 24" fill="none"
                                    xmlns="http://www.w3.org/2000/svg">
                                    <rect x="2" y="2" width="7" height="7" rx="1" stroke="currentColor"
                                        stroke-width="2" />
                                    <rect x="15" y="2" width="7" height="7" rx="1" stroke="currentColor"
                                        stroke-width="2" />
                                    <rect x="2" y="15" width="7" height="7" rx="1" stroke="currentColor"
                                        stroke-width="2" />
                                    <rect x="15" y="15" width="7" height="7" rx="1" stroke="currentColor"
                                        stroke-width="2" />
                                </svg>
                                <span class="label">{{ t('filePicker.cardView') || 'Card' }}</span></button>
                            <button type="button"
                                :class="['segment-control-item', 'icon-label-btn', 'view-btn', view === 'list' ? 'active' : '']"
                                @click="view = 'list'"><svg width="24" height="24" viewBox="0 0 24 24" fill="none"
                                    xmlns="http://www.w3.org/2000/svg">
                                    <circle cx="1" cy="3" r="1.25" fill="currentColor" />
                                    <line x1="6" y1="3" x2="23" y2="3" stroke="currentColor" stroke-width="2"
                                        stroke-linecap="round" />
                                    <circle cx="1" cy="12" r="1.25" fill="currentColor" />
                                    <line x1="6" y1="12" x2="23" y2="12" stroke="currentColor" stroke-width="2"
                                        stroke-linecap="round" />
                                    <circle cx="1" cy="21" r="1.25" fill="currentColor" />
                                    <line x1="6" y1="21" x2="23" y2="21" stroke="currentColor" stroke-width="2"
                                        stroke-linecap="round" />
                                </svg><span class="label">{{ t('filePicker.listView') || 'List' }}</span></button>
                        </div>
                        <div class="right" style="display: flex; align-items: center; gap: 0.5rem;">
                            <div class="chr-fb-sort-group">
                                <select v-model="selectedSortBy" class="chr-fb-sort-select">
                                    <option value="created">{{ t('filePicker.sortByCreated') || '上传时间' }}</option>
                                    <option value="name">{{ t('filePicker.sortByName') || '文件名' }}</option>
                                    <option value="type">{{ t('filePicker.sortByType') || '文件类型' }}</option>
                                </select>
                                <button type="button" class="chr-fb-sort-toggle" :class="sortOrder"
                                    @click="toggleAscDesc"><svg xmlns="http://www.w3.org/2000/svg" width="24"
                                        height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                        stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                                        <line x1="6" y1="20" x2="6" y2="3" />
                                        <line x1="3" y1="6" x2="6" y2="3" />
                                        <line x1="10" y1="4" x2="18" y2="4" />
                                        <line x1="10" y1="9" x2="19" y2="9" />
                                        <line x1="10" y1="14" x2="20" y2="14" />
                                        <line x1="10" y1="19" x2="21" y2="19" />
                                    </svg></button>
                            </div>
                            <button type="button" class="file-op-btn icon-label-btn narrow"
                                @click="refreshCloudFiles"><span class="icon-svg" v-html="Icons.refresh"></span></button>
                            <template v-if="allowUpload">
                                <button type="button" class="file-op-btn icon-label-btn"
                                    @click="triggerUploadInput"><span class="icon-svg" v-html="Icons.plus"></span><span class="label">{{ t('filePicker.import') || 'Import' }}</span></button>
                                <input ref="uploadInput" type="file" style="display:none" @change="onUploadSelect"
                                    :multiple="allowMultiple" />
                            </template>
                        </div>
                    </div>

                    <div class="cloud-list" :class="view">
                        <div v-if="visibleFiles.length === 0" class="cloud-empty">{{ t('file.noFiles') }}</div>
                        <div v-if="view === 'card'" class="grid">
                            <div v-for="(f, idx) in visibleFiles" :key="f.key"
                                :class="['grid-item', 'file', f._justUploaded ? 'just-uploaded' : '', isSelected(f) ? 'selected' : '']"
                                draggable="true" @click="selectFile(f)" @dragstart="onDragStart($event, idx)"
                                @dragover.prevent @drop="onDrop($event, idx)">
                                <div class="thumb">
                                    <img v-if="isImage(f.name)" :src="f.preview" loading="lazy" />
                                    <div v-else class="icon scalable-icon" v-html="getIconForFile(f.name)"></div>
                                </div>
                                <div class="meta">
                                    <p class="name">{{ f.displayname || f.name }}</p>
                                    <button class="file-picker-preview-btn icon-label-btn"
                                        @click.stop="openPreview(f)"><svg width="16" height="16" viewBox="0 0 24 24"
                                            fill="none">
                                            <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" stroke="currentColor"
                                                stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
                                            </path>
                                            <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.2"
                                                stroke-linecap="round" stroke-linejoin="round"></circle>
                                        </svg><span class="label">{{ t('filePicker.preview') || 'Preview'
                                            }}</span></button>
                                </div>
                            </div>
                        </div>

                        <table v-else class="list" style="width: 100%;">
                            <thead>
                                <tr>
                                    <th class="select-col"></th>
                                    <th @click="sortBy('name')">{{ t('filePicker.name') || 'Name' }}</th>
                                    <th @click="sortBy('type')">{{ t('filePicker.type') || 'Type' }}</th>
                                    <th @click="sortBy('created')">{{ t('filePicker.created') || 'Created' }}</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="(f, idx) in visibleFiles" :key="f.key"
                                    :class="[f._justUploaded ? 'just-uploaded' : '', isSelected(f) ? 'selected' : '']"
                                    draggable="true" @dragstart="onDragStart($event, idx)" @dragover.prevent
                                    @drop="onDrop($event, idx)" @click="selectFile(f)">
                                    <td class="select-col">
                                        <div class="checkbox-indicator" :class="{ checked: isSelected(f) }">
                                            <svg v-if="isSelected(f)" xmlns="http://www.w3.org/2000/svg" width="16"
                                                height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                                stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                                <polyline points="20 6 9 17 4 12"></polyline>
                                            </svg>
                                        </div>
                                    </td>
                                    <td class="name-col">{{ f.displayname || f.name }}</td>
                                    <td class="type-col">{{ f.type }}</td>
                                    <td class="created-col">{{ formatDateTime(f.created,locale,'relative','show-weekday','hide-seconds','24h',t) }}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
        </div>

        <!-- Part 3: Selected list -->
        <div class="selected-list">
            <h4>{{ t('filePicker.selectedTitle') || '已选择' }}</h4>
            <div class="selected-items">
                <div v-if="selectedEntries.length > 0" class="selected-chips">
                    <span v-for="(item, idx) in selectedEntries" :key="item.key" class="selected-chip"
                        @click="openChipPreview(item)" title="点击预览">
                        <span class="chip-name">{{ item.displayname || item.name }}</span>
                        <button class="chip-remove" @click.stop="removeSelected(idx)" :title="t('filePicker.deselect') || '取消选择'"><span class="icon-svg" v-html="Icons.close"></span></button>
                    </span>
                </div>
                <div v-else class="empty" style="text-align: center; color: var(--comp-text-sec)">{{
                    t('filePicker.selectedNone') || '暂无选择' }}</div>
            </div>
        </div>

        <!-- Part 4: Actions -->
        <div class="picker-actions">
            <button class="secondary" @click="$emit('cancel')">{{ t('filePicker.cancel') || '取消' }}</button>
            <button class="primary" @click="confirmSelection">{{ t('filePicker.confirm') || '确认选择' }}</button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { readDir } from '../data/dataAccess'
import { ref, watch, onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePreview } from '../composables/usePreview'
import { Icons } from '../utils/icons'
import { useRoute, useRouter, onBeforeRouteUpdate, onBeforeRouteLeave } from 'vue-router'
import { formatDateTime } from '../utils/dateUtils'


const props = defineProps<{
  selectionMode?: 'single' | 'multiple' | undefined
  allowMultiple?: boolean
  allowUpload?: boolean
  initialFiles?: any[]
  allowLocalPick?: boolean
  restrictedTypes?: string[]
  source?: 'assets' | 'post'
  postId?: string
  /** 当前已选资源（如头像 /data/avatar/xxx.png）：列表里注入并预选中 */
  initialSelectedUrl?: string
}>()

const emit = defineEmits<{
    (e: 'select', file: any): void
    (e: 'update:files', files: any[]): void
    (e: 'cancel'): void
}>()

const { locale, t } = useI18n()

const router = useRouter()
const route = useRoute()

const selectionMode = props.selectionMode || (props.allowMultiple ? 'multiple' : 'single')
const allowMultiple = selectionMode === 'multiple'
const allowUpload = props.allowUpload !== false
const initialFiles = props.initialFiles || []
const allowLocalPick = props.allowLocalPick !== false
const restrictedTypes = Array.isArray(props.restrictedTypes) ? props.restrictedTypes : null

// Source: assets (public) or post directory (private)
const currentSource = ref<'assets' | 'post'>(props.source || 'assets')
const showSourceSwitch = computed(() => !!props.postId)

const localInput = ref<HTMLInputElement | null>(null)
const uploadInput = ref<HTMLInputElement | null>(null)
const view = ref<'card' | 'list'>('card')
// Default the active type tab to the first restricted type (video picker must
// open on the "video" tab, not "image"), falling back to "all" when unrestricted.
function initialActiveTab(): string {
    if (!restrictedTypes || restrictedTypes.length === 0) return 'all'
    const first = restrictedTypes[0].toLowerCase()
    const idMap: Record<string, string> = {
        image: 'image',
        video: 'video',
        audio: 'audio',
        document: 'document',
        text: 'text',
        file: 'other',
    }
    return idMap[first] || 'all'
}
const activeTypeTab = ref(initialActiveTab())
const { openPreview: openGlobalPreview, openImagePreview } = usePreview()

const fileTypeTabs = computed(() => {
    const tabs = []
    
    if (!restrictedTypes || restrictedTypes.length === 0) {
        tabs.push({ id: 'all', label: t('file.categories.all') })
    }
    
    const allowedTypes = new Set(
        (restrictedTypes || []).map((t: string) => t.toLowerCase())
    )
    
    if (allowedTypes.has('image') || allowedTypes.size === 0) {
        tabs.push({ id: 'image', label: t('file.categories.images') })
    }
    if (allowedTypes.has('video') || allowedTypes.size === 0) {
        tabs.push({ id: 'video', label: t('file.categories.videos') })
    }
    if (allowedTypes.has('audio') || allowedTypes.size === 0) {
        tabs.push({ id: 'audio', label: t('file.categories.audio') })
    }
    if (allowedTypes.has('document') || allowedTypes.size === 0) {
        tabs.push({ id: 'document', label: t('file.categories.documents') })
    }
    if (allowedTypes.has('text') || allowedTypes.size === 0) {
        tabs.push({ id: 'text', label: t('file.categories.text') })
    }
    if (allowedTypes.has('file') || allowedTypes.size === 0) {
        tabs.push({ id: 'other', label: t('file.categories.others') })
    }
    
    return tabs
})

const cloudFiles = ref<any[]>((initialFiles || []).map((f: any, i: number) => ({ ...f, key: f._localId || `f_${i}` })))
const selectedEntries = ref<any[]>([])
const visibleFiles = ref<any[]>([])

// 共用检测逻辑
function detectFileType(fileOrName: any) {
    let name: string
    let type: string = ''

    // 兼容传入 file 对象或直接传 name 字符串
    if (typeof fileOrName === 'string') {
        name = fileOrName.toLowerCase()
    } else {
        name = String(fileOrName?.name || '').toLowerCase()
        type = String(fileOrName?.type || '').toLowerCase()
    }

    // 优先使用 type 检测，再使用扩展名检测
    const isImage = /^image\//.test(type) || /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i.test(name)
    const isVideo = /^video\//.test(type) || /\.(mp4|webm|mov|mkv|avi)$/i.test(name)
    const isAudio = /^audio\//.test(type) || /\.(mp3|wav|ogg|flac|m4a|aac)$/i.test(name)
    const isDocument = /\.(pdf|docx?|pptx?|xlsx?)$/i.test(name)
    const isCode = /\.(txt|md|js|ts|json|c|cpp|h|java|py|sh|bat|ini|conf|vue|log|csv|xml|yaml|yml|rs|go|php|css|html)$/i.test(name)

    return {
        isImage,
        isVideo,
        isAudio,
        isDocument,
        isCode
    }
}

// 原 detectTypeTab 函数
function detectTypeTab(file: any) {
    const { isImage, isVideo, isAudio, isDocument, isCode } = detectFileType(file)
    if (isImage) return 'image'
    if (isVideo) return 'video'
    if (isAudio) return 'audio'
    if (isDocument) return 'document'
    if (isCode) return 'text'
    return 'other'
}

// 原 getFileType 函数（翻译键未改动）
const getFileType = (name: string) => {
    const { isImage, isAudio, isVideo, isDocument, isCode } = detectFileType(name)
    if (isImage) return t('file.type.image')
    if (isAudio) return t('file.type.audio')
    if (isVideo) return t('file.type.video')
    if (isDocument) return t('file.type.document')
    if (isCode) return t('file.type.code')
    return t('file.type.file')
}

// 原 getIconForFile 函数
const getIconForFile = (name: string) => {
    const { isImage, isAudio, isVideo, isDocument, isCode } = detectFileType(name)
    if (isImage) return Icons.image
    if (isAudio) return Icons.audio
    if (isVideo) return Icons.video
    if (isDocument) return Icons.document
    if (isCode) return Icons.codeText
    return Icons.generic
}


function refreshVisibleFiles() {
    let files = activeTypeTab.value === 'all'
        ? cloudFiles.value.slice()
        : cloudFiles.value.filter((item) => detectTypeTab(item) === activeTypeTab.value)
    
    if (restrictedTypes && restrictedTypes.length > 0) {
        files = files.filter((item) => {
            const filename = item.name || item.displayname || ''
            return isFileTypeAllowed(filename)
        })
    }
    
    visibleFiles.value = files
}

function standardizeFileType(raw: string) {
    if (raw === 'document') return 'doc'
    if (raw === 'audio') return 'sound'
    if (raw === 'video') return 'video'
    if (raw === 'image') return 'pic'
    if (raw === 'text') return 'txt'
    return raw;
}

async function loadCloudFiles() {

    try {
        const isPost = currentSource.value === 'post' && props.postId
        const dir = isPost ? `data/posts/${props.postId}` : 'data/assets'
        const urlBase = isPost ? `/data/posts/${props.postId}` : '/data/assets'
        const names = await readDir(dir)
        const filtered = isPost ? names.filter(n => n !== 'index.md' && n !== 'index.json') : names
        const list = filtered.map((name) => ({
            key: `${urlBase}/${name}`,
            name,
            size: 0,
            type: getFileTypeFromName(name),
            mimeType: null,
            url: `${urlBase}/${encodeURIComponent(name)}`,
            preview: `${urlBase}/${encodeURIComponent(name)}`,
        }))
        // 头像等目标目录里的当前资源不在 data/assets 列表里：
        // 注入一条并预选中，否则打开选择器看不到“已选中的图片”。
        const selectedUrl = props.initialSelectedUrl
            ? (props.initialSelectedUrl.startsWith('asset://')
                ? '/data/assets/' + props.initialSelectedUrl.slice(8)
                : props.initialSelectedUrl)
            : ''
        if (selectedUrl && !/^https?:\/\//i.test(selectedUrl)) {
            const selectedName = decodeURIComponent(selectedUrl.split('/').pop() || '')
            const exists = list.some((f) => f.url === selectedUrl || f.name === selectedName)
            if (!exists && selectedName) {
                list.unshift({
                    key: selectedUrl,
                    name: selectedName,
                    size: 0,
                    type: getFileTypeFromName(selectedName),
                    mimeType: null,
                    url: selectedUrl,
                    preview: selectedUrl,
                })
            }
        }
        cloudFiles.value = list
        refreshVisibleFiles()
    } catch (e) {
        console.error('loadCloudFiles failed', e)
        cloudFiles.value = []
        refreshVisibleFiles()
    }
}

function getFileTypeFromName(filename: string): string {
    const name = filename.toLowerCase()
    if (/\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i.test(name)) return 'image'
    if (/\.(mp4|avi|mov|mkv|webm)$/i.test(name)) return 'video'
    if (/\.(mp3|wav|ogg|flac|m4a|aac)$/i.test(name)) return 'audio'
    if (/\.(pdf|doc|docx|ppt|pptx|xls|xlsx)$/i.test(name)) return 'document'
    if (/\.(txt|md|js|ts|json|c|cpp|h|java|py|sh|bat|ini|log|csv|xml|yaml|yml|vue|css|html|rs|go|php)$/i.test(name)) return 'text'
    return 'file'
}

function mapTypeToCategory(fileType: string): string | null {
    const typeMap: Record<string, string> = {
        'image': 'pic',
        'video': 'video',
        'audio': 'sound',
        'document': 'doc',
        'text': 'txt',
        'file': 'other'
    }
    return typeMap[fileType] || null
}

function getCategoriesFromRestrictedTypes(): string[] {
    if (!restrictedTypes || restrictedTypes.length === 0) return []
    
    const categories = new Set<string>()
    for (const type of restrictedTypes) {
        const typeLower = type.toLowerCase()
        
        if (typeLower === 'image') categories.add('pic')
        else if (typeLower === 'video') categories.add('video')
        else if (typeLower === 'audio') categories.add('sound')
        else if (typeLower === 'document') categories.add('doc')
        else if (typeLower === 'text') categories.add('txt')
        else if (typeLower === 'file') categories.add('other')
    }
    
    return Array.from(categories)
}

function isFileTypeAllowed(filename: string, mimeType?: string): boolean {
    if (!restrictedTypes || restrictedTypes.length === 0) return true
    
    const fileType = getFileTypeFromName(filename)
    const ext = filename.split('.').pop()?.toLowerCase() || ''
    
    return restrictedTypes.some((allowed: string) => {
        const allowedLower = allowed.toLowerCase()
        
        if (allowedLower === fileType) return true
        
        if (allowedLower.startsWith('.')) {
            return ext === allowedLower.slice(1)
        }
        
        if (allowedLower.includes('/')) {
            if (mimeType) {
                return mimeType.toLowerCase().startsWith(allowedLower)
            }
            return false
        }
        
        return ext === allowedLower
    })
}

function triggerLocalPicker() {
    // Electron: use <input type="file"> which preserves file.path for
    // file:/// URL generation. showOpenFilePicker creates in-memory Files
    // that lose the filesystem path, breaking fileToUrl().
    const isElectron = !!(window as any).chronicleElectron?.isElectron
    if ((window as any).showOpenFilePicker && !isElectron) {
        const options: any = { multiple: allowMultiple }
        if (restrictedTypes && restrictedTypes.length > 0) {
            const accept: Record<string, string[]> = {}
            restrictedTypes.forEach((type: string) => {
                const typeLower = type.toLowerCase()
                if (typeLower === 'image') {
                    accept['image/*'] = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico']
                } else if (typeLower === 'video') {
                    accept['video/*'] = ['.mp4', '.avi', '.mov', '.mkv', '.webm']
                } else if (typeLower === 'audio') {
                    accept['audio/*'] = ['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac']
                } else if (typeLower === 'document') {
                    accept['application/*'] = ['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx']
                } else if (typeLower.startsWith('.')) {
                    const ext = typeLower.slice(1)
                    if (!accept['*/*']) accept['*/*'] = []
                    accept['*/*'].push(typeLower)
                }
            })
            if (Object.keys(accept).length > 0) {
                options.types = Object.entries(accept).map(([description, extensions]) => ({
                    description,
                    accept: { '*/*': extensions }
                }))
            }
        }
        ; (window as any).showOpenFilePicker(options).then(async (handles: any[]) => {
            for (const handle of handles) {
                try {
                    const file = await handle.getFile()
                    if (!isFileTypeAllowed(file.name, file.type)) {
                        console.warn(`File type not allowed: ${file.name}`)
                        continue
                    }
                    const data: any = await toFileEntry(file)
                    // Image preview kept for thumbnail display only
                    addToSelectedPool(data)
                } catch (e) { console.error('local pick failed', e) }
            }
        }).catch(() => { })
    } else {
        localInput.value?.click()
    }
}

function onLocalSelect(e: Event) {
    const target = e.target as HTMLInputElement
    if (!target.files) return
    for (let i = 0; i < target.files.length; i++) {
        const f = target.files[i]
        if (!isFileTypeAllowed(f.name, f.type)) {
            console.warn(`File type not allowed: ${f.name}`)
            continue
        }
        toFileEntry(f).then((data: any) => {
            addToSelectedPool(data)
        })
    }
    target.value = ''
}

function triggerUploadInput() { uploadInput.value?.click() }

async function onUploadSelect(e: Event) {
    const target = e.target as HTMLInputElement
    if (!target.files) return
    for (let i = 0; i < target.files.length; i++) {
        const f = target.files[i]
        const data: any = await toFileEntry(f)
        data._uploading = true
        uploadFileToServer(f).then((url) => {
            data.uploadedUrl = url
            data._justUploaded = true
            data._uploading = false
            void loadCloudFiles()
        }).catch(() => {
            data._uploading = false
        })
    }
    target.value = ''
}

async function uploadFileToServer(file: File) {
    try {
        const isElec = typeof window !== 'undefined' && !!(window as any).chronicleElectron?.isElectron
        const safeName = file.name.replace(/[^\w.\-一-鿿]/g, '_')
        const isPost = currentSource.value === 'post' && props.postId
        const destDir = isPost ? `data/posts/${props.postId}` : 'data/assets'
        const urlBase = isPost ? `/data/posts/${props.postId}` : '/data/assets'
        if (isElec) {
            const buf = await file.arrayBuffer()
            const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)))
            await (window as any).chronicleElectron.writeBase64(`${destDir}/${safeName}`, base64)
        } else {
            const buf = await file.arrayBuffer()
            const resp = await fetch('/api/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/octet-stream', 'x-filename': encodeURIComponent(safeName), 'x-dest': encodeURIComponent(destDir) },
                body: new Blob([new Uint8Array(buf)]),
            })
            if (!resp.ok) return null
        }
        return `${urlBase}/${encodeURIComponent(safeName)}`
    } catch (e) {
        console.error('upload failed', e)
        return null
    }
}

const isImage = (name: string) => /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i.test(name)


const openPreview = async (file: any) => {
    // Resolve URL: server original → local blob → upload path → File blob
    // Note: file.preview may be a thumbnail for cloud files, so prefer
    // uploadedUrl/url (the original) first.
    const url = file.uploadedUrl || file.url || file.preview
        || (file.path ? `/server/data/upload/${file.path}` : '')
        || (file.file ? fileToBlobUrl(file.file) : '')
    if (!url) return
    if (isImage(file.name)) {
        openImagePreview(url)
    } else {
        openGlobalPreview({
            name: file.name,
            path: url,
            type: getFileType(file.name)
        })
    }
}

/** Preview a chip entry — reuse the same imperative preview as cloud files */
function openChipPreview(item: any) {
    openPreview(item)
}

async function toFileEntry(file: File) {
    const preview = file.type.startsWith('image/') ? fileToBlobUrl(file) : null
    return { key: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`, name: file.name, type: file.type || 'file', file, preview }
}

function fileToBlobUrl(file: File): string | null {
    try {
        return URL.createObjectURL(file)
    } catch (e) {
        console.error('fileToBlobUrl failed', e)
        return null
    }
}

function isSelected(f: any) {
    return selectedEntries.value.some((s: any) => s.key === f.key)
}

function addToSelectedPool(fileEntry: any) {
    if (!fileEntry) return
    const idx = selectedEntries.value.findIndex((item: any) => item.key === fileEntry.key)
    if (idx >= 0) {
        if (!allowMultiple) {
            selectedEntries.value = []
        } else {
            selectedEntries.value.splice(idx, 1)
        }
        return
    }

    if (!allowMultiple) {
        selectedEntries.value = [fileEntry]
        return
    }

    selectedEntries.value.push(fileEntry)
}

function selectFile(f: any) {
    const filename = f.name || f.displayname || ''
    if (!isFileTypeAllowed(filename)) {
        console.warn(`File type not allowed: ${filename}`)
        return
    }

    const idx = selectedEntries.value.findIndex((s: any) => s.key === f.key)

    if (idx >= 0) {
        selectedEntries.value.splice(idx, 1)
        return
    }

    if (!allowMultiple) {
        selectedEntries.value = [f]
        return
    }

    selectedEntries.value.push(f)
}



function removeSelected(idx: number) { selectedEntries.value.splice(idx, 1) }

function confirmSelection() {
    // Normalize asset URLs to asset:// protocol
    const toAsset = (u: string) => (u && u.includes('/data/assets/')) ? `asset://${u.split('/data/assets/')[1]}` : u

    if (allowMultiple) {
        if (selectedEntries.value.length === 0) return
        const entries = selectedEntries.value.slice().map((item: any) => ({
            ...item,
            url: toAsset(item.url),
            uploadedUrl: toAsset(item.url || item.uploadedUrl)
        }))
        emit('select', entries)
    } else {
        if (selectedEntries.value.length === 0) return
        const item = selectedEntries.value[0]
        const entry = {
            ...item,
            url: toAsset(item.url),
            uploadedUrl: toAsset(item.url || item.uploadedUrl)
        }
        emit('select', entry)
    }
}

function clearSelectionsIfMissing() {
    selectedEntries.value = selectedEntries.value.filter((selected) =>
        cloudFiles.value.some((item) => item.key === selected.key),
    )
}

// Sorting and drag functions (reuse existing)
const sortKey = ref<string | null>(null)
const sortDir = ref<'asc' | 'desc'>('asc')

// New sorting controls
const selectedSortBy = ref<'created' | 'name' | 'type'>('created')
const sortOrder = ref<'asc' | 'desc'>('desc')

function sortBy(key: string) {
    const keyMap: Record<string, 'created' | 'name' | 'type'> = {
        'created': 'created',
        'name': 'name',
        'type': 'type'
    }

    const sortKey = keyMap[key]
    if (!sortKey) return

    if (selectedSortBy.value === sortKey) {
        sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
    } else {
        selectedSortBy.value = sortKey
        sortOrder.value = 'asc'
    }
}

function toggleAscDesc() {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
}

function applySort() {
    if (selectedSortBy.value === 'created') {
        cloudFiles.value.sort((a, b) => {
            const timeA = a.created || 0
            const timeB = b.created || 0
            return sortOrder.value === 'asc' ? timeA - timeB : timeB - timeA
        })
    } else if (selectedSortBy.value === 'name') {
        cloudFiles.value.sort((a, b) => {
            const nameA = a.displayname || a.name
            const nameB = b.displayname || b.name
            const result = nameA.localeCompare(nameB)
            return sortOrder.value === 'asc' ? result : -result
        })
    } else if (selectedSortBy.value === 'type') {
        cloudFiles.value.sort((a, b) => {
            const typeA = a.type || ''
            const typeB = b.type || ''
            const result = typeA.localeCompare(typeB)
            return sortOrder.value === 'asc' ? result : -result
        })
    }
}

let dragIndex: number | null = null

// Watch for sort changes and apply sorting
watch([selectedSortBy, sortOrder], () => {
    applySort()
}, { immediate: true })

function onDragStart(e: DragEvent, idx: number) { dragIndex = idx; try { e.dataTransfer?.setData('text/plain', String(idx)) } catch (e) { } }
function onDrop(e: DragEvent, idx: number) {
    try {
        const src = dragIndex !== null ? dragIndex : Number(e.dataTransfer?.getData('text/plain'))
        if (!Number.isInteger(src)) return
        const item = cloudFiles.value.splice(src, 1)[0]
        cloudFiles.value.splice(idx, 0, item)
        refreshVisibleFiles()
    } catch (err) { console.error(err) }
}


function refreshCloudFiles() {
    loadCloudFiles()
}

function preselectInitial() {
    const target = props.initialSelectedUrl
    if (!target || selectedEntries.value.length) return
    if (/^https?:\/\//i.test(target)) return
    const url = target.startsWith('asset://') ? '/data/assets/' + target.slice(8) : target
    const f = cloudFiles.value.find((x) => x.url === url || x.key === url)
    if (f) selectedEntries.value = [f]
}

onMounted(async () => {
    await loadCloudFiles()
    preselectInitial()
})

// 当前值异步到达（如头像目录自动发现）时补一次预选中
watch(() => props.initialSelectedUrl, () => {
    preselectInitial()
})



watch(() => (props as any).initialFiles, (v) => {
    cloudFiles.value = (v || []).map((f: any, i: number) => ({ ...f, key: f._localId || `f_${i}` }))
    clearSelectionsIfMissing()
})

watch([cloudFiles, activeTypeTab], () => {
    refreshVisibleFiles()
}, { immediate: true, deep: true })

watch(() => props.selectionMode, () => {
    const nextMode = props?.selectionMode || (props?.allowMultiple ? 'multiple' : 'single')
    if (nextMode === 'single' && selectedEntries.value.length > 1) {
        selectedEntries.value = selectedEntries.value.slice(0, 1)
    }
})
</script>

<style scoped>
.file-picker {
    width: 100%;
    display: grid;
    grid-template-rows: auto auto 1fr auto auto;
    height: min(80vh, 800px);
    min-height: 200px;
}

.local-pick {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: .75rem 1rem;
    border-bottom: 1px solid var(--border-color)
}


.local-actions button {
    margin-left: .5rem
}

.cloud-area-title {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: .75rem 1rem;
}

.cloud-area-title label{
    font-weight: 600;
    font-variation-settings: 'wght' 600;
}

.cloud-area {
    display: flex;
    flex: 1;
    gap: .75rem;
    padding: .75rem 0;
    min-height: 0;
    position: relative;
    border-bottom: 1px solid var(--border-color);
    overflow: hidden;
}

.sidebar-source-switch {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 4px;
}

.sidebar-source-switch .sidebar-items {
    gap: 6px;
}

.sidebar-source-switch .icon-svg, .sidebar-source-switch :deep(svg){
    width: 16px;
    height: 16px;
}

.sidebar-divider {
    height: 1px;
    background: var(--border-color);
    margin: 4px 0 8px;
}

.cloud-leftbar {
    background: transparent;
    border: none;
    box-shadow: none;
    padding: .5rem;
    margin-left: .75rem;
    font-size: .9rem;
    overflow-y: auto;
    width: min(240px, 20%);
    gap: .5rem;
    flex-shrink: 0;
}

.cloud-leftbar .sidebar-items {
    border-radius: 8px;
}

.view-toggle {
    height: 26px;
    border-radius: 12px;
}

.view-toggle .segment-control-item {
    padding: 0 .8rem;
    font-size: .85rem;
}

.view-btn {
    font-size: .85rem;
    gap: 6px;
}

.view-btn svg {
    width: 14px;
    height: 14px;
}

.type-tab {
    text-align: left;
    width: 100%;
    border: 1px solid var(--border-color);
    background: transparent;
    border-radius: 10px;
    padding: .45rem .6rem
}

.type-tab.active {
    background: var(--comp-bg);
    font-weight: 600
}

.cloud-main {
    flex: 1;
    min-width: 0;
    position: relative;
}

.cloud-toolbar {
    height: 40px;
    display: flex;
    background: transparent;
    justify-content: space-between;
    align-items: center;
    margin-bottom: .75rem;
    padding-right: .75rem;
}

.file-op-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    font-size: 0.85rem;
    color: var(--comp-text-sec);
    border: none;
    background: transparent;
    transition: background 0.2s ease, color 0.2s ease;
}

.file-op-btn:hover:not(:disabled) {
    background: color-mix(var(--comp-text-pri-hvr) 20%, transparent);
    color: var(--comp-text-pri-hvr);
}

.file-op-btn :deep(svg),
.file-op-btn .icon-svg {
    width: 16px;
    height: 16px;
}

.file-op-btn.toggle-asc-desc svg {
    width: 20px;
    height: 20px;
}

.file-op-btn.toggle-asc-desc.desc svg {
    transform: scaleY(-1);
}

.file-op-btn.toggle-asc-desc.asc svg {
    transform: none;
}

.file-op-btn.toggle-asc-desc {
    padding: 0.4rem;
}

.file-op-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.file-picker__content {
    margin-top: 0
}

.sort-control {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.3rem;
    flex-direction: row;
}

.sort-by-select {
    appearance: none;
    -webkit-appearance: none;
    -moz-appearance: none;
    padding: 0.3rem 0.5rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    text-align: right;
    border: none;
    border-radius: 8px;
    height: 32px;
    background: transparent;
    font-size: 0.9rem;
    color: var(--comp-text-pri);
    transition: background 0.2s ease, color 0.2s ease;
}

.sort-by-select option {
    appearance: none;
    -webkit-appearance: none;
    -moz-appearance: none;


    border: 2px solid var(--select-option-border-color);
    border-radius: 8px;
    padding: 8px 12px;
    background: var(--comp-bg);
    color: var(--app-text-pri);
}

.sort-by-select:focus {
    outline: none;
    box-shadow: none;
    background: color-mix(var(--comp-text-pri-hvr) 20%, transparent);
}

.sort-by-select:hover {
    background: color-mix(var(--comp-text-pri-hvr) 20%, transparent);
}

.grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: .85rem
}

.file-picker-preview-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.75rem;
    color: var(--comp-text-sec);
    border: none;
    background: color-mix(var(--comp-text-pri-hvr) 10%, transparent);
    transition: background 0.2s ease, color 0.2s ease;
}

.file-picker-preview-btn:hover {
    background: color-mix(var(--comp-text-pri-hvr) 20%, transparent);
    color: var(--comp-text-pri-hvr);
}

.cloud-list {
    overflow-y: auto;
    height: calc(100% - 40px - 1.5rem);
}

.card {
    border: 1px solid var(--border-color);
    border-radius: 12px;
    padding: .5rem;
    display: flex;
    flex-direction: column;
    gap: .5rem
}

.cloud-list.card {
    overflow-x: hidden;
    background: transparent;
    border: none;
    padding: .5rem 1rem .5rem .5rem;
    display: flex;
    flex-direction: column;
    gap: .5rem
}

.card.selected {
    border-color: var(--accent);
    background: rgba(59, 130, 246, 0.04)
}

.thumb {
    height: 100px;
    background: transparent;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden
}

.thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover
}

.scalable-icon :deep(svg) {
    width: 36px;
    height: 36px;
}

.cloud-list.list {
    width: 100%;
    border-collapse: collapse;
    background: transparent;
    border: none;
    padding: 0;
    overflow-x: auto;
    font-size: 0.85rem
}

.list thead {
    position: sticky;
    top: 0;
    background: var(--comp-bg-sec);
    z-index: 1
}

.list th {
    text-align: left;
    cursor: pointer;
    padding: 0.4rem 0.5rem;
    font-weight: 500;
    color: var(--comp-text-sec);
    border-bottom: 1px solid var(--border-color);
    transition: color 0.2s
}

.list th:hover {
    color: var(--comp-text-pri)
}

.list tbody tr {
    cursor: pointer;
    transition: background 0.15s ease
}

.list tbody tr:hover {
    background: var(--hover)
}

.list tbody tr.selected {
    background: rgba(59, 130, 246, 0.08)
}

.list tbody tr.selected:hover {
    background: rgba(59, 130, 246, 0.12)
}

.list th {
    background: var(--comp-bg);
}

.list td,
.list th {
    padding: 0.35rem 0.5rem;
    border-bottom: 1px solid var(--border-color);
    vertical-align: middle
}

.list td {
    color: var(--comp-text-pri)
}

.list .select-col {
    width: 40px;
    text-align: center;
    padding: 0.35rem 0.4rem
}

.list .name-col {
    font-weight: 400
}

.list .type-col {
    color: var(--comp-text-sec);
    font-size: 0.8rem
}

.list .created-col {
    color: var(--comp-text-sec);
    font-size: 0.8rem;
    white-space: nowrap
}

.checkbox-indicator {
    width: 18px;
    height: 18px;
    border: 2px solid var(--border-color);
    border-radius: 4px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
    margin: 0 auto
}

.checkbox-indicator.checked {
    background: var(--accent);
    border-color: var(--accent)
}

.checkbox-indicator.checked svg {
    color: #fff
}

.list tr.just-uploaded td {
    background: rgba(59, 130, 246, 0.03)
}

.list tr.selected.just-uploaded td {
    background: rgba(59, 130, 246, 0.1)
}

.just-uploaded {
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);
    border-color: rgba(59, 130, 246, 0.6)
}

.card.just-uploaded {
    position: relative
}

.list tr.just-uploaded td {
    background: rgba(59, 130, 246, 0.03)
}

.selected-list {
    border: 1px dashed var(--border-color);
    padding: .75rem;
    margin: 1rem;
    border-radius: 8px
}

.selected-list h4 {
    margin: 0 0 .35rem 0;
    font-size: .95rem
}

.selected-items {
    min-height: 1.5rem
}

.selected-chips {
    display: flex;
    flex-wrap: wrap;
    gap: .4rem;
    justify-content: center;
}

.selected-chip {
    display: inline-flex;
    align-items: center;
    gap: .3rem;
    padding: .2rem .5rem;
    background: var(--comp-bg-blur);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    font-size: .85rem;
    max-width: 100%;
    transition: all 0.15s ease;
}

.selected-chip:hover{
    background: var(--comp-bg-blur-hvr);
    border-color: var(--comp-text-pri);
}

.chip-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
}

.chip-remove {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--app-text-sec);
    font-size: 14px;
    line-height: 1;
    cursor: pointer;
    flex-shrink: 0;
    transition: background .15s, color .15s;
}

.chip-remove :deep(svg), .chip-remove .icon-svg {
    width: 18px;
    height: 18px;
}

.chip-remove:hover {
    color: var(--app-text-pri);
}

.picker-actions {
    display: flex;
    justify-content: flex-end;
    gap: .5rem;
    margin: 0 1rem 1rem 1rem;
}

.cloud-empty {
    text-align: center;
    color: var(--comp-text-sec);
    padding: 2rem;
    font-size: 0.9rem;
}

.cloud-login-overlay {
    position: absolute;
    inset: 0;
    z-index: 2
}

.cloud-login-overlay .login-placeholder {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.12);
}

</style>
