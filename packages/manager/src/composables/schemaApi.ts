/**
 * Chronicle Aurora — Schema API (local fs backend)
 *
 * Replaces the old HTTP GET /api/admin/schemas with direct filesystem reads.
 * Schemas are loaded from the template-astro package's schemas/ directory.
 * Falls back to bundled local schemas for system settings.
 */

import { reactive } from 'vue'
import systemSettings from '../../schemas/system-settings.schema.json'

// Known schema $ids — for now these are bundled directly
// In the future, they'd be loaded from packages/template-astro/schemas/ via IPC
// Schema 跟随模块（T5）：模板核心（schemas/）+ 插件 schema（src/plugins/<id>/schema.json）
import homepage from '../../../template-astro/schemas/homepage.schema.json'
import appearance from '../../../template-astro/schemas/appearance.schema.json'
import profile from '../../../template-astro/schemas/profile.schema.json'
import postPage from '../../../template-astro/schemas/post-page.schema.json'
import collections from '../../../template-astro/src/plugins/collections/schema.json'
import friends from '../../../template-astro/src/plugins/friends/schema.json'
import search from '../../../template-astro/src/plugins/search/schema.json'
import comments from '../../../template-astro/src/plugins/comments/schema.json'
import slideshow from '../../../template-astro/src/plugins/slides/schema.json'
import readingExperience from '../../../template-astro/src/plugins/reading-experience/schema.json'
import ai from '../../../template-astro/src/plugins/ai-enhance/schema.json'

// Reactive schema store — populated with bundled schemas on first access
export const schemaStore = reactive<Record<string, any>>({
  'chronicle:system-settings': systemSettings,
  'chronicle:homepage': homepage,
  'chronicle:appearance': appearance,
  'chronicle:profile': profile,
  'chronicle:post-page': postPage,
  'chronicle:collections': collections,
  'chronicle:friends': friends,
  'chronicle:search': search,
  'chronicle:comments': comments,
  'chronicle:slideshow': slideshow,
  'chronicle:reading-experience': readingExperience,
  'chronicle:ai-enhance': ai,
})

/**
 * Synchronize schemas from the filesystem. In Aurora, all schemas are
 * bundled at build time — no network fetch needed.
 */
export async function syncSchemas(): Promise<Record<string, any>> {
  return { ...schemaStore }
}
