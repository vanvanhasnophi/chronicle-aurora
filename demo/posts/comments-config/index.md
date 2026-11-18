---
title: Comments Configuration
date: 2026-08-14
updatedAt: 2026-08-17T12:00:00.000Z
tags: comments, guide
author: Eightyfor
aiGenerated: true
status: published
font: sans
---

`data/site.yml` controls how comments work on your Chronicle site. Chronicle is local-first with no runtime server, so comments are either read from static JSON files on disk at build time, or proxied to a self-hosted Waline backend over its headless REST API. This guide covers both paths and how to switch between them.

## Where the settings live

Comments are a **plugin**. Settings live in the `comments` section of `site.yml`, with two levels of switch:

| Key | Type | Role |
| --- | --- | --- |
| `comments.enabled` | boolean | Plugin master switch. `false` removes comments (and attitude buttons) from the build entirely. |
| `comments.comments` | boolean | Comment section switch on post pages. `false` hides the comment section even while the plugin is on. |
| `comments.backend` + friends | object | Backend selection + connection settings. Read only when `comments.comments` is `true`. |

```yaml
# data/site.yml
comments:
  enabled: true               # plugin master switch
  comments: true              # comment section on post pages
  backend: waline             # "" (static) or "waline"
  walineServerUrl: https://waline-xxx.vercel.app
```

`comments.comments` is only meaningful when `comments.enabled` is on. If you just want to turn comments off everywhere, set `comments.enabled: false` (or `comments.comments: false` to keep the plugin but hide the section).

## Choosing a backend

`post.comments.backend` accepts two values:

| Value | Behavior |
| --- | --- |
| `""` (empty) | **Static JSON.** Comments are read from `data/comments/{id}.json` at build time and rendered read-only. No submission form. |
| `waline` | **Waline, headless.** Comments are fetched and submitted through a self-hosted Waline server's REST API, but rendered with Chronicle's own UI. |

Both render the same comment list, avatar, and reply tree — only where the data comes from (and whether the submit form appears) differs.

## Static comments (`backend: ""`)

The default. Comments live as JSON files keyed by post id:

```
data/
├── comments/            # approved, public
│   └── hello-world.json
└── comments-pending/    # awaiting review
    └── hello-world.json
```

The directory is the state: `comments-pending/` is the review queue, `comments/` is what ships. Each record is Staticman-compatible — `parent` for replies, `rootId` for the thread root, `hidden` for soft-removal, pre-sanitized HTML in `content`.

This mode is **build-time and read-only**: the comment list is baked into the static HTML and there is no submission form, so visitors cannot post. Use static mode for read-only comment archives, or switch to Waline when you want visitors to write comments.

## Waline (headless)

Waline is a self-hosted comment backend (data store + API). Chronicle integrates it **headless** — it calls the Waline REST API directly and draws the list, form, reply box, and preview with its own markup and CSS. No third-party SDK or `<script>` is loaded, so the comment section keeps the site's design language.

The adapter maps Waline's fields onto Chronicle's comment model:

| Waline | Chronicle | Notes |
| --- | --- | --- |
| `objectId` | `id` | |
| `nick` | `author` | |
| `mail` | `email` | required on submit |
| `link` | `website` | |
| `comment` | `content` | server-rendered, sanitized HTML |
| `time` / `insertedAt` | `date` | |
| `pid` / `rid` | `parent` / `rootId` | |
| `avatar` | `avatarUrl` | |
| `sticky` | `pinned` | pinned (置顶) badge |
| `addr` | `location` | geo address, never the raw IP |

Waline's server renders markdown to HTML and sanitizes it with DOMPurify before storing it, so Chronicle renders the returned `content` directly — the same "sanitize at write, `set:html` at read" rule the rest of the project follows. Each post uses `/post/{id}` as its Waline path, so one comment thread is shared across all locales. The comment section hydrates only when scrolled into view (IntersectionObserver), then fetches live comments from the backend and replaces the static content.

