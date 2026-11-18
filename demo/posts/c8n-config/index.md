---
title: Collections Guide
date: 2026-08-07T07:40:52.022Z
updatedAt: 2026-08-17T12:00:00.000Z
tags: collections, guide
author: Eightyfor
aiGenerated: true
status: published
font: sans
---

`data/collections.yml` lets you group articles into named sequences with a dedicated overview page, an article-side navigation panel, and collection-scoped prev/next navigation. It's the closest thing Chronicle has to a table of contents — readers browse a collection like a book, moving from one article to the next in the order you define.

## Why use collections

Tags are loose and associative; a post can have five tags and still be hard to find in sequence. Collections are deliberate. They impose an order and a narrative arc. Use them for:

- **Tutorial series** — a linear sequence like "Build a Blog with Chronicle," from first principles to deployment.
- **Topic deep-dives** — all your Rust posts, organized from foundational to advanced.
- **Curated reading paths** — a "Best of 2026" collection cherry-picked across tags and dates.

Collections don't replace tags — they complement them. A post can belong to multiple collections and also be tagged. Readers who arrive via search get tag context; readers who arrive via collection get a guided path.

The collection system has three surfaces:

1. **Overview page** (`/collections`) — a grid of collection cards with cover images, names, and descriptions. Clicking a card drills into the collection's detail tree view.
2. **Article sidebar panel** — on article pages that belong to a collection, a sidebar (desktop) or floating entry (mobile) shows the collection tree with the current article highlighted and groups expanding and collapsing on click.
3. **Collection-scoped prev/next** — with the end-of-article navigation scope set to "Within the same collection", readers move between articles in the exact order you defined.

The overview page and the sidebar panel are both gated by the collections plugin's `enabled` switch. Collection-scoped prev/next is independent of it.

## Data structure

`collections.yml` is a **top-level array** of collection objects. Each collection carries metadata plus an ordered tree of nodes. Nodes come in two types: `post` (a leaf that references an article) and `group` (a branch with a title and nested children). Groups nest to any depth.

### Collection fields

| Field | Description | Datatype | Sample |
| --- | --- | --- | --- |
| `name` | Human-readable collection title. Required. Max 60 characters. | string | `Chronicle Guide` |
| `slug` | URL-safe identifier. Required. Lowercase letters, digits, and hyphens only — `^[a-z0-9]+(?:-[a-z0-9]+)*$`. Max 60 characters. | string | `chronicle-guide` |
| `description` | Short summary shown on the overview card and in the detail view header. Max 300 characters. | string | `Everything you need to get started.` |
| `cover` | Optional image for the overview card; doubles as a blurred full-page background in the detail view. Supports `asset://` and external URLs. | string | `asset://covers/chronicle-guide.webp` |
| `nodes` | Ordered tree of post and group nodes. **Array order is navigation order.** | array | see below |

### Post nodes

| Field | Description | Datatype | Sample |
| --- | --- | --- | --- |
| `type` | Discriminator. Always the literal string `"post"`. Set automatically by the CMS. | `"post"` | `post` |
| `id` | Slug of the target post — its directory name under `data/posts/`. Must match a published article. | string | `site-config` |

`type: post` produces a clickable nav link with an article icon (or a slides icon for Marp presentations). The `id` is the post's directory name — no UUIDs, no file paths. Nodes referencing unpublished posts are skipped when navigation sequences are built, so you can draft an article and add it to a collection before publishing.

### Group nodes

| Field | Description | Datatype | Sample |
| --- | --- | --- | --- |
| `type` | Discriminator. Always the literal string `"group"`. Set automatically by the CMS. | `"group"` | `group` |
| `title` | Group heading displayed in the nav tree. Required. | string | `Configuration` |
| `children` | Nested array of post and group nodes. Groups nest to any depth. | array | `[{ type: post, id: ... }]` |

`type: group` renders a collapsible section with a folder icon and a caret toggle. The title only expands or collapses the group — it does not navigate. Use descriptive headings: "Configuration" tells the reader what's inside; "Part 2" doesn't. Groups with an empty `children` array still render as headers, just with nothing to expand. Nesting order follows the same rule as top-level `nodes` — array order is render order.

## Example

```yaml
- name: Chronicle Guide
  slug: chronicle-guide
  description: Everything you need to get started with Chronicle.
  cover: asset://covers/chronicle-guide.webp
  nodes:
    - id: welcome-to-chronicle
      type: post
    - type: group
      title: Configuration
      children:
        - id: site-config
          type: post
        - id: profile-config
          type: post
        - id: c8n-config
          type: post
        - id: friend-config
          type: post
    - id: markdown-showcase
      type: post
```

Note the order: this article sits inside the `Configuration` group, so in the sidebar and in collection-scoped prev/next it falls between `profile-config` and `friend-config` — regardless of dates.

## The overview page

The `/collections` route renders a grid of collection cards. Each card shows the cover image (if set), the collection name, and a two-line description clamp. Cards are laid out in `collections.yml` array order.

