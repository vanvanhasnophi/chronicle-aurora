---
title: Friends Management
date: 2026-08-07T07:41:27.554Z
updatedAt: 2026-08-17T12:00:00.000Z
tags: friends, guide
author: Eightyfor
aiGenerated: true
status: published
font: sans
---

`data/friends.yml` builds the `/friends` page — a blogroll of external links to people, projects, or communities you want to share with your readers. It's a single YAML file with a global card style and a sortable list of friend cards.

## What the friends page is for

A friends page serves several purposes:

- **Reciprocal links** — link to blogs and sites you read, and many will link back. This builds a web of trust across personal sites.
- **Project showcases** — highlight tools, libraries, or communities you're part of.
- **Reader discovery** — give your audience a curated path to content outside your own archive.

## Enabling the page

Friends is a **plugin**. The `/friends` route is gated by the plugin's `enabled` switch in the `friends` section of `data/site.yml`:

```yaml
friends:
  enabled: true
```

When set to `false` (or when the plugin is removed), the route is not generated at build time — `/friends` returns a 404 and no navigation link appears. The data file can still exist; it just isn't rendered. The toggle lives in the CMS's **Plugins** page.

## Structure of `friends.yml`

The file has two keys:

| Field | Description | Datatype | Sample |
| --- | --- | --- | --- |
| `globalStyle` | Card layout preset applied to all cards as a global override. Controls avatar placement, sizing, and grid columns. | `"left-sm"` \| `"left-lg"` \| `"top-lg"` | `left-lg` |
| `cards` | Sortable list of friend cards. Order in the array is the order rendered. | array of objects | — |

### `globalStyle`

A single preset string that forces every card into the same layout. Three styles are available, each with a distinct visual weight:

| Style | Grid | Card size | Media size | Best for |
| --- | --- | --- | --- | --- |
| `left-sm` | 3 columns | 300×150px | 120×120px | Dense directories — many friends, compact layout |
| `left-lg` | 2 columns | 500×250px | 200×200px | Balanced showcase — works for most sites |
| `top-lg` | 2 columns | 500×600px | 360px (full-width) | Feature-style display — fewer cards, more visual impact |

All styles are responsive. On screens narrower than 760px, the grid collapses to a single column and cards stack vertically. On screens between 760–980px, `left-sm` uses 2 columns; on screens narrower than 1040px, `left-lg` and `top-lg` drop to a single column.

![Three card styles side by side](image.jpg "left-sm, left-lg, and top-lg card styles compared" =70%x)

### `cards`

Each entry in the `cards` array:

| Field | Description | Datatype | Sample |
| --- | --- | --- | --- |
| `name` | Display name for the card title. Keep it short — it sits next to the avatar. Required. Max 60 characters. | string | `Astro` |
| `avatar` | Image displayed as the card's visual anchor. An external URL (`https://...`) or an `asset://` local resource. Square aspect ratio recommended. | string | `https://astro.build/favicon.svg` |
| `intro` | One-sentence description. Max 200 characters. | string | `The web framework behind Chronicle's static site generation.` |
| `homeUrl` | Destination URL. Clicking the card opens this in a new tab. Must start with `https://` or `http://`. Required. | string | `https://astro.build` |

#### `name`

The display title rendered in the card. Use the person's name, project name, or site title. Keep it short — it shares space with the avatar and intro text. Long names get clipped with an ellipsis via CSS overflow.

#### `avatar`

An image displayed in the card's media area. Both external URLs (`https://...`) and `asset://` protocol URLs referencing local resources are supported. The image loads lazily (`loading="lazy"`). If the image fails to load (broken URL, missing asset, network error), a striped placeholder pattern is shown instead. Favicons, project logos, and square profile photos all work well. The exact rendered size depends on the card style (see table above). All images use `object-fit: cover`.

#### `intro`

A one-sentence description that answers "why should I click." Describe what the site or person is about, not biographical details. "Weekly deep-dives on database internals" beats "John's blog."

#### `homeUrl`

The link destination. Clicking anywhere on the card opens this URL in a new browser tab via `window.open(href, '_blank')`. Must include the protocol — the schema validates with the pattern `^https?://.*`. Broken or unreachable URLs are not detected at build time; test your links periodically.

## Editing in the CMS

You don't need to hand-edit YAML. Open **设置 → 友链** (Settings → Friends) in the Manager. It's a schema-driven settings page (`SchemaSettingsPage` with schema id `chronicle:friends`) bound to `data/friends.yml`:

- `globalStyle` — a card-style selector with live previews of the three layouts.
- `cards` — a sortable card-list editor: each row edits `name`, `avatar`, `intro`, and `homeUrl`. Drag rows to reorder; the order you see is the order rendered. The avatar field is an image picker that accepts either an external URL or an `asset://` local resource.

## Example

```yaml
globalStyle: left-lg
cards:
  - name: Astro
    avatar: https://astro.build/favicon.svg
    intro: The web framework behind Chronicle's static site generation.
    homeUrl: https://astro.build

  - name: Mermaid
    avatar: https://mermaid.js.org/favicon.ico
    intro: JavaScript diagramming library — flowcharts and sequence diagrams in Markdown.
    homeUrl: https://mermaid.js.org

  - name: KaTeX
    avatar: https://katex.org/favicon.ico
    intro: The fastest math typesetting library for the web. Renders LaTeX in posts.
    homeUrl: https://katex.org
```

## Ordering and maintenance

Cards render in the YAML array order — no sort, no shuffle. You control the sequence. Put your closest connections or most relevant links first. Reorder by moving entries in the array, or drag rows in the CMS card-list editor.

There's no hard limit on card count, but beyond 20–30 entries, the page loses its curated feel. A short, well-maintained list is more valuable than an exhaustive directory. Review periodically and prune dead links.