### Deploying the Waline server

The server is the one thing you host yourself. The quickest route is Vercel + LeanCloud:

1. Create a LeanCloud app and copy its **APP ID**, **APP Key**, and **Master Key** from **Settings → App Keys**.
2. Deploy the Waline server to Vercel from the [`@waline/vercel`](https://www.npmjs.com/package/@waline/vercel) template.
3. Set `LEAN_ID`, `LEAN_KEY`, and `LEAN_MASTER_KEY` as Vercel environment variables, then redeploy.
4. The deployment URL (e.g. `https://waline-xxx.vercel.app`) is your `walineServerUrl`.

After deploying, visit `https://<your-server>/ui` once — the first account to register becomes the administrator.

### Configuring it

```yaml
# data/site.yml
comments: true
post:
  comments:
    backend: waline
    walineServerUrl: https://waline-xxx.vercel.app
```

Set `walineServerUrl` to the server root — **do not append `/api/comment`**; the adapter builds that path itself. Configure it either here in `site.yml` or through **Manager → Settings → Post → Comments**, which writes the same file.

### Attitude, location, and images

Three extra switches live under `post.comments` (all Waline-only, hidden when the backend is static):

- **`attitude`** (default `true`) — like/dislike bar for the post, rendered via the Waline reaction API.
- **`showGeoAddress`** (default `true`) — shows the commenter's geo address (e.g. "中国 北京市") derived from IP. The raw IP is **never** displayed, and the field is omitted when unavailable.
- **`imageUploadEnabled` / `imageUploadEndpoint` / `imageUploadToken`** (default off) — lets commenters attach images. Uploads go to an **external image host** you configure: the endpoint receives a multipart `file` and returns a JSON `url` field (lsky-pro style: `data.links.url`); the token, when set, is sent as `Authorization: Bearer <token>`.

```yaml
post:
  comments:
    backend: waline
    walineServerUrl: https://waline-xxx.vercel.app
    attitude: true
    showGeoAddress: true
    imageUploadEnabled: true
    imageUploadEndpoint: https://img.example.com/api/upload
    imageUploadToken: your-token
```

### Moderation & pending review

Comment moderation is **delegated entirely to the Waline admin dashboard** at `https://<your-server>/ui` — the first registered account is the administrator and approves, hides, or deletes comments there. The local Manager CMS has **no comment-management panel** in 3.1.x; `comments-pending/` exists only for the file-based (static JSON) flow.

Whether a new comment is published immediately or held for review is decided **by the Waline server**, through its `COMMENT_AUDIT` environment variable — not by Chronicle. The frontend only submits content; it never sends a status field.

| Setting | Result |
| --- | --- |
| `COMMENT_AUDIT=true` (or `1`) | New comments default to **pending review** — hidden from the public list until approved in the Waline admin. |
| unset / `false` / `0` | New comments are **approved** immediately and appear right away. |

Set it wherever your Waline server is hosted:

- **Vercel** → Project Settings → Environment Variables → add `COMMENT_AUDIT` = `true`, then redeploy.
- **Docker** → `docker run ... -e COMMENT_AUDIT=true`.
- **`.env`** → add a `COMMENT_AUDIT=true` line.

No Chronicle-side change is needed either way: the public `GET /api/comment` endpoint only returns approved comments, so pending ones simply don't appear until you approve them.

## Notes

- **Changes need a rebuild.** This is a static site — editing `site.yml` only takes effect after `npx astro build` (or a Manager commit/push that triggers CI).
- **Pagination.** The Waline list loads comments in pages of 20 and shows a "Load more" button; the comment count reflects all comments on the thread.
- **Static and Waline are mutually exclusive.** One `post.comments.backend` value applies site-wide; there's no per-post override.
- **Spam, email notification, and IP recording are server-side.** These are Waline server environment variables — Chronicle only owns presentation.
