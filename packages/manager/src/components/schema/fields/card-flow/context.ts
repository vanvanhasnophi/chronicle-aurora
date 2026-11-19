import type { InjectionKey } from 'vue'
import type { CardFlowEditor } from './useCardFlowEditor'

export const cardFlowKey: InjectionKey<CardFlowEditor> = Symbol('card-flow-editor')
