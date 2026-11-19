import { computed, ref, watch, type Ref } from 'vue'
import { Icons } from '../../../../utils/icons'
import { resolveLocale } from '../../../../utils/resolveLocale'

export type CardFlowCard = { type: string; [key: string]: unknown }
export type CardFlowColumn = { width?: number; maxWidth?: number; cards: CardFlowCard[] }
export type CardFlowType = {
  id: string
  label?: string | Record<string, string>
  icon?: string
  tone?: string
}
export type CardFlowConfig = {
  maxColumns?: number
  addColumnWidth?: number
  types?: CardFlowType[]
  defaultColumns?: Array<{ width?: number; cards?: string[] }>
}

const FALLBACK_TONES = ['#38bdf8', '#34d399', '#a78bfa', '#fbbf24', '#fb7185', '#60a5fa']
const MENU_WIDTH = 220
const MENU_HEIGHT = 260

export interface UseCardFlowOptions {
  modelValue: Ref<CardFlowColumn[] | null | undefined>
  schema: Ref<Record<string, any> | undefined>
  onChange: (columns: CardFlowColumn[]) => void
}

/**
 * Card-flow editor state: model normalization, column/card mutations, drag
 * targets, floating menu placement and the per-card settings target.
 * Rendering lives in CardFlowField + CardFlowLane/Tile/Menu/Dialog.
 */