![Collection overview grid with cover images](image.png "Collections page showing cards with cover images, names, and descriptions" =70%x)\

### The detail view

Clicking a card drills into the collection detail view: the same expand/collapse tree as the sidebar, with a "back to list" button returning to the grid. The selected collection is tracked in the URL hash, so a detail view can be shared as a deep link and survives refresh. When the collection has a cover, it becomes a blurred full-page background with a dark overlay behind the tree.

![Collection detail view](image-2.png "Detail view with blurred cover background and expandable tree" =70%x)\

## The article sidebar panel

Article pages that belong to a collection render a navigation panel alongside the content. On desktop it's a fixed sidebar; below the 768px breakpoint it hides behind a floating button that opens an overlay. The current article is highlighted with an active state, and any group containing it is expanded automatically — sibling groups stay collapsed until clicked.

![Post node in collection sidebar](image-3.png "Post node with article icon and title in the collection sidebar" =70%x)\

When an article belongs to more than one collection, a dropdown switcher appears in the panel header with the first matching collection pre-selected; changing the selection re-renders the tree for the chosen collection.

## Settings

### Plugin switch — `collections` section

Collections are a **plugin**. The `/collection` page and the article sidebar panel are both gated by the plugin's `enabled` switch in `site.yml`:

```yaml
collections:
  enabled: true
```

When `false` (or when the plugin is removed), the `/collection` route is not generated (visiting it returns a 404), the article sidebar panel — including its mobile floating entry — disappears, and the homepage collection blocks vanish. Collection-scoped prev/next keeps working: it reads the collection assignments from the post index, not from the page.

### `post.collectionNav` — sidebar panel settings

The panel is configured under `post` in `site.yml`:

```yaml
post:
  collectionNav:
    enabled: true          # false → panel never renders
    alwaysCollapsed: false # true → never auto-expand on wide screens
```

- `enabled` — master switch for the article sidebar panel. When `false`, the panel never renders, even if the plugin is on.
- `alwaysCollapsed` — when `true`, the panel starts collapsed and never auto-expands on wide screens; the reader opens it explicitly.

### Prev/next — collection scope

The end-of-article navigation is configured under `post.endOfArticle`:

```yaml
post:
  endOfArticle:
    prevNext: true
    prevNextMode: both         # both | next-only
    prevNextScope: collection  # global (by date) | collection (node order)
    prevNextOrder: desc        # global scope only — ignored in collection scope
```

With `prevNextScope: collection`, prev/next follows the post's collection **node order** in `collections.yml`. Dates and `prevNextOrder` play no part — the settings UI even disables `prevNextOrder` while collection scope is active, because the collection itself defines the sequence.

Collection-scope behavior rules:

- **First article** — there is no prev entry; in `both` mode an "already the first" placeholder keeps the two-column layout stable.
- **Last article** — there is no next entry; an "already the last" placeholder is rendered instead of the nav disappearing.
- **No collection** — posts that belong to no collection show no prev/next at all in collection scope.
- **Slides excluded** — Marp slides posts never participate: a slides page renders no prev/next, and slides posts are filtered out of the sequence for other articles.
- **next-only mode** — the prev side is removed entirely (link and placeholder); only the next column renders, with the last-post placeholder when there is no next.
- **Unpublished posts** — nodes referencing drafts are dropped from the sequence, so a gap simply closes.

## The reverse index

At build time the indexer reads `posts/` and `collections.yml` and writes two derived fields into `posts/index.json` for every article that belongs to a collection:

- `collection` — the collection name (an article in multiple collections maps to the **last** collection containing it).
- `collectionPath` — the breadcrumb-style path through the tree, e.g. `Chronicle Guide / Configuration`.

The template reads these for the sidebar panel, breadcrumbs, and collection-scoped prev/next. `index.json` is program-generated — never hand-edit it; it is rebuilt from the directories before every build.

## CMS entry point

In the Manager, collections are edited under **Settings → Collections** (the `chronicle:collections` schema). The node-tree editor inserts post nodes via a post picker and group nodes with nested children, then writes `collections.yml` back to disk — you rarely need to touch the YAML by hand.

## Designing good collections

**Start small.** Three articles that tell a complete story beat fifteen that lose the thread. You can insert nodes into any position later.

**Use descriptive group titles.** "Configuration" tells the reader what's in the section. A generic label like "Part 2" communicates nothing.

**Don't mirror your archive.** If every post belongs to exactly one collection, your collections duplicate your blog index. Let some posts float free — collections should be deliberate subsets, not an alternative sitemap.

**Test the order.** The sidebar, the detail tree, and collection-scoped prev/next all follow array order. Read through the sequence before publishing and swap nodes if the narrative flow feels wrong.

**Add cover images.** A collection without a cover looks blank on the overview grid. Use a representative image — a screenshot, diagram, or custom illustration. The `asset://` protocol makes it easy to point at images from your media library.
