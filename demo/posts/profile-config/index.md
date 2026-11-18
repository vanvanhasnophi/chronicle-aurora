---
title: Profile Configuration
date: 2026-08-07T07:40:03.556Z
updatedAt: 2026-08-17T12:00:00.000Z
tags: guide, profile
author: Eightyfor
aiGenerated: true
status: published
font: sans
---

`data/profile.yml` defines who owns the site and how you appear to readers. It drives the profile card on the About page and in the sidebar, supplies the site author name that the `$site$` placeholder expands to, and decides when an author card appears at the end of an article. It's a small file — a name, a bio, an optional location, and a few links — but it's what makes a site feel lived-in rather than generic.

## How the profile is used

Your profile feeds three places:

1. **About page profile card** — avatar, name, bio, location, and links rendered above the About page's Markdown body. Controlled by `showProfileCard`.
2. **Sidebar author card** — the same profile data rendered as a compact sidebar card. Gated by the same `showProfileCard` flag.
3. **Article author identity** — `name` is the site author. In post frontmatter, the placeholder `$site$` means "the site owner" and expands to `profile.name`; it also decides whether the end-of-article author card shows.

The About page and the profile are two separate concerns: the profile card is driven by `data/profile.yml`, while the About page body is Markdown written in `data/__about__/index.md` and rendered through the same pipeline as blog posts.

## About page

The About page has three moving parts: the page toggle, the Markdown body, and the profile card.

### `aboutPage` — enabling the page

Whether the `/about` route exists at all is controlled by the top-level `aboutPage` switch in `data/site.yml`:

```yaml
# data/site.yml
aboutPage: true
```

The About & Profile settings panel in the CMS shows this toggle as if it belonged to the profile form — it is defined in the profile schema with an `x-site-flag` marker, which mirrors its value into the top-level `aboutPage` key of `site.yml`. Flip it in the CMS and the file that changes is `site.yml`; when the page is disabled, the About page and its profile card are not rendered.

### Page body — `data/__about__/index.md`

The body of the About page is a normal Markdown file: `data/__about__/index.md`. It goes through the same pipeline as blog posts — headings, images, code blocks, and inline HTML all work. There is no YAML field that stores this content; the file on disk IS the content.

### `showProfileCard` — the card above the body

When `true`, the profile card (avatar + name + bio + location + links) is rendered at the top of the About page, above the Markdown body. Set to `false` to show only the Markdown content. This flag lives in `data/profile.yml` and also gates the sidebar author card.

![About page with profile card shown](image.png "About page with profile card and Markdown body" =70%x)

## Profile fields

| Field | Description | Type | Sample |
| --- | --- | --- | --- |
| `name` | The site author's display name. Required; max 60 chars. | string | `Eightyfor` |
| `bio` | Short tagline under the name. Max 300 chars. | string | `Full-stack developer writing about Rust and compilers.` |
| `location` | Free-text location with a pin icon. Max 100 chars; hidden behind the advanced toggle in the CMS. | string | `Beijing, China` |
| `links` | Social links as `{label, url}` entries, rendered in order. | array | see below |

### `name`

Your display name and the site author identity. It is the value `$site$` expands to, and it is what makes you "the site owner" for author-card purposes. A real name, a handle, or a pen name all work. If it is empty and a post declares no author either, the UI falls back to a localized "Anonymous" label.

### `bio`

One or two sentences rendered under your name on the profile card. Think tagline, not résumé: "Full-stack developer writing about Rust and compilers" reads better than a paragraph.

### `location`

Free-form text displayed with a small pin icon. A city, a country, "The Internet", or nothing at all — it's a conversation starter, not geo-tracking. No maps, no coordinates, just text.

### `links`

An array of `{label, url}` objects rendered as pill-shaped buttons on the profile card, in array order. Labels are plain text (max 30 chars); URLs must be full URIs including the protocol (`https://`).

```yaml
links:
  - label: GitHub
    url: https://github.com/your-handle
  - label: Mastodon
    url: https://mastodon.social/@your-handle
  - label: Homepage
    url: https://yoursite.com
```

## Avatar — auto-discovery from `data/avatar/`

There is no avatar URL stored in YAML. The avatar is auto-discovered: the first image in `data/avatar/` IS the avatar. Drop an image file into the directory and it just works — no config field to point at it, the directory is the data source.

The profile schema still declares an `avatar` field with an image-picker widget so the CMS settings form can offer a picker UI. It is marked `x-persist: false`, so saving the form never writes an avatar value into `data/profile.yml` — instead the CMS copies the picked image into `data/avatar/`, and the file on disk becomes the data. Replace the file to change your avatar; if the directory is empty, no avatar renders and the card layout adjusts.

## Author identity — `$site$` and the end-of-article author card

Post frontmatter takes an `author` field, single value or comma-separated (`author: Alice, Bob`, same convention as `tags`). The special placeholder `$site$` means "the site owner":

```yaml
author: $site$
```

At read time, `$site$` expands to `profile.name`, and the author list is then deduplicated case-insensitively while preserving order. So `author: $site$, Eightyfor` with a profile name of `Eightyfor` collapses to a single author, `Eightyfor`.

The end-of-article author card follows one rule:

- The card shows **only when the post has exactly one author and that author is the site owner** — written as `$site$` or matching `profile.name`.
- Multi-author posts never show the card.
- A post with no author falls back to the localized "Anonymous" label and shows no card.

So for guest posts, list the guest's name in `author`: the profile still links back to you as the site owner, but no author card is attached to the article.

## Practical advice

Fill out the profile before publishing — a site with no author identity feels abandoned. You don't need every social link; a GitHub profile and one other platform is enough to signal that you're real and reachable.

Configure once, render everywhere: the About page card, the sidebar card, and the end-of-article author card all pull from the same `profile.yml` data, just in different layouts.
