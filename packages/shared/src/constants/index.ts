/**
 * Chronicle Shared Constants
 *
 * Updated for Chronicle Aurora (v4): local-first, no server, no API prefixes.
 * Legacy constants kept as @deprecated for template backward compatibility.
 */

/** Default server port @deprecated — no runtime server in Aurora */
export const DEFAULT_PORT = 3000

/** Default Astro dev server port */
export const ASTRO_DEV_PORT = 4321

/** Default Vite dev server port (manager) */
export const MANAGER_DEV_PORT = 5173

// ═══════════════════════════════════════════════════════════════
// Directory names
// ═══════════════════════════════════════════════════════════════

/** Data directory name (relative to repo root) */
export const DATA_DIR_NAME = 'data'

/** Subdirectories under data/ */
export const POSTS_DIR_NAME = 'posts'
export const ASSETS_DIR_NAME = 'assets'
export const COMMENTS_DIR_NAME = 'comments'
export const COMMENTS_PENDING_DIR_NAME = 'comments-pending'

/** Branding assets directory (avatars, favicons, backgrounds) */
export const BRANDING_DIR_NAME = 'branding'

/** Editor workspace directory (relative to repo root) */
export const CHRONICLE_DIR_NAME = '.chronicle'

// ═══════════════════════════════════════════════════════════════
// File names
// ═══════════════════════════════════════════════════════════════

/** Site rendering config */
export const SITE_CONFIG_FILE = 'site.yml'

/** Profile config */
export const PROFILE_FILE = 'profile.yml'

/** Friends config */
export const FRIENDS_FILE = 'friends.yml'

/** Post metadata index (auto-generated, JSON) */
export const POST_INDEX_FILE = 'index.json'

/** Post content file (in slug directory) */
export const POST_CONTENT_FILE = 'index.md'

/** Workspace config (program-written, JSON) */
export const WORKSPACE_FILE = 'workspace.json'

// ═══════════════════════════════════════════════════════════════
// Legacy (deprecated — kept for template backward compat)
// ═══════════════════════════════════════════════════════════════

/** @deprecated Use SITE_CONFIG_FILE + WORKSPACE_FILE instead */
export const SETTINGS_FILE_NAME = 'settings.json'

/** @deprecated No auth in Aurora */
export const SECURITY_FILE_NAME = 'security.json'

/** @deprecated Use POST_INDEX_FILE instead */
export const INDEX_FILE_NAME = 'index.json'

/** @deprecated Use POST_CONTENT_FILE instead (slug-based dirs) */
export const CONTENT_FILE_SUFFIX = '-content.md'
export const COMPILED_FILE_SUFFIX = '-compiled.html'
export const TOC_FILE_SUFFIX = '-toc.json'

/** @deprecated Use ASSETS_DIR_NAME instead */
export const UPLOAD_DIR_NAME = 'upload'

/** @deprecated Use BRANDING_DIR_NAME instead */
export const BACKGROUND_DIR_NAME = 'background'

/** @deprecated No auth in Aurora */
export const AUTH_HEADER = 'x-chronicle-auth'

/** @deprecated No runtime API in Aurora */
export const ADMIN_API_PREFIX = '/api/admin'
export const PUBLIC_API_PREFIX = '/api/public'
export const LEGACY_API_PREFIX = '/api'

/** @deprecated No server-side file serving in Aurora — build-time only */
export const UPLOAD_SERVE_PATH = '/server/data/upload'
export const BRANDING_SERVE_PATH = '/server/data/branding'
export const BACKGROUND_SERVE_PATH = '/server/data/background'

export const THUMB_SERVE_PATH = '/thumb'

// ═══════════════════════════════════════════════════════════════
// Values
// ═══════════════════════════════════════════════════════════════

/** Valid build granularities */
export const BUILD_GRANULARITIES = ['full', 'posts', 'index'] as const

/** Valid post statuses */
