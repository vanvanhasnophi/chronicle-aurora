<template>
  <component
    v-if="resolvedComponent && !isHidden"
    :is="resolvedComponent"
    :model-value="modelValue"
    :schema="fieldSchema"
    :label="resolvedLabel"
    :hint="resolvedHint"
    :placeholder="resolvedPlaceholder"
    :disabled="disabled"
    :disabled-text="resolvedDisabledText"
    :title="listTitle"
    :add-label="listAddLabel"
    :empty-text="listEmptyText"
    :meta="fieldMeta"
    :form-data="formData"
    :source-path="modelValue?.sourcePath"
    :source-name="modelValue?.sourceName"
    :allow-video="fieldSchema['x-allow-video'] === true"
    @update:model-value="(v: any) => emit('update:modelValue', v)"
    @update:meta="(v: any) => emit('update:meta', v)"
  >
    <template v-for="(_, name) in $slots" :key="name" #[name]="slotProps">
      <slot :name="name" v-bind="slotProps || {}" />
    </template>
  </component>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { resolveLocale } from '../../utils/resolveLocale'

// ── Generic component imports ──
import NativeHidden from './fields/NativeHidden.vue'
import NativeInput from './fields/NativeInput.vue'
import NativeTextarea from './fields/NativeTextarea.vue'
import NativeDropdown from './fields/NativeDropdown.vue'
import NativeToggle from './fields/NativeToggle.vue'
import NativeColor from './fields/NativeColor.vue'
import NativeRange from './fields/NativeRange.vue'
import NativeNumber from './fields/NativeNumber.vue'
import NativeFieldset from './fields/NativeFieldset.vue'
import CardToggle from './fields/CardToggle.vue'
import ImagePickerField from './fields/ImagePickerField.vue'
import PostPickerField from './fields/PostPickerField.vue'
import LinkListField from './fields/LinkListField.vue'
import BackgroundEditorField from './fields/BackgroundEditorField.vue'
import CardListField from './fields/CardListField.vue'
import { getSchemaField } from '../../data/schemaFields'
import AboutEditorButton from './fields/AboutEditorButton.vue'
import WalineAdminLink from './fields/WalineAdminLink.vue'

// ── Component registry: x-chronicle-class → generic component ──
const COMPONENT_MAP: Record<string, any> = {
  'native-hidden':      NativeHidden,
  'native-input':        NativeInput,
  'native-textarea':     NativeTextarea,
  'native-dropdown':     NativeDropdown,
  'native-toggle':       NativeToggle,
  'native-color':        NativeColor,
  'native-range':        NativeRange,
  'native-fieldset':     NativeFieldset,
  'card-toggle':         CardToggle,
  'image-picker':        ImagePickerField,
  'post-picker':         PostPickerField,
  'link-list':           LinkListField,
  'background-editor':   BackgroundEditorField,
  'card-list':           CardListField,
  'about-editor':        AboutEditorButton,
  'waline-admin-link':   WalineAdminLink,
}

const props = defineProps<{
  fieldKey: string
  fieldSchema: Record<string, any>
  modelValue: any
  componentOverride?: string
  disabled?: boolean
  disabledText?: string
  /** Passed through for list-type components */
  title?: string
  hint?: string
  addLabel?: string
  emptyText?: string
  /** Pre-populated meta from *Meta field (for background-editor etc.) */
  fieldMeta?: any
  /** Full form data for x-visible-when / x-disabled-when resolution */
  formData?: Record<string, any>
}>()

const emit = defineEmits<{
  'update:modelValue': [value: any]
  'update:meta': [value: any]
}>()

// ── Resolve which component to render ──
const isHidden = computed(() => {
  const cc = props.componentOverride || props.fieldSchema['x-chronicle-class']
  return cc === 'native-hidden' || props.fieldSchema['x-widget'] === 'hidden'
})

const resolvedComponent = computed(() => {
  const cc = props.componentOverride || props.fieldSchema['x-chronicle-class']
  const registered = getSchemaField(cc)
  if (registered) return registered
  if (cc && COMPONENT_MAP[cc] !== undefined) return COMPONENT_MAP[cc]
  // Fallback by x-widget
  const widget = props.fieldSchema['x-widget']
  const registeredWidget = getSchemaField(widget)
  if (registeredWidget) return registeredWidget
  const fallbackMap: Record<string, any> = {
    input:              NativeInput,
    textarea:           NativeTextarea,
    select:             NativeDropdown,
    toggle:             NativeToggle,
    color:              NativeColor,
    range:              NativeRange,
    number:             NativeNumber,
    hidden:             NativeHidden,
    fieldset:           NativeFieldset,
    'radio-group':      CardToggle,
    'image-picker':     ImagePickerField,
    'post-picker':      PostPickerField,
    'link-list':        LinkListField,
    'background-editor':BackgroundEditorField,
    'card-list':        CardListField,
  }
  return fallbackMap[widget] || NativeInput
})

// ── Labels (server-localized or inline locale → plain string) ──
const resolvedLabel = computed(() => {
  return resolveLocale(props.fieldSchema.title, props.fieldKey)
})

const resolvedHint = computed(() => {
  return resolveLocale(props.fieldSchema.description || props.fieldSchema['x-hint'], '')
})

// x-disabled-text 是 i18n 对象（{en, zh-CN}）——必须 resolveLocale 成当前语言字符串，
// 否则原样传给组件会把 JSON 对象渲染出来
const resolvedDisabledText = computed(() => {
  return resolveLocale(props.fieldSchema['x-disabled-text'], '')
})

const resolvedPlaceholder = computed(() => props.fieldSchema['x-placeholder'] || '')

// ── List-type component labels (from schema x-* hints, fallback to field title) ──
const listTitle = computed(() => props.title || resolvedLabel.value)
const listAddLabel = computed(() => props.addLabel || '')
const listEmptyText = computed(() => props.emptyText || '')
</script>
