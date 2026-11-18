---
title: Site Configuration
date: 2026-08-07T07:39:14.750Z
updatedAt: 2026-08-17T12:00:00.000Z
tags: guide, site
author: Eightyfor
aiGenerated: true
status: published
font: sans
---

`data/site.yml` is the central control panel for your Chronicle site. Every global behavior — from the color of your links to which pages exist — is declared here. This guide walks through each section and explains how the settings connect to the rest of the system.

## How `site.yml` works

The file is read at build time by the Astro SSG. There is no runtime server, no database — changing a value and rebuilding is all it takes. The Manager CMS provides a form UI for every field, but you can also edit the YAML directly.

`site.yml` is a **tree**, not a flat list of keys. Settings are grouped into top-level blocks, each owning one area of the site:

```
homepage      — identity and homepage layout (siteName, description, mode, cards, recent updates)
appearance    — theme, accent, font, locale, performance mode
rss           — RSS feed toggle
analytics     — multi-backend traffic analytics (GA / Cloudflare / Umami / Plausible / Baidu)
post          — post-page settings (header meta, TOC, collection nav, end of article, comments)
```

Then **one section per plugin**, each with its own `enabled` switch and configuration:

```
search             — search suggestions, global search, full-text search
comments           — comment master switch + backend (waline, attitude, image upload)
reading-experience — table of contents, end-of-article blocks
friends            — the /friends page (data in friends.yml)
collections        — the /collection page + collection navigation
slides             — Marp slide rendering
```

Disabling a plugin (`enabled: false`) means its components and styles never enter the build — the feature simply disappears, as if it were never installed. This demo site ships with all plugins enabled so you can explore the full feature set; disable whichever you don't need.

Two values that used to live in `site.yml` — the light/dark base background colors — now belong to `data/background/background.yml` together with the other background metadata. See the *Base colors* section under Appearance below.

The Manager mirrors this structure under **Settings**: **Template** (Homepage / Appearance), **Post Page** (the `post` tree), plus a **Plugins** page listing every plugin with its own enable/disable toggle. Editor-level settings (window appearance, Git & preview, Reset) live under **Settings → System**.

### Quick start

```bash
# 1. Install every package (npm workspaces, from the repo root)
npm run init

# 2. Local CMS (opens an Electron window)
npm run dev:cms

# 3. Blog frontend (reads data/ directly)
npm run dev:astro   # local dev server
npm run build:astro # data/ → dist/
```

Deployment is plain `git push` → CI/CD (GitHub Actions: compress images → Astro SSG → Deploy Pages). `data/` is the only data source — there is no runtime server to configure.

## Homepage (`homepage`)

| Field | Description | Datatype | Sample |
| --- | --- | --- | --- |
| `siteName` | Sets the global `<title>`. Affects the homepage hero, RSS feed and copyright line. | string | `Eightyfor's Blog` |
| `siteDescription` | Used for `<meta name="description">`. Affects the description shown in search results and the homepage. | string | `This is the Personal Blog of Eightyfor.` |
| `icpNumber` | ICP filing number for sites hosted in mainland China. Shown in the copyright line. Leave empty if not applicable. | string | `京ICP备XXXX号` |
| `homepageMode` | Homepage layout mode. | `"split"` \| `"cover"` \| `"cards"` | `split` |
| `singleColumnHomepage` | Force the post stream into a single narrow column regardless of screen width. | boolean | `false` |
| `cardVisibility` | Show/hide the homepage sidebar cards. | object | `{ author: true, taxonomy: true, activity: true }` |
| `recentUpdates` | Thresholds for the "Recently Updated" card. | object | `{ aggregateDays: 7, staleDays: 30 }` |

### `siteName`

Sets the `<title>` tag, the homepage hero text, the RSS feed title, and the footer copyright line. Pick something short — it appears everywhere. A good site name is 3-6 words. It doesn't need to match your domain; it's the human-readable label.

### `siteDescription`

Becomes the `<meta name="description">` and the Open Graph summary. Search engines and social platforms use it for preview cards. Keep it under 160 characters and make it a real sentence, not a keyword dump. If empty, no description meta tag is emitted.

### `icpNumber`

Only relevant for sites hosted in mainland China. When provided, it renders in the footer copyright line. Leave it empty if you don't need ICP filing — no placeholder or empty element is generated.

