# Changelog

All notable changes to Chronicle Aurora. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
this project aims to follow [Semantic Versioning](https://semver.org/).

Downstream repos: `npm run update` merges `upstream/main` into your branch and keeps `data/` and
`.chronicle/` untouched, so treat this file as the list of framework changes you receive.

## [Unreleased]

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
