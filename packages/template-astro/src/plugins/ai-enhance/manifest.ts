import type { PluginManifest } from '../types';
import AiSummary from './AiSummary.astro';
import { aiEnhanceDataHooks } from './data';

export const aiEnhance: PluginManifest = {
  id: 'ai-enhance',
  featureFlag: 'enabled',
  name: 'AI 增强',
  pages: {},
  slots: [
    { slot: 'post-ai-summary', component: AiSummary },
  ],
  dataHooks: aiEnhanceDataHooks,
  settingsSchema: ['ai-enhance'],
};

export default aiEnhance;
