<template>
  <section
    class="hp-lane"
    :class="{ 'is-drop-target': dropHint?.column === columnIndex }"
    @dragover.prevent="flow.onDragOver(columnIndex)"
    @dragleave="flow.onDragLeave(columnIndex, $event)"
    @drop.prevent="flow.onDrop(columnIndex, column.cards.length)"
  >
    <header class="hp-lane-head">
      <span class="hp-lane-name">{{ t('cardFlow.column', { n: columnIndex + 1 }) }}</span>
      <button
        type="button"
        class="hp-icon-btn"
        :disabled="disabled"
        :title="t('cardFlow.removeColumn')"
        @click="flow.removeColumn(columnIndex)"
        v-html="Icons.close"
      ></button>
    </header>

    <div class="hp-lane-metrics">
      <label class="hp-metric" :title="t('cardFlow.widthHint')">
        <span>W</span>
        <input
          class="modern-input hp-metric-input"
          type="number"
          min="0.1"
          max="1000"
          step="10"
          :value="column.width ?? ''"
          :disabled="disabled"
          @change="flow.setNumber(columnIndex, 'width', $event)"
        />
      </label>
      <label class="hp-metric" :title="t('cardFlow.maxWidth')">
        <span>max</span>
        <input
          class="modern-input hp-metric-input"
          type="number"
          min="0"
          max="1920"
          step="10"
          placeholder="—"
          :value="column.maxWidth ?? ''"
          :disabled="disabled"
          @change="flow.setNumber(columnIndex, 'maxWidth', $event)"
        />
      </label>
    </div>

    <ul class="hp-stack">
      <template v-for="(card, cardIndex) in column.cards" :key="cardIndex">
        <li v-if="flow.showDropMarker(columnIndex, cardIndex)" class="hp-drop-marker" aria-hidden="true"></li>
        <CardFlowTile
          :card="card"
          :column-index="columnIndex"
          :card-index="cardIndex"
          :disabled="disabled"
        />
      </template>
      <li v-if="flow.showDropMarker(columnIndex, column.cards.length)" class="hp-drop-marker" aria-hidden="true"></li>

      <li class="hp-add-tile-wrap">
        <button
          type="button"
          class="hp-add-tile"
          :class="{ 'is-open': openMenu === columnIndex }"
          :disabled="disabled"
          @click.stop="flow.toggleMenu(columnIndex, $event)"
        >
          <span class="hp-add-plus" v-html="Icons.plus"></span>
          <span>{{ t('cardFlow.addCard') }}</span>
        </button>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { inject } from 'vue'
import { useI18n } from 'vue-i18n'
import { Icons } from '../../../../utils/icons'
import { cardFlowKey } from './context'
import CardFlowTile from './CardFlowTile.vue'
import type { CardFlowColumn } from './useCardFlowEditor'

defineProps<{
  column: CardFlowColumn
  columnIndex: number
  disabled?: boolean
}>()

const flow = inject(cardFlowKey)!
const { t } = useI18n()
const dropHint = flow.dropHint
const openMenu = flow.openMenu
</script>
