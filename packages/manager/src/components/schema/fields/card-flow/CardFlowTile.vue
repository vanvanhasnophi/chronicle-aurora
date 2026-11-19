<template>
  <li
    class="hp-tile"
    :class="{ 'is-dragging': flow.isDragging(columnIndex, cardIndex) }"
    :style="{ '--hp-accent': flow.toneFor(card.type) }"
    draggable="true"
    @dragstart="flow.onDragStart(columnIndex, cardIndex, $event)"
    @dragend="flow.onDragEnd"
    @dragover.prevent.stop="flow.onDragOver(columnIndex, cardIndex)"
    @drop.prevent.stop="flow.onDrop(columnIndex, cardIndex)"
  >
    <span class="hp-tile-grip" aria-hidden="true">⠿</span>
    <span class="hp-tile-icon" v-html="flow.cardIcon(card.type)"></span>
    <span class="hp-tile-label">{{ flow.cardLabel(card.type) }}</span>
    <span class="hp-tile-actions" draggable="false">
      <button
        type="button"
        class="hp-icon-btn"
        draggable="false"
        :disabled="disabled"
        :title="t('cardFlow.cardSettings')"
        @click.stop="flow.openSettings(columnIndex, cardIndex)"
        v-html="Icons.edit"
      ></button>
      <button
        type="button"
        class="hp-icon-btn"
        draggable="false"
        :disabled="disabled"
        :title="t('cardFlow.removeCard')"
        @click.stop="flow.removeCard(columnIndex, cardIndex)"
        v-html="Icons.close"
      ></button>
    </span>
  </li>
</template>

<script setup lang="ts">
import { inject } from 'vue'
import { useI18n } from 'vue-i18n'
import { Icons } from '../../../../utils/icons'
import { cardFlowKey } from './context'
import type { CardFlowCard } from './useCardFlowEditor'

defineProps<{
  card: CardFlowCard
  columnIndex: number
  cardIndex: number
  disabled?: boolean
}>()

const flow = inject(cardFlowKey)!
const { t } = useI18n()
</script>
