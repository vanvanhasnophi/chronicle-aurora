<template>
  <div class="form-row">
    <label v-if="label">{{ label }}</label>
    <p v-if="hint" class="form-hint">{{ hint }}</p>

    <div class="hp-columns">
      <div v-for="(column, columnIndex) in columns" :key="columnIndex" class="hp-column">
        <div class="hp-column__head">
          <strong>{{ t('settings.homepageColumnsColumn', { n: columnIndex + 1 }) }}</strong>
          <div class="hp-column__fields">
            <label class="hp-field">
              <span>{{ t('settings.homepageColumnsWidth') }}</span>
              <input
                class="modern-input hp-input"
                type="number"
                min="0.1"
                max="1000"
                step="1"
                :value="column.width ?? ''"
                :disabled="disabled"
                @change="setNumber(columnIndex, 'width', $event)"
              />
            </label>
            <label class="hp-field">
              <span>{{ t('settings.homepageColumnsMaxWidth') }}</span>
              <input
                class="modern-input hp-input"
                type="number"
                min="0"
                max="1920"
                step="10"
                :value="column.maxWidth ?? ''"
                :disabled="disabled"
                @change="setNumber(columnIndex, 'maxWidth', $event)"
              />
            </label>
            <button
              type="button"
              class="icon-btn"
              :title="t('settings.homepageColumnsRemoveColumn')"
              :disabled="disabled"
              @click="removeColumn(columnIndex)"
              v-html="Icons.trash"
            ></button>
          </div>
        </div>
        <p class="form-hint hp-hint">{{ t('settings.homepageColumnsWidthHint') }}</p>

        <ul class="hp-cards">
          <li
            v-for="(card, cardIndex) in column.cards"
            :key="`${card}-${cardIndex}`"
            class="hp-card"
            draggable="true"
            @dragstart="dragStart(columnIndex, cardIndex)"
            @dragover.prevent
            @drop.prevent="drop(columnIndex, cardIndex)"
          >
            <span class="hp-card__grip" aria-hidden="true">⋮⋮</span>
            <span class="hp-card__name">{{ cardLabel(card) }}</span>
            <span
              v-if="countInColumn(columnIndex, card) > 1"
              class="hp-card__warn"
              :title="t('settings.homepageColumnsDuplicate')"
              >!</span
            >
            <button
              type="button"
              class="icon-btn"
              :disabled="disabled"
              :title="t('settings.homepageColumnsRemoveCard')"
              @click="removeCard(columnIndex, cardIndex)"
              v-html="Icons.close"
            ></button>
          </li>
        </ul>

        <select
          class="modern-input hp-add"
          :value="''"
          :disabled="disabled"
          @change="addCard(columnIndex, $event)"
        >
          <option value="" disabled>{{ t('settings.homepageColumnsAddCard') }}</option>
          <option v-for="id in cardIds" :key="id" :value="id" :disabled="column.cards.includes(id)">{{ cardLabel(id) }}</option>
        </select>
      </div>
    </div>

    <div class="hp-actions">
      <button
        type="button"
        class="secondary"
        :disabled="disabled || columns.length >= 3"
        @click="addColumn"
      >
        {{ t('settings.homepageColumnsAddColumn') }}
      </button>
      <button
        v-if="columns.length === 0"
        type="button"
        class="secondary"
        :disabled="disabled"
        @click="seedDefault"
      >
        {{ t('settings.homepageColumnsSeedDefault') }}
      </button>
      <span v-if="columns.length >= 3" class="form-hint">{{ t('settings.homepageColumnsLimit') }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Icons } from '../../../utils/icons'

type HomeColumn = { width?: number; maxWidth?: number; cards: string[] }

const props = defineProps<{
  modelValue: HomeColumn[] | null | undefined
  schema?: Record<string, any>
  label?: string
  hint?: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: HomeColumn[]]
}>()

const { t } = useI18n()

const cardIds = ['intro', 'recent', 'taxonomy', 'author', 'activity'] as const
const MAX_COLUMNS = 3

const cardLabels: Record<string, string> = {
  intro: 'settings.homepageColumnsCardIntro',
  recent: 'settings.homepageColumnsCardRecent',
  taxonomy: 'settings.homepageColumnsCardTaxonomy',
  author: 'settings.homepageColumnsCardAuthor',
  activity: 'settings.homepageColumnsCardActivity',
}

const columns = ref<HomeColumn[]>(normalize(props.modelValue))

