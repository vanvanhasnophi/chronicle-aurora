# Changelog

All notable changes to Chronicle Aurora. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
this project aims to follow [Semantic Versioning](https://semver.org/).

Downstream repos: `npm run update` merges `upstream/main` into your branch and keeps `data/` and
`.chronicle/` untouched, so treat this file as the list of framework changes you receive.

## [Unreleased]

## [3.1.1] — 2026-11-20

### Added

**Export & print**

- **Article and slide export are self-contained packages.** When the document references local assets,
  the export is a ZIP whose document is always named `index.html` (so unzipping into a folder gives a
  directly openable page) alongside canonically renamed copies: `image1.png`, `image2.jpg`,
  `attachment1.pdf`, … The HTML is rewritten to those names, so the package works wherever it is
  unzipped. Only `/data/…` URLs are copied — external URLs stay absolute. `post://` links become the
  site's canonical `/<locale>/post/<slug>`; assets that cannot be read keep their original URL and are
  reported in the console instead of silently breaking. **With no local assets the export stays a single
  file named after the post title** — no pointless archive. Written by a dependency-free store-only ZIP
  writer with fixed timestamps, so repeated exports are byte-identical.
- **Slide images are packaged too.** Marp keeps image sources exactly as authored (`asset://logo.png`,
  bare `pic.png`), which used to export as dead `src` values; both are resolved to the `data/` space
  before packaging, then renamed and copied like article assets.
- **Print output is read-only.** File cards and internal links lose their target (a printed page can't
  navigate the CMS) while external links and `mailto:` stay clickable in the PDF. The print frame was
  already a hidden fullscreen iframe with forced light mode; neutralised elements now also drop the
  pointer cursor.

**Markdown**

- **GitHub-style alerts.** `> [!NOTE]` / `[!TIP]` / `[!IMPORTANT]` / `[!WARNING]` / `[!CAUTION]`
  render as a tinted, colour-coded callout with a title line; text after the marker becomes a custom
  title (`> [!WARNING] Careful`). The marker line is consumed, so multi-paragraph alerts work, and
  the type palette is independent of the theme accent. Implemented in both renderers by convention
  and covered by `check:markdown`.

- **`open:` link prefix** — `[manual](open:manual.pdf#page=3)` renders a plain inline link even when
  the URL ends in a card extension. Counterpart of the `file:` / `audio:` / `video:` card prefixes.
- **Inline “mini” file cards** — a card that shares its line with prose
  (`Download the [report](report.pdf) today.`) renders as a single-line pill instead of a full-width
  block. A card alone on its line keeps the block treatment.
- **`code:` is an alias of `text:`** — both force a Code/Text card, so
  `[readme](code:README.md)` works as expected instead of producing a dead `code:` href.
- **`file:` is a real card type** — the CMS already emitted it for extension-less / unknown files,
  but the renderer ignored it and produced dead `file:…` hrefs.

### Changed

- **Blockquotes redesigned.** The 1.x look (4px accent bar on `--active`, an *interaction-state* colour
  used as a content surface) is gone — and so is the box. A quote is now one 2px rail in a muted accent
  tint (`color-mix(in srgb, var(--accent) 38%, var(--comp-text-sec))`), square: no radius, no
  background, no shadow. The body drops one step to `--comp-text-sec`, indents `1.15rem` on both sides
  (so tables and code blocks stop before the rail instead of running to the article's right edge) with
  `1.75rem` outer margins, and inner blocks are reset then spaced by a single `0.8em` gap. Nested
  quotes indent on a quieter rail (22% accent); quotes inside list items keep a tighter margin. Pure
  CSS, no renderer change.
- **Interaction utilities renamed** (internal to the theme, not part of any content API):
  `glowable` → `interactive--hl`, `scalable` → `interactive--motion`. The old names described *how* a
  theme draws the effect, which made them wrong for any other theme; the new ones describe *what
  happens* and stay bound to the `.interactive` capability gate. `.interactive` now also carries
  `cursor: pointer`, the scale values moved into `--hover-scale` / `--hover-scale-mobile`, and
  `scale()` is disabled under `prefers-reduced-motion`. `.u-clickable` is deprecated (use
  `.interactive`). No compatibility aliases were kept: these classes never appeared in Markdown, only
  in the theme's own card components.
- **A linked image behaves as a plain link.** `[![Version](badge.svg)](CHANGELOG.md)` no longer opens the
  image viewer on click — the image is inside an `<a>`, so the click belongs to the link. Applies to the
  site (`FilePreviewModal`) and to the CMS preview (`MarkdownItPreview`); images that are *not* inside a
  link still open the viewer.
- **Images that share a line with text stay inline.** `Text ![icon](a.png) more` renders an inline `<img>`
  instead of a block image container, so the surrounding paragraph is no longer split by a `<div>` and no
  2:1 placeholder/caption is injected. Applies in every block type (paragraph, list item, blockquote,
  table) and in both renderers; an image alone on its line keeps the full block treatment with the
  placeholder and caption.
- **Markdown documents are links, not preview cards.** `[English](README.md)` now renders an inline
  `<a>`; force a card with `text:` or `attach:`.
- **Images inside a link stay inline.** `[![Version](…)](CHANGELOG.md)` keeps the badge at natural
  size instead of wrapping it in a full-width 2:1 image container.
- **Stricter file-extension detection.** The extension is read from the last path segment only, so
  `https://example.md/` is a site rather than a `.md` file; `?query` and `#fragment` are ignored; the
  extension must be 2–6 alphanumerics.
- **File cards are `<span>`-based.** A `<div>` inside `<p>` is invalid HTML and browsers split the
  surrounding paragraph around it.

### Fixed

- **Search overlay panel height** is now `70vh`. The `640px` cap left the results panel short
  on tall screens, and the open transition no longer animates `height` (only `transform` plus a
  0.1s `margin-top`).

- **`=x300` no longer stretches an image to the full column.** A height-only hint used to fall back to a
  `width:100%` wrapper, and an explicit width *plus* height overrides `aspect-ratio` — so the image was
  stretched to column width × 300px. The width is now derived from the real file aspect ratio
  (`=x300` → `width:225px;height:300px` when the file is 1279×1706), `asset://` images are resolved to
  `data/assets/` so they get a ratio too, and the few cases without a ratio basis (external URLs, the CMS
  preview) letterbox with `object-fit: contain` instead of distorting.
- **In-page anchors stay anchors.** `[x](#section)` inside a post used to be resolved as a relative
  file, producing `/post_attachment/<slug>/#section`; both renderers now leave `#…` targets alone.
- **The CMS preview wraps standalone images in quotes, lists and tables** the way the build does, so
  the placeholder / aspect-ratio treatment no longer disappears outside paragraphs.
- **Mermaid node labels no longer lose their last character.** The diagram measures a label box with
  the font family from its config, but the stylesheet rendered the label with `font-family: inherit`
  (the app stack). When the two differ — a custom stack, a subsetted webfont — the box comes out a few
  pixels narrow and `<foreignObject>`'s default `overflow: hidden` cuts the tail off ("Write Markdowr",
  "Deploy to CDN" with half an N). The client renderer now measures with the resolved
  `--app-font-stack` and waits for `document.fonts.ready`, the exported SVG uses the same family, and
  the shared stylesheet lets mermaid labels overflow their box instead of clipping. Node and edge
  labels now render at `0.98em`, one step below body text.
- **Relative links no longer vanish outside `data/posts/`.** markdown-it aborts an entire link when
  `validateLink` rejects the destination, and the whitelist had no "plain relative path" case while
  `normalizeLink` can only absolutize a relative href when it knows the post slug. So
  `[English](README.md)` rendered as literal text in new articles and in locally opened files (no
  slug), and `[![badge](img)](CHANGELOG.md)` degraded to `[` + image + `](CHANGELOG.md)`.
  `validateLink` is now context-free: scheme-less destinations always pass, only the known schemes
  (`http(s)`, `file`, `mailto`, `tel`, `sms`, `asset`, `post`) are allowed. The CMS copy had also
  drifted (a catch-all `[a-z]+:` branch accepted *any* scheme, e.g. `code:`), which is why the same
  markdown could render differently in the preview and on the site — both copies now share one rule.
- File-card labels containing nested markup (`[![badge](img)](url)`) were mangled by a naive `]`
  scan. Card and link destinations are now parsed with markdown-it's own helpers, so labels, titles
  and the `<dest>` form behave like a normal link.

## [3.1.0] — 2026-11-19

**Highlights**

- **Interface polish everywhere.** Blogs-page state in the URL, TOC and navigation details, light-mode
  colour fixes, slides print/browse fixes, and optimistic comments and likes make browsing feel faster
  and steadier.
- **Template-first repository.** `data/` is a clean template, demo content lives on a content-only `demo`
  branch, and `.chronicle/` is generated on first launch instead of being tracked. Forks and maintainers
  work on code without dragging demo data along.
- **Rebuilt build and CI.** One `npm run build:astro` pipeline covers Pages root and project sites plus
  custom domains, with a base-path audit, plugin-isolation checks and lockfile repair, alongside
  `preview`, `shots`, `demo:*` and other shortcuts.
- **Refreshed brand.** A new aurora favicon set and default social card, directory-as-setting icons,
  avatar-as-icon support, and a new default emerald accent (`#10b981`).

### Added

**Template and distribution**

- **Clean template copies.** A repository created with "Use this template" starts empty: `data/` ships
  schema defaults and no posts, `.chronicle/` is generated on first launch, and the demo content is not
  copied (it lives on the content-only `demo` branch of the upstream repository).
- `npm run demo:fetch` / `dev:demo` / `build:demo` / `preview:demo` — work on the demo site locally:
  content is fetched into the git-ignored `demo/`, code always comes from your branch.
- `npm run demo:commit` — commit demo content back to the `demo` branch without staging it on `main`
  (`--push` supported).
- `npm run preview` — zero-dependency static server for the build output in `dist/`.
- `npm run shots` — regenerate `demo-desktop.png` / `demo-mobile.png` (light theme, English home page,
  real mobile emulation via Chrome DevTools Protocol).

**Deployment and CI**

- **GitHub Pages project sites** (`<user>.github.io/<repo>/`): every absolute link, redirect, feed,
  sitemap and robots entry follows a configurable base path (`BASE_PATH`), so a sub-path deployment works
  without hand-editing links. CI derives `BASE_PATH` from the Pages settings.
- `npm run check:base` / CI — assert that every absolute link in a sub-path build carries `BASE_PATH`; the
  job fails and prints the offending URLs.
- CI gate (`.github/workflows/ci.yml`): workspace typechecks, indexer unit tests, a template build, both
  plugin-isolation assertions, and the base-path audit run on every pull request.
- Unit tests for the post indexer (`packages/gen/test/indexer.test.mjs`, `node:test`, no new deps).
- `npm run test:cms` — browser-mode CMS end-to-end check: uploads an avatar through the CMS API, toggles
  "Use Avatar as Icon", verifies `site.yml` and the build output (head icon + manifest), then restores
  everything. The repository does not bundle Electron; the CMS is developed and tested in the browser
  (Vite + `vite-data`).

**Publishing and brand**

- Canonical links plus Open Graph `og:url` / `og:image`. A post's `image:` frontmatter field (absolute
  URL or `/root` path) now feeds `og:image` and upgrades `twitter:card` to `summary_large_image`.
