<template>
  <Teleport to="body">
    <div v-if="openMenu !== null" class="hp-menu-backdrop" @click="flow.closeMenu"></div>
    <div v-if="openMenu !== null" class="hp-type-menu" :style="menuStyle" @click.stop>
      <button
        v-for="type in cardTypes"
        :key="type.id"
        type="button"
        class="hp-type-option"
        @click="flow.addCardToOpenMenu(type.id)"
      >
        <span class="hp-tile-icon" :style="{ '--hp-accent': flow.toneFor(type.id) }" v-html="flow.cardIcon(type.id)"></span>
        <span>{{ flow.cardLabel(type.id) }}</span>
        <span class="hp-type-plus" v-html="Icons.plus"></span>
      </button>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { inject } from 'vue'
import { Icons } from '../../../../utils/icons'
import { cardFlowKey } from './context'

const flow = inject(cardFlowKey)!
const openMenu = flow.openMenu
const menuStyle = flow.menuStyle
const cardTypes = flow.cardTypes
</script>
