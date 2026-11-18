<template>
  <div class="form-row">
    <label v-if="label">{{ label || t('settings.imagePickerLabel') }}</label>
    <div style="display:flex; gap:.5rem; align-items:center;">
      <input
        v-if="!isPickerOnly"
        class="modern-input"
        :value="modelValue"
        :placeholder="placeholder"
        style="flex:1"
        @input="onInput"
      />
      <button type="button" class="primary" @click="openPicker">
        {{ chooseLabel || t('settings.chooseImage') }}
      </button>
      <button
        v-if="modelValue"
        type="button"
        class="secondary"
        @click="handleClear"
      >
        {{ clearLabel || t('settings.clear') }}
      </button>
    </div>
    <div v-if="modelValue" class="image-preview" style="margin-top:.5rem;">
      <img :src="displayUrl" alt="preview" style="max-width:200px; max-height:150px; border-radius:8px;" />
    </div>
  </div>

  <div v-if="isFilePickerOpen" class="modal-overlay file-picker-overlay" @click.self="handleFilePickerCancel">
    <div class="file-picker-modal">
      <div class="file-picker-modal__header">
        <h3>{{ chooseLabel || t('settings.chooseImage') }}</h3>
        <button type="button" class="close-btn" @click="handleFilePickerCancel">
          <span class="icon-svg" v-html="Icons.close"></span>
        </button>
      </div>
      <FilePicker
        selectionMode="single"
        :restrictedTypes="['image']"
        :allowUpload="true"
        :initialSelectedUrl="modelValue"
        @select="handleFilePickerSelect"
        @cancel="handleFilePickerCancel"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { ref, computed, onMounted } from 'vue'
import { Icons } from '../../../utils/icons'
import FilePicker from '../../FilePicker.vue'
const { t } = useI18n()
const props = defineProps<{
  modelValue: string
  schema: Record<string, any>
  label?: string
  placeholder?: string
  chooseLabel?: string
  clearLabel?: string
}>()

const isPickerOnly = computed(() => !!(props.schema?.['x-picker-only']))
const targetDir = computed(() => (props.schema as any)?.['x-target-dir'] || '')
// Resolve asset:// for browser display
const displayUrl = computed(() => {
  const url = props.modelValue
  if (!url) return ''
  if (url.startsWith('asset://')) return '/data/assets/' + url.slice(8)
  return url
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const isFilePickerOpen = ref(false)

// Auto-discover from target directory on mount
onMounted(async () => {
  const dir = targetDir.value
  if (!dir) return
  try {
    const { readDir } = await import('../../../data/dataAccess')
    const files = await readDir(dir)
    const imgs = files.filter((f: string) => /\.(jpg|jpeg|png|gif|webp|avif|svg)$/i.test(f) && !f.startsWith('.') && !f.endsWith('.yml'))
    if (imgs.length > 0 && !props.modelValue) {
      emit('update:modelValue', `/${dir}/${imgs[0]}`)
    }
  } catch {}
})

function onInput(e: Event) {
  emit('update:modelValue', (e.target as HTMLInputElement).value)
}

async function handleClear() {
  // Delete the image file from disk if it's in a target directory
  const dir = targetDir.value
  const url = props.modelValue
  if (dir && url) {
    const filePath = url.startsWith('asset://') ? `data/assets/${url.slice(8)}` : url.replace(/^\//, '')
    try {
      const isElec = typeof window !== 'undefined' && !!(window as any).chronicleElectron?.isElectron
      if (isElec) {
        await (window as any).chronicleElectron.deleteFile(filePath)
      } else {
        await fetch(`/api/files?path=${encodeURIComponent(filePath)}`, { method: 'DELETE' })
      }
    } catch {}
  }
  emit('update:modelValue', '')
}

function openPicker() { isFilePickerOpen.value = true }

async function handleFilePickerSelect(entry: any) {
  if (!entry) return
  const picked = Array.isArray(entry) ? entry[0] : entry
  let url = picked.uploadedUrl || picked.url
  if (!url) return

  // Resolve asset:// → file path for copy
  const filePath = url.startsWith('asset://') ? `data/assets/${url.slice(8)}` : url.replace(/^\//, '')

  // Auto-copy to target directory if configured
  const dir = targetDir.value
  if (dir && !url.startsWith(`/${dir}/`)) {
    const ext = (url.match(/\.\w+$/)?.[0]) || '.jpg'
    // 用带时间戳的文件名，避免沿用 avatar.png 时 URL 不变：
    // 预览不刷新、站点侧也会继续命中旧缓存，看起来就像“选了没反应”。
    const dest = `${dir}/avatar-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}${ext}`
    try {
      const isElec = typeof window !== 'undefined' && !!(window as any).chronicleElectron?.isElectron
      if (isElec) {
        await (window as any).chronicleElectron.copyFile(filePath, dest)
      } else {
        await fetch('/api/copy-file', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: filePath, dest }) })
      }
      url = `/${dest}`
    } catch (_) {}
  }

  emit('update:modelValue', url)
  isFilePickerOpen.value = false
}

function handleFilePickerCancel() { isFilePickerOpen.value = false }
</script>

<style scoped>
.form-row { display: flex; flex-direction: column; gap: .5rem; }
.modern-input { width: 100%; }
.modal-overlay { position: fixed; inset: 0; z-index: 10060; display: grid; place-items: center; background: rgba(0,0,0,.45); padding: 1rem; }
.file-picker-modal { width: min(800px, 90vw); display: grid; grid-template-rows: auto 1fr; gap: 1rem; padding-top: 1rem; border-radius: 18px; background: var(--comp-bg); border: 1px solid var(--border-color); box-shadow: var(--shadow-elev-2); overflow: hidden; }
.file-picker-modal__header { padding: 0 1rem; display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
.file-picker-modal__header h3 { margin: 0; font-size: 1.25rem; }
.close-btn { background: none; border: none; color: var(--comp-text-sec); cursor: pointer; padding: 4px; display: flex; align-items: center; justify-content: center; border-radius: 4px; }
.close-btn :deep(svg) { width: 24px; height: 24px; }
</style>