- Brand assets: `npm run assets` generates a default 1200×630 social card plus the favicon set (svg / 32 /
  192 / 512 / apple-touch / ico) and `site.webmanifest` from the site name, description and accent colour.
  The default icon is a fixed aurora mark, independent of the site accent.
- Icons are directory-as-setting: `favicon.svg` / `favicon-32.png` / `favicon.ico` / `apple-touch-icon.png`
  / `icon-192.png` / `icon-512.png` in `data/branding/` override the defaults; `appearance.useAvatarAsIcon`
  (appearance settings) uses `data/avatar/` when no explicit file is present. Root-relative images
  (avatars, friends) also follow `BASE_PATH`.

**Authoring and reading**

- **Blogs page rebuilt.** Tag filter, expand-all, result count, clear-filter, and a separate "no posts
  match this filter" state; filter and sort state live in the URL so refresh, sharing and the back button
  keep them.
- **Timeline and sorting on `blogs/`.** A new timeline layout plus a sort control (newest / oldest /
  title), persisted as `?sort=` next to the existing tag filter.
- **Homepage card columns.** `homepage.cardColumns` replaces the single-column toggle: each of up to three columns declares its own ordered card list (`cards: [{type: intro}, {type: recent}]`, repeats allowed). Width ratios apply when two or three columns render, max-width applies in every layout, and cards from a column that cannot fit append to the last surviving column; old `singleColumnHomepage` / `cardVisibility` configs keep working when `cardColumns` is absent.  `homepage.cardFlowMaxWidth` caps the whole card flow in every homepage mode, and the shell now fills the available width up to that cap (previously `cards` mode shrank to its content). A drag-and-drop editor in the CMS manages the columns.
- **Collapsible `<details>` blocks.** Insert action in the editor ribbon, localized default summary (a real
  `<summary>` is injected when the author omits one), styled glass header and chevron in posts and the TOC.
