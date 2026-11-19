<template>
  <Teleport to="body">
    <div v-if="settingsCard" class="hp-modal-overlay" @click.self="flow.closeSettings">
      <div class="hp-modal" role="dialog" aria-modal="true">
        <header class="hp-modal-head" :style="{ '--hp-accent': flow.toneFor(settingsCard.type) }">
          <span class="hp-modal-icon" v-html="flow.cardIcon(settingsCard.type)"></span>
          <div class="hp-modal-title">
            <strong>{{ flow.cardLabel(settingsCard.type) }}</strong>
            <span>{{ settingsCard.type }}</span>
          </div>
          <button type="button" class="hp-icon-btn" @click="flow.closeSettings" v-html="Icons.close"></button>
        </header>

        <div class="hp-modal-body">
          <dl v-if="settingsEntries.length > 0" class="hp-settings-list">
            <div v-for="[key, value] in settingsEntries" :key="key" class="hp-settings-row">
              <dt>{{ key }}</dt>
              <dd>{{ String(value) }}</dd>
            </div>
          </dl>
          <div v-else class="hp-modal-placeholder">
            <span class="hp-placeholder-icon" v-html="Icons.generic"></span>
            <p>{{ t('cardFlow.noSettings') }}</p>
          </div>
        </div>

        <footer class="hp-modal-foot">
          <button type="button" class="secondary" @click="flow.closeSettings">
            {{ t('cardFlow.done') }}
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { inject } from 'vue'
import { useI18n } from 'vue-i18n'
import { Icons } from '../../../../utils/icons'
import { cardFlowKey } from './context'

const flow = inject(cardFlowKey)!
const { t } = useI18n()
const settingsCard = flow.settingsCard
const settingsEntries = flow.settingsEntries
</script>
