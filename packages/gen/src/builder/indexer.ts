/**
 * Chronicle Gen — Post Index Builder (TypeScript re-export)
 *
 * The canonical implementation lives in indexer.mjs (plain ESM)
 * so both .mjs and .ts consumers can import it directly.
 * This file provides type annotations for TypeScript consumers.
 */

export interface IndexEntry {
  title: string
  date: string
  tags: string[]
  status: string
  summary?: string
  font?: string
  author?: string
  aiGenerated?: boolean
  type?: 'article' | 'slides'
  /** Generic plugin-owned metadata. */
  extensions?: Record<string, unknown>
}

export interface IndexOutput {
  [slug: string]: IndexEntry
}

// Re-export the canonical implementations from indexer.mjs
export { buildPostIndex, rebuildPostIndex } from './indexer.mjs'