- **AI Enhance plugin (default off).** A schema-driven `ai-enhance` plugin plus `scripts/ai-summaries.mjs`;
  it generates build-time summaries (no runtime API key), is disabled by default and removable like every
  other plugin.
- Comment likes and comment submissions give immediate feedback: the vote or comment appears at once and
  is never rolled back, whether or not the request reaches the server. Comments and reaction counts are
  fetched once per visit and served from an in-memory session cache, so soft navigation does not re-query.
- Light-mode accent and featured colour adaptation, including a gold-friendly featured alternative and
  token-based featured detection.
- TOC polish: summary weight, animated gap, icon, `aria-controls`, and consistent focus styling.
- Nav-height, cover-wrapping and hint-stacking refinements.

### Deprecated

- `homepage.singleColumnHomepage` and `homepage.cardVisibility` are deprecated in favour of
  `homepage.cardColumns`. They are still read (the renderer falls back to them and the CMS derives the
  new columns on load), preserved on save, and will only be removed in 4.0.0.

### Changed

- **Split homepage redesign.** The split hero and card area were re-laid out (sticky hero, card deck
  below) and the card flow is now configurable instead of a fixed two-column deck: up to three columns
  with per-column width and max width.
- **Markdown reading polish.** Collapsible `<details>` blocks use a glass header and chevron, and heading,
  list, quote, table and code spacing was retuned for readability in posts and the TOC.
