/**
 * useFrontmatter — Parse and serialize YAML frontmatter for local .md files.
 *
 * Format:
 *   ---
 *   title: My Post
 *   tags: [a, b]
 *   author: Name
 *   font: sans
 *   aiGenerated: false
 *   date: 2024-01-01
 *   ---
 *   Content here...
 */

export interface PostFrontmatter {
  title?: string
  tags?: string[]
  author?: string
  font?: string
  aiGenerated?: boolean
  date?: string
  [key: string]: any
}

const FM_DELIM = '---'

/**
 * Parse a markdown string that MAY start with YAML frontmatter.
 * Returns { meta, content } — meta is empty {} if no frontmatter found.
 */
export function parseFrontmatter(raw: string): { meta: PostFrontmatter; content: string } {
  // Workspace files on Windows are CRLF; normalise before matching so the
  // frontmatter block is actually stripped instead of leaking into the body.
  const normalized = raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  const trimmed = normalized.trimStart()
  if (!trimmed.startsWith(FM_DELIM)) {
    return { meta: {}, content: normalized }
  }

  // Find closing ---
  const afterFirst = trimmed.slice(FM_DELIM.length)
  const closeIdx = afterFirst.indexOf('\n' + FM_DELIM)
  if (closeIdx === -1) {
    // No closing delimiter — treat whole thing as content
    return { meta: {}, content: normalized }
  }

  const yamlBlock = afterFirst.slice(0, closeIdx).trim()
  // strip at most 1 leading blank line after FM separator (writer always adds one)
  const content = afterFirst.slice(closeIdx + FM_DELIM.length + 1).replace(/^\n/, '')

  const meta = parseSimpleYaml(yamlBlock)
  return { meta, content }
}

/**
 * Serialize metadata + content into a markdown string with YAML frontmatter.
 */
export function serializeFrontmatter(meta: PostFrontmatter, content: string): string {
  const entries = Object.entries(meta).filter(([, v]) => v !== undefined && v !== null)
  if (entries.length === 0) return content

  const yaml = entries.map(([k, v]) => {
    if (Array.isArray(v)) {
      return `${k}: ${v.join(', ')}`
    }
    if (typeof v === 'boolean') {
      return `${k}: ${v}`
    }
    if (typeof v === 'object') {
      return `${k}: ${JSON.stringify(v)}`
    }
    return `${k}: ${String(v)}`
  }).join('\n')

  return `---\n${yaml}\n---\n\n${content}`
}

// ── Minimal YAML parser (handles the subset we need) ────────────────

function parseSimpleYaml(yaml: string): PostFrontmatter {
  const meta: PostFrontmatter = {}

  for (const line of yaml.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const colonIdx = trimmed.indexOf(':')
    if (colonIdx === -1) continue

    const key = trimmed.slice(0, colonIdx).trim()
    const rawValue = trimmed.slice(colonIdx + 1).trim()

    let value: any = rawValue

    // Boolean
    if (rawValue === 'true') { value = true }
    else if (rawValue === 'false') { value = false }
    // Array: [a, b, c] (legacy JSON/YAML array format)
    else if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
      value = rawValue.slice(1, -1).split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
    }
    // Quoted string
    else if ((rawValue.startsWith('"') && rawValue.endsWith('"')) ||
              (rawValue.startsWith("'") && rawValue.endsWith("'"))) {
      value = rawValue.slice(1, -1)
    }
    // Comma-separated tags (primary format)
    else if (key === 'tags' && rawValue.includes(',')) {
      value = rawValue.split(',').map(s => s.trim()).filter(Boolean)
    }
    else if (key === 'tags' && rawValue.trim()) {
      value = [rawValue.trim()]
    }
    else if (key === 'tags') {
      value = []
    }

    meta[key] = value
  }

  return meta
}
