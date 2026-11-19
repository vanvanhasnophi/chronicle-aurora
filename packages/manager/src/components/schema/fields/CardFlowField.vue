<template>
  <div class="form-row hp-root">
    <div class="hp-head">
      <div class="hp-head-text">
        <label v-if="label">{{ label }}</label>
        <p v-if="hint" class="form-hint">{{ hint }}</p>
      </div>
      <div class="hp-head-actions">
        <span class="hp-counter">{{ columns.length }} / {{ maxColumns }}</span>
        <button
          type="button"
          class="hp-ghost-btn"
          :disabled="disabled || columns.length >= maxColumns"
          @click="addColumn"
        >
          <span class="hp-btn-icon" v-html="Icons.plus"></span>
          {{ t('cardFlow.addColumn') }}
        </button>
      </div>
    </div>

    <div v-if="columns.length === 0" class="hp-empty">
      <p class="hp-empty-title">{{ t('cardFlow.emptyBoard') }}</p>
      <div class="hp-empty-actions">
        <button type="button" class="secondary" :disabled="disabled" @click="seedDefault">
          {{ t('cardFlow.seedDefault') }}
        </button>
        <button type="button" class="hp-ghost-btn" :disabled="disabled" @click="addColumn">
          <span class="hp-btn-icon" v-html="Icons.plus"></span>
          {{ t('cardFlow.addColumn') }}
        </button>
      </div>
    </div>

    <div v-else class="hp-board" :style="boardStyle">
      <CardFlowLane
        v-for="(column, columnIndex) in columns"
        :key="columnIndex"
        :column="column"
        :column-index="columnIndex"
        :disabled="disabled"
      />

      <button
        v-if="columns.length < maxColumns"
        type="button"
        class="hp-lane hp-lane--add"
        :class="{ 'is-drop-target': dropOnAddLane }"
        :disabled="disabled"
        @click="addColumn"
        @dragover.prevent.stop="onAddLaneOver"
        @dragleave="onAddLaneLeave"
        @drop.prevent.stop="dropToNewColumn"
      >
        <span class="hp-lane-add-plus" v-html="Icons.plus"></span>
      </button>
    </div>

    <p v-if="columns.length >= maxColumns" class="form-hint hp-limit">
      {{ t('cardFlow.limit', { n: maxColumns }) }}
    </p>

    <CardFlowTypeMenu />
    <CardFlowSettingsDialog />
  </div>
</template>

<script setup lang="ts">
import { computed, provide } from 'vue'
import { useI18n } from 'vue-i18n'
import { Icons } from '../../../utils/icons'
import { cardFlowKey } from './card-flow/context'
import { useCardFlowEditor, type CardFlowColumn } from './card-flow/useCardFlowEditor'
import CardFlowLane from './card-flow/CardFlowLane.vue'
import CardFlowTypeMenu from './card-flow/CardFlowTypeMenu.vue'
import CardFlowSettingsDialog from './card-flow/CardFlowSettingsDialog.vue'

const props = defineProps<{
  modelValue: CardFlowColumn[] | null | undefined
  schema?: Record<string, any>
  label?: string
  hint?: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: CardFlowColumn[]]
}>()

const { t } = useI18n()

const flow = useCardFlowEditor({
  modelValue: computed(() => props.modelValue),
  schema: computed(() => props.schema),
  onChange: (value) => emit('update:modelValue', value),
})
provide(cardFlowKey, flow)

const columns = flow.columns
const maxColumns = flow.maxColumns
const boardStyle = flow.boardStyle
const dropOnAddLane = flow.dropOnAddLane
const addColumn = flow.addColumn
const seedDefault = flow.seedDefault
const onAddLaneOver = flow.onAddLaneOver
const onAddLaneLeave = flow.onAddLaneLeave
const dropToNewColumn = flow.dropToNewColumn
</script>

<style src="./card-flow/card-flow.css"></style>