- **Search opening behaviour.** The global floating search now opens from the dedicated trigger instead of
  replacing the inline search box, and loads its index lazily on first use.
- **Gold accents keep featured readable.** When the accent is gold-toned, featured badges and highlights
  switch to neon pink instead of blending into the accent.
- **Soft-navigation loading effect.** Internal link clicks show a progress indicator, and the accent colour
  is preserved across page transitions.
- `SITE_URL` is build-time configuration resolved in CI: repository variable → Pages settings (`origin`
  from `actions/configure-pages`) → root-Pages repo name → hard error. A custom domain needs no manual
  configuration; a production build that still contains `localhost` fails the deploy.
- Deployment documentation describes one supported build path (`npm run build:astro` → `dist/`);
  `packages/template-astro/dist/` is called out as an intermediate directory only.
- `npm run update` only trusts a remote named `upstream`; a fork's `origin` is never treated as upstream.
- `.chronicle/` is no longer tracked. The CMS generates its defaults from
  `packages/manager/schemas/system-settings.schema.json` instead of a hand-maintained copy.
- `scripts/reset-site.mjs` follows the current schema layout (homepage / appearance / post-page /
  friends / collections) and skips `x-site-flag` fields.
- Plugin-isolation checks run against the demo fixtures and refuse to run when those fixtures are absent.
- Plugin translations live with their plugins (src/plugins/<id>/locales/<locale>.json); src/locales/ now contains core strings only, and a disabled plugin contributes no translation text to the bundle.
- The default accent colour is emerald green (`#10b981`, previously `#36a32e`); existing sites keep the
  accent configured in `data/site.yml`, and the default icon uses a fixed aurora gradient rather than the
  accent.
- Schema `x-version` fields describe the schema, not the package: they stay independent of the package
  version (post-page 3.0.0, profile/collections 2.0.2, system-settings 1.0.0).
- The nav performance switch reflects the active performance mode instead of a static icon.

### Fixed

- The blogs page could show both "no posts match this filter" and the site-wide "start writing" empty
  state at the same time; the filter message now appears only when posts exist but none match.
- **Multi-collection posts.** The collection switcher now moves between every collection a post belongs
  to; previously it stayed on the first one.
