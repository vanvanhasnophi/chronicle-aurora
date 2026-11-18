# Changelog

All notable changes to Chronicle Aurora. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
this project aims to follow [Semantic Versioning](https://semver.org/).

Downstream repos: `npm run update` merges `upstream/main` into your branch and keeps `data/` and
`.chronicle/` untouched, so treat this file as the list of framework changes you receive.

## [Unreleased]

## [3.1.0] — 2026-11-18

**Highlights of 3.1.0**

- A template repository that starts empty: `data/` ships schema defaults and no posts, the demo content
  lives on a content-only `demo` branch, and `.chronicle/` is generated on first launch.
- One build pipeline for any host: GitHub Pages root or project sites, custom domains, and a documented
  static `dist/` for any CDN. `SITE_URL` and `BASE_PATH` are resolved automatically in CI.
- CI you can trust: workspace typechecks, indexer unit tests, two plugin-isolation assertions, a
  base-path link audit, and a browser-mode CMS end-to-end test.
- Social and brand assets out of the box: canonical/Open Graph tags, a generated 1200×630 card, a full
  favicon set, and directory-as-setting icons (or your avatar).
- A clear upgrade path for forks: `npm run update` follows the `upstream` remote, and this file is the
  contract for what changed.

### Added

- **Clean template copies.** A repository created with "Use this template" starts empty: `data/` ships
  schema defaults and no posts, `.chronicle/` is generated on first launch, and the demo content is not
  copied (it lives on the content-only `demo` branch of the upstream repository).
- `npm run demo:fetch` / `dev:demo` / `build:demo` / `preview:demo` — work on the demo site locally:
  content is fetched into the git-ignored `demo/`, code always comes from your branch.
- `npm run preview` — zero-dependency static server for the build output in `dist/`.
- CI gate (`.github/workflows/ci.yml`): workspace typechecks, indexer unit tests, a template build, and
  both plugin-isolation assertions run on every pull request.
- Canonical links plus Open Graph `og:url` / `og:image`. A post's `image:` frontmatter field (absolute
  URL or `/root` path) now feeds `og:image` and upgrades `twitter:card` to `summary_large_image`.
- Unit tests for the post indexer (`packages/gen/test/indexer.test.mjs`, `node:test`, no new deps).
- **GitHub Pages project sites** (`<user>.github.io/<repo>/`): every absolute link, redirect, feed, sitemap and robots entry now follows a configurable base path (`BASE_PATH`), so a sub-path deployment works without hand-editing links. CI derives `BASE_PATH` from the Pages settings.
- `npm run demo:commit` — commit demo content back to the `demo` branch without staging it on `main` (`--push` supported).
- Icons are directory-as-setting: `favicon.svg` / `favicon-32.png` / `favicon.ico` / `apple-touch-icon.png` / `icon-192.png` / `icon-512.png` in `data/branding/` override the defaults; `appearance.useAvatarAsIcon` (appearance settings) uses `data/avatar/` when no explicit file is present. `site.webmanifest` is generated from the resolved icons, and root-relative images (avatars, friends) now follow `BASE_PATH` too.
- `npm run test:cms` — browser-mode CMS end-to-end check: uploads an avatar through the CMS API, toggles "Use Avatar as Icon", verifies `site.yml` and the build output (head icon + manifest), then restores everything. The repository does not bundle Electron; the CMS is developed and tested in the browser (Vite + `vite-data`).
- Brand assets: `npm run assets` generates a default 1200×630 social card (`public/branding/og-default.png`) plus the favicon set (svg / 32 / 192 / 512 / apple-touch / ico) and `site.webmanifest` from the site name, description and accent colour. Every page now falls back to the default `og:image` (a post-level `image:` still wins), and `<head>` carries the icon / manifest / theme-color links.
- `npm run check:base` / CI — assert that every absolute link in a sub-path build carries `BASE_PATH`; the job fails and prints the offending URLs.
- `npm run shots` — regenerate `demo-desktop.png` / `demo-mobile.png` (light theme, English home page, real mobile emulation via Chrome DevTools Protocol).
- `CHANGELOG.md` (this file).

### Changed

- `SITE_URL` is build-time configuration resolved in CI: repository variable → Pages settings
  (`origin` from `actions/configure-pages`) → root-Pages repo name → hard error. A custom domain needs
  no manual configuration; a production build that still contains `localhost` fails the deploy.
- Deployment documentation describes one supported build path (`npm run build:astro` → `dist/`);
  `packages/template-astro/dist/` is called out as an intermediate directory only.
- `npm run update` only trusts a remote named `upstream`; a fork's `origin` is never treated as upstream.
- `.chronicle/` is no longer tracked. The CMS generates its defaults from
  `packages/manager/schemas/system-settings.schema.json` instead of a hand-maintained copy.
- `scripts/reset-site.mjs` follows the current schema layout (homepage / appearance / post-page /
  friends / collections) and skips `x-site-flag` fields.
- Plugin-isolation checks run against the demo fixtures and refuse to run when those fixtures are absent.
- The default accent colour is now emerald green (#10b981, previously #36a32e); existing sites keep the accent configured in data/site.yml, and the default icon uses a fixed aurora gradient rather than the accent.
- Schema `x-version` fields describe the schema, not the package: they stay independent of the
  package version (post-page 3.0.0, profile/collections 2.0.2, system-settings 1.0.0).

### Fixed

- `reset:site` referenced `template-settings.schema.json`, which no longer exists after the settings
  split, so `npm run init:clean` died on its first step.
- Shell scripts were checked out with CRLF on Windows, which made `bash` fail on `update-app.sh` and
  `stop.sh`; `.gitattributes` now forces LF for `*.sh`.
- `scripts/migrate-legacy.mjs` used `cp -r`, which does not exist in the Windows `cmd` shell used by npm.
- README screenshots lived under `data/assets/`, so emptying `data/` broke the first screen of the README.

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

## [3.0.x] — 2026-08-07 → 2026-11-18

Aurora 3.0 line: pluggable feature architecture (collections / friends / comments / search / slides /
reading experience / AI enhancements), the template manifest that lets the CMS drive any compatible
template, structured `site.yml` settings with `data/` as the single content source, the Marp-based
slide posts, the multi-backend analytics block, and the Electron content manager.

Historical detail is in the commit log: `git log v3.0.0..HEAD --oneline`.