### `homepageMode`

The homepage layout mode. The default is `split`.

#### Cards

A stream of info cards, including the latest articles, author info, and more.

![Cards Mode](image-2.png "Homepage in cards mode" =70%x)

#### Cover

A full screen cover (freely editable via HTML), used to display the site title and more.

![Cover Mode](image-4.png "Homepage in cover mode" =70%x)

#### Split (default)

Combines the features of the other two modes: a cover with the hero on the first screen, and the information cards peeking slightly from the bottom. Scroll down to view the cards.

![Split Mode](image-3.png "Homepage in split mode, scroll down to view cards" =70%x)

### `singleColumnHomepage`
> Only in `cards` and `split` mode

When `true`, forces the stream cards into a narrow reading column even on wide screens.

![Single Column](image-5.png "Split homepage in Single Column" =70%x)

![Multi Column](image-6.png "Split homepage in Multiple Column" =70%x)

### `cardVisibility`
> Only in `cards` and `split` mode

Controls which sidebar cards appear on the homepage. The available keys are `author` (the profile card), `taxonomy` (tag cloud and collection links), and `activity` (recent comments and interactions). Set a key to `false` to hide that card. Omitted keys default to visible. This is cosmetic only — the underlying data is unaffected.

### `recentUpdates`

Drives the "Recently Updated" card. Two thresholds:

- **`aggregateDays`** (default `7`): commits within this many days are aggregated into the "recently updated" content list.
- **`staleDays`** (default `30`): if the latest commit is older than this many days, the card shows a "no updates for a while" notice instead of update content.

## Appearance (`appearance`)