- `reset:site` referenced `template-settings.schema.json`, which no longer exists after the settings
  split, so `npm run init:clean` died on its first step.
- Shell scripts were checked out with CRLF on Windows, which made `bash` fail on `update-app.sh` and
  `stop.sh`; `.gitattributes` now forces LF for `*.sh`.
- `scripts/migrate-legacy.mjs` used `cp -r`, which does not exist in the Windows `cmd` shell used by npm.
- README screenshots lived under `data/assets/`, so emptying `data/` broke the first screen of the README.
- Large images and diagrams in slides no longer overflow the printed page.
- The slides browse view let its scrollbar run underneath the toolbar; the scroll area now starts below it.
- The nav popup switch had insufficient contrast in the light theme.
- The accent colour could reset after a soft navigation; it is now preserved.
- A featured accent expressed as a token was not detected as gold, mis-selecting the featured alternative.
- Collection covers declared as `asset://…` now follow `BASE_PATH`; sub-path builds no longer link to
  `/assets/…` at the domain root.
- CI repairs the lockfile on the Linux runner (`npm install --package-lock-only`) before `npm ci`: npm
  records platform-optional deps (`@emnapi/*` and friends) differently on Windows, so a lockfile
  regenerated on Windows would otherwise fail `npm ci` on Linux.
- `npm run update` now fetches `upstream` before detecting its default branch; a freshly added remote no
  longer falls back to a non-existent `master`.
- `npm run update` no longer aborts while restoring `.chronicle/`: since 3.1.0 that directory is ignored, so
  it is restored on disk without being staged (and the merge commit stays clean).

### Upgrade notes

This release rewrote the **upstream git history**: the `v3.0.5`–`v3.0.10` tags were removed, and every
patch from `3.0.5` to `3.0.12` is now recorded as `3.1.0 snapshot 1`–`9`. If you forked before 3.1.0, do
**not** try to merge the two histories: re-create your repository from the template (or
`git reset --hard upstream/main`), then copy your `data/` back.

- `data/` is now the clean template (schema defaults, no posts). Demo content lives on the `demo` branch
  and is not copied by "Use this template" — fetch it with `npm run demo:fetch`.
- `.chronicle/` is no longer tracked; the CMS regenerates its defaults on first launch.
- README screenshots moved from `data/assets/` to `.github/assets/`, so emptying `data/` no longer breaks
  the first screen of the README.
- Shell scripts are forced to LF via `.gitattributes`; Windows checkouts of `*.sh` are now stable.

## [3.0.4] — 2026-10-13

### Fixed

- The slides editor could not open: Marp's CommonJS interop made `Marp` a namespace object
  ("Marp is not a constructor").

## [3.0.3] — 2026-08-25

### Added

- Empty-state placeholders: homepage blocks, friends, collections and search pages hide or show a
  placeholder when there is no content.

### Changed

- npm workspaces unify dependencies and the `@chronicle/shared` import convention; the full script set
  (init / reset / migrate / update) lands with it.
- Dependency refresh (vite 8, vue-router 5, vue-i18n 11, marked, mermaid), dead-dependency cleanup, and
  Electron installed on demand.

### Fixed

- iframe video embeds are whitelisted (NetEase Cloud Music, Bilibili, YouTube), including protocol-relative
  URLs.
- Preview active-block indexing was off around `html_block` / `inline` nodes.
- The Windows `@chronicle` alias broke on double drive-letter paths; `fileURLToPath` fixes it.
- Nav links no longer bounce in size while fonts load.

## [3.0.2] — 2026-08-21

### Fixed

- The back-to-top button stayed hidden after a soft navigation.

## [3.0.1] — 2026-08-21

### Fixed

- Collection membership is resolved live: posts without a collection no longer get a collection nav entry
  or lose body width.
- The activity digest ignores deleted posts instead of producing ghost entries.

## [3.0.0] — 2026-08-20

Aurora rewrite: a pluggable feature architecture with capability declarations (`provides`), build-time
plugin gating, and theme packages. The CMS gained plugin management pages and schema-driven settings;
content stays plain YAML + Markdown with YAML-as-DataSource support, comment-preserving writes, Marp slide
posts, a multi-backend analytics block, and a critical-CSS extraction pipeline with a size budget.