export function useCardFlowEditor(options: UseCardFlowOptions) {
  const config = computed<CardFlowConfig>(() => {
    const value = options.schema.value?.['x-card-flow']
    return value && typeof value === 'object' ? (value as CardFlowConfig) : {}
  })

  const cardTypes = computed<CardFlowType[]>(() =>
    Array.isArray(config.value.types) ? config.value.types.filter((type) => type?.id) : [],
  )
  const cardIds = computed(() => cardTypes.value.map((type) => type.id))
  const maxColumns = computed(() => {
    const configured = Number(config.value.maxColumns)
    return Number.isFinite(configured) && configured > 0 ? configured : 3
  })
  const addColumnTrack = computed(() => {
    const configured = Number(config.value.addColumnWidth)
    return ` ${Number.isFinite(configured) && configured > 0 ? configured : 60}px`
  })

  const columns = ref<CardFlowColumn[]>(normalize(options.modelValue.value))
  const openMenu = ref<number | null>(null)
  const menuStyle = ref<Record<string, string>>({})
  const dragState = ref<{ column: number; index: number } | null>(null)
  const dropHint = ref<{ column: number; index: number } | null>(null)
  const dropOnAddLane = ref(false)
  const settingsTarget = ref<{ column: number; index: number } | null>(null)

  function normalize(value: CardFlowColumn[] | null | undefined): CardFlowColumn[] {
    if (!Array.isArray(value)) return []
    return value.slice(0, maxColumns.value).map((column) => ({
      ...(Number.isFinite(Number(column?.width)) && Number(column?.width) > 0
        ? { width: Number(column.width) }
        : {}),
      ...(Number.isFinite(Number(column?.maxWidth)) && Number(column?.maxWidth) > 0
        ? { maxWidth: Number(column.maxWidth) }
        : {}),
      cards: (Array.isArray(column?.cards) ? column.cards : [])
        .map((card) =>
          card && typeof card === 'object' && typeof (card as any).type === 'string'
            ? { ...(card as Record<string, unknown>), type: String((card as any).type) }
            : null,
        )
        .filter((card): card is CardFlowCard =>
          Boolean(card) && cardIds.value.includes((card as CardFlowCard).type),
        ),
    }))
  }

  watch(
    () => options.modelValue.value,
    (value) => {
      if (JSON.stringify(value) !== JSON.stringify(columns.value)) {
        columns.value = normalize(value)
        openMenu.value = null
        settingsTarget.value = null
      }
    },
    { deep: true },
  )

  const boardStyle = computed(() => {
    const tracks = columns.value.map((column) => {
      const width = Number(column.width)
      return `minmax(120px, ${Number.isFinite(width) && width > 0 ? width : 1}fr)`
    })
    if (tracks.length === 0) return {}
    const addLane = columns.value.length < maxColumns.value ? addColumnTrack.value : ''
    return { gridTemplateColumns: `${tracks.join(' ')}${addLane}` }
  })

  const settingsCard = computed(() => {
    const target = settingsTarget.value
    if (!target) return null
    return columns.value[target.column]?.cards[target.index] ?? null
  })

  const settingsEntries = computed(() =>
    Object.entries(settingsCard.value ?? {}).filter(([key]) => key !== 'type'),
  )

  function typeMeta(type: string) {
    return cardTypes.value.find((item) => item.id === type)
  }

  function cardLabel(type: string) {
    const label = typeMeta(type)?.label
    return label ? resolveLocale(label, type) : type
  }

  function cardIcon(type: string) {
    const icon = typeMeta(type)?.icon
    return icon ? (Icons as Record<string, string>)[icon] ?? Icons.generic : Icons.generic
  }

  function toneFor(type: string) {
    const tone = typeMeta(type)?.tone
    if (tone) return tone
    const index = cardIds.value.indexOf(type)
    return FALLBACK_TONES[index >= 0 ? index % FALLBACK_TONES.length : 0]
  }

  function isDragging(columnIndex: number, cardIndex: number) {
    return dragState.value?.column === columnIndex && dragState.value?.index === cardIndex
  }

  function emitUpdate() {
    options.onChange(
      columns.value.map((column) => ({
        ...(column.width ? { width: column.width } : {}),
        ...(column.maxWidth ? { maxWidth: column.maxWidth } : {}),
        cards: column.cards.map((card) => ({ ...card })),
      })),
    )
  }

  function setNumber(columnIndex: number, field: 'width' | 'maxWidth', event: Event) {
    const raw = Number((event.target as HTMLInputElement).value)
    const column = columns.value[columnIndex]
    if (!column) return
    if (Number.isFinite(raw) && raw > 0) column[field] = raw
    else delete column[field]
    emitUpdate()
  }

  function addCard(columnIndex: number, type: string) {
    columns.value[columnIndex]?.cards.push({ type })
    openMenu.value = null
    emitUpdate()
  }

  function removeCard(columnIndex: number, cardIndex: number) {
    columns.value[columnIndex]?.cards.splice(cardIndex, 1)
    settingsTarget.value = null
    emitUpdate()
  }

  function lastColumnWidth(): number | undefined {
    const last = columns.value[columns.value.length - 1]
    const width = Number(last?.width)
    return Number.isFinite(width) && width > 0 ? width : undefined
  }

  function addColumn() {
    if (columns.value.length >= maxColumns.value) return
    const width = lastColumnWidth()
    columns.value.push({ ...(width ? { width } : {}), cards: [] })
    emitUpdate()
  }

  function removeColumn(columnIndex: number) {
    columns.value.splice(columnIndex, 1)
    openMenu.value = null
    settingsTarget.value = null
    emitUpdate()
  }

  function seedDefault() {
    const configured = config.value.defaultColumns
    if (Array.isArray(configured) && configured.length > 0) {
      columns.value = configured.slice(0, maxColumns.value).map((column) => ({
        ...(Number(column?.width) > 0 ? { width: Number(column.width) } : {}),
        cards: (Array.isArray(column?.cards) ? column.cards : [])
          .filter((id) => cardIds.value.includes(String(id)))
          .map((type) => ({ type: String(type) })),
      }))
    } else {
      columns.value = cardIds.value.slice(0, maxColumns.value).map((type) => ({ cards: [{ type }] }))
    }
    emitUpdate()
  }

  function toggleMenu(columnIndex: number, event: MouseEvent) {
    if (openMenu.value === columnIndex) {
      closeMenu()
      return
    }
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    const width = Math.min(MENU_WIDTH, window.innerWidth - 16)
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8)
    const fitsBelow = window.innerHeight - rect.bottom >= MENU_HEIGHT
    const top = fitsBelow || rect.top < MENU_HEIGHT ? rect.bottom + 6 : rect.top - MENU_HEIGHT - 6
    menuStyle.value = { left: `${left}px`, top: `${Math.max(8, top)}px`, width: `${width}px` }
    openMenu.value = columnIndex
  }

  function closeMenu() {
    openMenu.value = null
  }

  function addCardToOpenMenu(type: string) {
    if (openMenu.value === null) return
    addCard(openMenu.value, type)
  }

  function openSettings(columnIndex: number, cardIndex: number) {
    settingsTarget.value = { column: columnIndex, index: cardIndex }
  }

  function closeSettings() {
    settingsTarget.value = null
  }

  function onDragStart(column: number, index: number, event: DragEvent) {
    dragState.value = { column, index }
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', String(index))
    }
  }

  function onDragEnd() {
    dragState.value = null
    dropHint.value = null
    dropOnAddLane.value = false
  }

  function onDragOver(column: number, index?: number) {
    dropOnAddLane.value = false
    dropHint.value = { column, index: index ?? columns.value[column]?.cards.length ?? 0 }
  }

  function showDropMarker(columnIndex: number, index: number) {
    if (!dragState.value || !dropHint.value) return false
    if (dropHint.value.column !== columnIndex || dropHint.value.index !== index) return false
    return !(dragState.value.column === columnIndex && dragState.value.index === index)
  }

  function onDragLeave(column: number, event: DragEvent) {
    if (dropHint.value?.column !== column) return
    const related = event.relatedTarget as Node | null
    if (related && (event.currentTarget as HTMLElement).contains(related)) return
    dropHint.value = null
  }

  function onDrop(column: number, index: number) {
    const source = dragState.value
    dropHint.value = null
    dragState.value = null
    if (!source) return

    const sourceCards = columns.value[source.column]?.cards
    const targetCards = columns.value[column]?.cards
    if (!sourceCards || !targetCards) return

    const [card] = sourceCards.splice(source.index, 1)
    if (!card) return

    let target = index
    if (source.column === column && source.index < index) target -= 1
    targetCards.splice(Math.max(0, Math.min(target, targetCards.length)), 0, card)
    emitUpdate()
  }

  function onAddLaneOver() {
    if (!dragState.value) return
    dropHint.value = null
    dropOnAddLane.value = true
  }

  function onAddLaneLeave(event: DragEvent) {
    const related = event.relatedTarget as Node | null
    if (related && (event.currentTarget as HTMLElement).contains(related)) return
    dropOnAddLane.value = false
  }

  function dropToNewColumn() {
    const source = dragState.value
    dropOnAddLane.value = false
    dropHint.value = null
    dragState.value = null
    if (!source || columns.value.length >= maxColumns.value) return

    const width = lastColumnWidth()
    const sourceColumn = columns.value[source.column]
    const [card] = sourceColumn?.cards.splice(source.index, 1) ?? []
    if (!card) return

    if (sourceColumn.cards.length === 0) columns.value.splice(source.column, 1)
    columns.value.push({ ...(width ? { width } : {}), cards: [card] })
    emitUpdate()
  }

  return {
    config,
    cardTypes,
    cardIds,
    maxColumns,
    columns,
    openMenu,
    menuStyle,
    dragState,
    dropHint,
    dropOnAddLane,
    settingsTarget,
    settingsCard,
    settingsEntries,
    boardStyle,
    cardLabel,
    cardIcon,
    toneFor,
    isDragging,
    setNumber,
    addCard,
    removeCard,
    addColumn,
    removeColumn,
    seedDefault,
    toggleMenu,
    closeMenu,
    addCardToOpenMenu,
    openSettings,
    closeSettings,
    onDragStart,
    onDragEnd,
    onDragOver,
    showDropMarker,
    onDragLeave,
    onDrop,
    onAddLaneOver,
    onAddLaneLeave,
    dropToNewColumn,
  }
}

export type CardFlowEditor = ReturnType<typeof useCardFlowEditor>