| Field | Description | Datatype | Sample |
| --- | --- | --- | --- |
| `theme` | Color scheme. `"follow"` matches the visitor's OS preference. | `"follow"` \| `"light"` \| `"dark"` | `follow` |
| `accent` | Accent color in hex. Used for links, buttons, selection highlights, and the homepage gradient. | string (valid #Hex code for RGB) | `#36a32e` |
| `font` | Body typeface family. Affects all text (except post content) across the site. | `"sans"` \| `"serif"` \| `"mono"` | `sans` |
| `locale` | Default UI language for navigation, buttons, dates, and search. Does not translate post content. | `"follow"` \| `"en"` \| `"zh"` | `follow` |
| `defaultPerformanceMode` | Default visual-effects tier — controls backdrop blur, glow, and GPU-composited effects. User can override via a toggle in the site header. | `"auto"` \| `"full"` \| `"reduced"` | `auto` |

> **Renamed in 3.1.x:** the old flat keys `frontendTheme`, `frontendAccent`, `frontendFont` and `frontendLocale` are gone. They are now `theme`, `accent`, `font` and `locale` under the `appearance` block.

### `theme`

Picks the color scheme. `"follow"` (default) respects the visitor's OS-level light/dark preference and avoids a jarring theme flash. `"light"` and `"dark"` force a specific mode regardless of system setting.

![Dark Mode Homepage](image-7.png "Homepage in Dark Mode" =70%x)

### `accent`

A hex color code that tints links, buttons, text selection, and the homepage hero gradient. The default green (`#36a32e`) is deliberately neutral. Test your choice in both light and dark mode — a color that pops on a white background may vanish on a black one. Must include the `#` prefix.

### `font`

Sets the reading typeface. `"sans"` is clean and modern — the default. `"serif"` evokes a literary, traditional feel. `"mono"` suits technical or code-oriented sites. Headings, code blocks, and UI chrome use separate styling and are not affected by this setting.

*This does not affect the font in posts.*
You can configure the font for a single article in the CMS editor or its frontmatter.

![Post Page in Serif Font](image-10.png "Post Page in Serif Font, Post not affected" =70%x)

### `locale`

Controls the default UI language for navigation labels, button text, date formatting, and the search interface. `"follow"` detects from the browser's `Accept-Language` header — the best choice for a multilingual audience. This does NOT translate post content; each post's language is fixed.

### `defaultPerformanceMode`

Sets the default visual-effects tier before the user makes an explicit choice. This controls CSS effects like backdrop blur, box shadows, glow overlays, and other GPU-composited work — **not image quality or compression** (those are handled at build time by CI/CD).

- **`auto` (default):** Detects device capability at runtime. Fewer than 4 CPU cores, less than 4 GB memory, or `prefers-reduced-motion` → behaves like `reduced`. Otherwise → `full`. Right choice 95% of the time.
- **`full`:** All visual effects enabled unconditionally. Best on desktop and flagship phones; may cause fan spin on low-end devices.
- **`reduced`:** No backdrop blur, no glow, no expensive CSS filters. Lighter and faster on older hardware.

The user's choice is saved to `localStorage` and persists across sessions. This setting only determines the starting point before the user toggles.

### Base colors (`baseColorLight` / `baseColorDark`)

> **Moved in 3.1.x:** these are no longer `frontendBackgroundColorLight` / `frontendBackgroundColorDark` keys in `site.yml`. They are stored in **`data/background/background.yml`**, next to the other background metadata (mode, position, blur, overlays).

They override the base background color behind all page content, replacing the theme-derived default. Each theme gets its own color:

- **Light mode** (`baseColorLight`): applied when the visitor is in light mode.
- **Dark mode** (`baseColorDark`): applied when the visitor is in dark mode.

You can set only one, both, or neither. When a color is left empty, the system falls back to the theme default — dark backgrounds in dark mode, light backgrounds in light mode.

This is not the same as a background *image*. The color sits on the base layer, underneath any background image and overlay. If you've set a background image, the color shows through when the image has transparent areas or hasn't loaded yet. If you haven't set an image, the color IS the page background.

Use cases:

- Warm paper tint for a reading-oriented blog: `baseColorLight: "#f5f0eb"`
- Deep navy for a dark-mode developer site: `baseColorDark: "#0d1117"`
- Match your brand palette without touching the CSS.

Background **images and videos** are auto-discovered from the `data/background/` directory — the directory is the data source, no URL is stored in YAML. The same applies to the author avatar in `data/avatar/`. In the CMS you manage all of this under **Settings → Template → Appearance**, in the Background group.

## Search (`search`)

| Field | Description | Datatype | Sample |
| --- | --- | --- | --- |
| `searchSuggestions` | Suggest matching tags and titles as visitors type in the search box. | boolean | `true` |
| `globalSearch` | Let visitors open a search overlay from any page with Ctrl/Cmd+K or `/`. | boolean | `true` |
| `fullTextSearch` | Match queries against the full body of posts, not just titles and summaries. | boolean | `true` |

### `searchSuggestions`

Suggests matching tags and post titles as visitors type, so they can find content faster and discover related topics without knowing exact wording. Disabling it leaves a plain search box with no hints. On by default.

### `globalSearch`

Adds a site-wide search overlay that visitors can summon from any page with Ctrl/Cmd+K or `/`, so they can search without navigating to the search page first. It returns the same results as the dedicated search page. Turn it off if you prefer search to live only on its own page. On by default.

![Global Search in Post Page](image.png "Global Search in Post Page" =70%x)

### `fullTextSearch`

Lets visitors search inside the body of your posts, not just titles, summaries, and tags. At build time a full-text index (`full_index.json`) is generated from the post bodies. When a term matches text inside an article, that passage is shown and highlighted in the results, so a query can surface a post even when the keyword doesn't appear in its title. On by default.

## Comments master switch (`comments`)

The comments plugin section. `enabled` is the plugin master switch — when `false`, the comment section, attitude buttons, and the whole comments feature disappear from the build. Inside it, `comments` toggles the comment section on post pages specifically (the same flag the Post Page comments group refers to); when that is `false`, comment sections are not rendered at all, regardless of the per-post comment backend.

## Page toggles (`aboutPage`)

| Field | Description | Datatype | Sample |
| --- | --- | --- | --- |
| `aboutPage` | Enable the about page, sourced from `data/__about__/index.md`. | boolean | `true` |

### `aboutPage`

When enabled, generates the about page from `data/__about__/index.md` using the same markdown rendering pipeline as blog posts. If you haven't written an about page yet, leave this off to avoid an empty page.

> **Collections and friends pages are no longer toggled from `site.yml`.** They are plugins: enable the `collections` / `friends` section (`enabled: true`) and the `/collection` / `/friends` pages appear with their navigation links; disable them and the routes return 404 and no nav link appears. The data files (`collections.yml`, `friends.yml`) can still exist — they're just not rendered. See the [Collections Guide](post://c8n-config) and [Friends Management](post://friend-config).

## RSS (`rss`)

Generates an RSS 2.0 feed at `/rss.xml`. Feed readers, RSS-to-email services, and podcast directories depend on this. Requires a valid `site` URL in `astro.config.mjs` to build absolute feed URLs.

## Analytics (`analytics`)

Traffic analytics with a pluggable backend. `enabled` is the master switch; `backend` selects the provider, and each provider has its own credential fields. Custom events are only used by Google Analytics — the other backends auto-track.

| Field | Description | Datatype | Sample |
| --- | --- | --- | --- |
| `enabled` | Master switch for analytics integration. | boolean | `false` |
| `backend` | Analytics provider. | `""` \| `"ga"` \| `"cloudflare"` \| `"umami"` \| `"plausible"` \| `"baidu"` | `""` |
| `gaMeasurementId` | Google Analytics 4 measurement ID. | string | `G-XXXXXXXXXX` |
| `cloudflareToken` | Cloudflare Web Analytics token. | string | — |
| `umamiServerUrl` | Umami server URL (self-hosted). | string | — |
| `umamiWebsiteId` | Umami website ID. | string | — |
| `plausibleServerUrl` | Plausible server URL (self-hosted). | string | — |
| `plausibleDomain` | Plausible domain. | string | — |
| `baiduId` | Baidu Analytics ID (the part after `hm.js?`). | string | — |

> **Renamed in 3.1.x:** the old flat `traffic` switch is gone. Analytics is now the `analytics` block with `enabled` + `backend` + per-backend credentials, supporting Google Analytics, Cloudflare, Umami, Plausible and Baidu.

With `enabled: false` (the default) no analytics script is loaded at all. With `enabled: true`, set `backend` to one of the providers and fill in its fields — `gaMeasurementId` for `ga`, `cloudflareToken` for `cloudflare`, `umamiServerUrl` + `umamiWebsiteId` for `umami`, `plausibleServerUrl` + `plausibleDomain` for `plausible`, `baiduId` for `baidu`. The script is injected into every page and does not block rendering.

## Post page (`post`)

Everything about how a single article page renders lives under the `post` block:

| Block | Purpose |
| --- | --- |
| `post.meta` | Header meta: updated date, word count & reading time, AI badge, tags. |
| `post.toc` | Table of contents: inline, floating, mobile control. |
| `post.collectionNav` | Collection navigation panel on the post page. |
| `post.endOfArticle` | Related posts, prev/next navigation, author card, share buttons. |
| `post.comments` | Comment backend and comment options. |

### `post.meta`

Controls the header area of a post:

- **`metaUpdated`** — show the "updated on" date when a post has been modified.
- **`metaStats`** — show word count and estimated reading time.
- **`metaAiBadge`** — show the AI badge for AI-assisted posts.
- **`showTags`** — show the post's tags.

All default to `true`.

### `post.toc`

Controls the table of contents:

- **`enabled`** — master switch for the TOC.
- **`inlineToc`** — render the TOC inline at the top of the article.
- **`tocFloat`** — render a floating TOC beside the article.
- **`tocFloatAlwaysExpanded`** — keep the floating TOC permanently expanded: no background/blur, items never collapse to lines, and the content reserves right-side space. Overrides the collapse toggle.
- **`mobileTocControl`** — show a TOC control on mobile devices.

### `post.collectionNav`

- **`enabled`** — show the collection navigation panel on post pages.
- **`alwaysCollapsed`** — start with the panel collapsed.

### `post.endOfArticle`

#### `relatedPosts`

Shows a "related posts" block derived at build time from shared tags and collections (3 posts).

#### `prevNext` — Prev / Next navigation

Toggles the previous/next post navigation at the end of the article. Two modes and a scope control its behavior:

- **`prevNextMode`** — `"both"` (previous + next) or `"next-only"` (next only).
- **`prevNextScope`** — `"global"` (all posts, ordered by date) or `"collection"` (within the same collection). Defaults to `collection`.
- **`prevNextOrder`** — `"desc"` (newest first, the default) or `"asc"` (oldest first). Only applies when the scope is `global`; collection order always comes from `collections.yml`.

The navigation follows four rules:

1. In `next-only` mode, no "previous" placeholder is rendered at all.
2. The last post in the sequence still renders a "you've reached the last post" placeholder instead of disappearing.
3. With scope `collection`, posts that belong to no collection show no prev/next navigation.
4. Slides posts are excluded entirely — neither as the current page nor as a candidate.

#### `authorCard`

Shows an author card at the end of the article. Per the author-card rule, the card is displayed **only** when the article has exactly one author and that author is the site's own author (the `$site$` placeholder in the post frontmatter, or a name matching `profile.name`). Multi-author posts never show the card.

#### `share` / `shareChannels`

Toggles the share buttons and picks the channels. `shareChannels` is a sortable list — the order is the rendering order — with `twitter`, `weibo` and `linkedin` available (default: all three).

### `post.comments`

The comment backend and its options:

| Field | Description | Datatype | Sample |
| --- | --- | --- | --- |
| `backend` | Comment backend. `""` = static JSON, `"waline"` = Waline headless API. | `""` \| `"waline"` | `""` |
| `walineServerUrl` | Waline server URL. Required when `backend` is `"waline"`. | string | `https://waline.example.com` |
| `attitude` | Post attitude (like / dislike), rendered via the Waline reaction API. Hidden when the backend is not Waline. | boolean | `true` |
| `showGeoAddress` | Show the commenter's location (e.g. "China · Beijing") derived from IP — never the raw IP. Omitted when unavailable. | boolean | `true` |
| `imageUploadEnabled` | Allow images in comments, uploaded to an external image host. Off: comments cannot include images. | boolean | `false` |
| `imageUploadEndpoint` | Image host upload URL. Expects a `POST` multipart file and a response JSON `url` field (lsky-pro style: `data.links.url`). | string | — |
| `imageUploadToken` | Image host token, sent as `Authorization: Bearer <token>`. | string | — |

**How the comment system works in 3.1.x:**

- **`backend: ""` (static JSON):** comments are stored in `data/comments/{id}.json` and rendered read-only. The public submission form is disabled — there is no interaction.
- **`backend: "waline"` (headless):** Chronicle renders its own comment UI against the Waline headless REST API — no third-party Waline SDK is loaded. Visitors can post, react (like/dislike), and attach images if an image host is configured.
- **Moderation:** comment moderation is delegated to the Waline admin dashboard at `<server>/ui`. The local Manager CMS has no comment management panel anymore.
- **Snapshots:** the SSG always renders from `data/comments/{id}.json`; on Waline the client fetches live comments and replaces the static content when the section scrolls into view.

## Global reset (Settings → System → Reset)

The **Settings → System → Reset** page offers three independent operations, each with a CLI equivalent (all support `--dry-run` to preview without writing):

| Operation | What it does | CLI |
| --- | --- | --- |
| **Reset template settings** | Resets `data/site.yml`, `profile.yml`, `friends.yml`, `collections.yml` and `background/background.yml` back to their schema defaults — hand-written comments and untouched keys are preserved. | `node scripts/reset-site.mjs` |
| **Reset CMS config** | Resets the editor workspace config (`.chronicle/workspace.json`) to the system-settings defaults. | `node scripts/reset-cms.mjs` |
| **Clear data/** | Deletes all content: posts (including `index.json`), comments, pending comments, media, avatar and background images, branding, and the about page. The directory structure and the YAML data files are kept. | `node scripts/reset-data.mjs` |

Running **`node scripts/init-clean.mjs`** performs all three in order, returning the site to a fresh, schema-default state.

## Where the settings connect

`site.yml` configures *how* the site renders; the content itself lives in other files under `data/`:

- **`profile.yml`** — the author profile (showProfileCard, name, bio, location, links). The `$site$` placeholder in post frontmatter refers to the site's own author.
- **`friends.yml`** — friends page cards and global style.
- **`collections.yml`** — collection definitions; the `nodes` tree can nest groups.
- **`background/background.yml`** — background metadata including `baseColorLight` / `baseColorDark`.
- **`posts/<id>/index.md`** — each post (frontmatter + Markdown body); **`posts/index.json`** — the program-generated post index.

Start with site config. Get the title, description, and appearance right. Then move on to profile, friends, and collections — each builds on what you set here.