function normalize(value: HomeColumn[] | null | undefined): HomeColumn[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, MAX_COLUMNS).map((column) => ({
    ...(Number.isFinite(Number(column?.width)) && Number(column?.width) > 0
      ? { width: Number(column.width) }
      : {}),
    ...(Number.isFinite(Number(column?.maxWidth)) && Number(column?.maxWidth) > 0
      ? { maxWidth: Number(column.maxWidth) }
      : {}),
    cards: cardIdsFrom(column?.cards),
  }))
}

watch(
  () => props.modelValue,
  (value) => {
    if (JSON.stringify(value) !== JSON.stringify(columns.value)) {
      columns.value = normalize(value)
    }
  },
  { deep: true },
)

function cardLabel(id: string) {
  const key = cardLabels[id]
  return key ? t(key) : id
}

function cardIdsFrom(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((id) => String(id)).filter((id) => (cardIds as readonly string[]).includes(id))
  }
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>).filter((id) =>
      (cardIds as readonly string[]).includes(id),
    )
  }
  return []
}

/**
 * YAML keeps cards as a child map (order = key order). Convert the editor's
 * flat id list back to that shape, preserving any per-card child values.
 */
function emitUpdate() {
  const payload = columns.value.map((column, index) => {
    const cards: Record<string, unknown> = {}
    for (const id of column.cards) {
      const source = (props.modelValue || [])[index]
      const existing = source && typeof source.cards === 'object' && !Array.isArray(source.cards)
        ? (source.cards as Record<string, unknown>)[id]
        : undefined
      cards[id] = existing ?? {}
    }
    return {
      ...(column.width ? { width: column.width } : {}),
      ...(column.maxWidth ? { maxWidth: column.maxWidth } : {}),
      cards,
    }
  })
  emit('update:modelValue', payload)
}

function countInColumn(columnIndex: number, card: string) {
  return columns.value[columnIndex]?.cards.filter((id) => id === card).length ?? 0
}

function setNumber(columnIndex: number, field: 'width' | 'maxWidth', event: Event) {
  const raw = Number((event.target as HTMLInputElement).value)
  const column = columns.value[columnIndex]
  if (!column) return
  if (Number.isFinite(raw) && raw > 0) column[field] = raw
  else delete column[field]
  emitUpdate()
}

function addCard(columnIndex: number, event: Event) {
  const select = event.target as HTMLSelectElement
  const id = select.value
  select.value = ''
  if (!id || !columns.value[columnIndex]) return
  columns.value[columnIndex].cards.push(id)
  emitUpdate()
}

function removeCard(columnIndex: number, cardIndex: number) {
  columns.value[columnIndex]?.cards.splice(cardIndex, 1)
  emitUpdate()
}

function addColumn() {
  if (columns.value.length >= MAX_COLUMNS) return
  columns.value.push({ cards: [] })
  emitUpdate()
}

function removeColumn(columnIndex: number) {
  columns.value.splice(columnIndex, 1)
  emitUpdate()
}

function seedDefault() {
  columns.value = [
    { width: 1.45, cards: ['intro', 'recent'] },
    { width: 0.85, cards: ['author', 'taxonomy', 'activity'] },
  ]
  emitUpdate()
}

let dragSource: { column: number; card: number } | null = null

function dragStart(columnIndex: number, cardIndex: number) {
  dragSource = { column: columnIndex, card: cardIndex }
}

function drop(columnIndex: number, cardIndex: number) {
  if (!dragSource) return
  const { column, card } = dragSource
  dragSource = null
  if (column === columnIndex && card === cardIndex) return
  const sourceCards = columns.value[column]?.cards
  if (!sourceCards) return
  const [moved] = sourceCards.splice(card, 1)
  if (!moved) return
  columns.value[columnIndex].cards.splice(cardIndex, 0, moved)
  emitUpdate()
}
</script>

<style scoped>
.hp-columns {
  display: grid;
  gap: 12px;
}
.hp-column {
  border: 1px solid var(--border-color, #334155);
  border-radius: 10px;
  padding: 10px 12px;
}
.hp-column__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.hp-column__fields {
  display: flex;
  align-items: flex-end;
  gap: 10px;
}
.hp-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.78rem;
  opacity: 0.85;
}
.hp-input {
  width: 88px;
}
.hp-hint {
  margin: 6px 0 8px;
}
.hp-cards {
  display: grid;
  gap: 6px;
  margin: 0 0 8px;
  padding: 0;
  list-style: none;
}
.hp-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 8px;
  background: var(--surface-2, rgba(148, 163, 184, 0.12));
  cursor: grab;
}
.hp-card__grip {
  opacity: 0.5;
  letter-spacing: -2px;
}
.hp-card__name {
  flex: 1;
}
.hp-card__warn {
  color: var(--warning, #f59e0b);
  font-weight: 700;
}
.hp-add {
  width: 100%;
}
.hp-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
}
</style>
