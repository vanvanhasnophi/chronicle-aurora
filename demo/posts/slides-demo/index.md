---
title: Chronicle Presentation
date: 2026-08-04
updatedAt: 2026-08-17T12:00:00.000Z
tags: slides, demo, featured
author: 
aiGenerated: false
status: published
marp: true
theme: chronicle
accent-color: #e92
tinted-bg: true
---

<!-- paginate: true -->
<!-- _paginate: false -->
<!-- _class: lead -->
# Chronicle Aurora

## Local-first · Git-backed · Jamstack

*This deck is a slides post — everything on screen comes from one Markdown file.*

---

# What You Are Watching

A **slides post** — `data/posts/slides-demo/index.md`:

- Frontmatter `marp: true` (alias `type: slides`) → rendered as a slideshow, not an article
- Body uses Marp syntax — `---` splits slides, `# Heading` is the slide title
- Rendered by the Marp engine on the **Chromium kernel (headless browser)** at build time
- Output: a **fullscreen presentation** — browse mode and present mode

Same file, same git history. Your deck is versioned like any other post.

---

# The Problem

Every blogging platform wants you to **trust their server**.

| Platform | Runs on |
|----------|---------|
| WordPress | Your VPS |
| Ghost | Your VPS |
| Medium | Their cloud |
| Substack | Their cloud |

What if you don't need a server at all?

---

# The Answer: Filesystem

```text
data/                    ← single source of truth
├── site.yml             ← site config (theme, SEO, features)
├── profile.yml          ← author profile
├── friends.yml          ← friends page
├── collections.yml      ← tree structure
├── posts/<id>/index.md  ← your words (YAML + Markdown)
├── comments/<id>.json   ← approved comments
└── avatar/ background/ branding/ assets/
```

**No database. No API. No server.**
Just Markdown, YAML, and Git.

---

# Tree Structure: Collections

`collections.yml` defines the site tree — posts nest in groups, groups nest in groups:

```yaml
- name: Chronicle Guide
  slug: chronicle-guide
  nodes:
    - id: welcome-to-chronicle   # a post
      type: post
    - type: group                # a group
      title: Deep Dives
      children:
        - id: git-deployment
          type: post
```

Rendered automatically: **breadcrumbs + collection navigation**. No runtime traversal.

---

# Git Is the API

```text
commit  = save
push    = deploy
pull    = sync
```

- Manager (Electron CMS) writes files, then commits & pushes via `simple-git`
- CI pre-build scans `posts/` → rebuilds `index.json` → `astro build` → static HTML
- Static files land on any CDN / Pages — nothing to patch, nothing to back up

---

# Writing a Slides Post

- Frontmatter: `marp: true` (or `type: slides`) — plus `theme`, `accent-color`, `tinted-bg`
- Post fields: `title / date / tags / summary / status / font / type / marp / slideshow`
- `slideshow:` nested config (`theme`, `ratio`, `footer`) or flat Marp fields (`theme:`, `size:`, `footer:`)

```markdown
---
marp: true
theme: chronicle
accent-color: #e92
---
# Slide one

Text, code, tables, images — anything Markdown.

---
# Slide two

![alt](image.webp)
```

Edit and preview in the CMS **slides mode**: thumbnail strip, per-slide preview, `F` fullscreen, export **PPTX**.

---

# Marp Directives

Global directives shape the whole deck; prefix with `_` to scope a single slide.

| Directive | Scope | Example |
|-----------|-------|---------|
| `theme` | global | `<!-- theme: chronicle -->` |
| `transition` | global | `<!-- transition: fade -->` |
| `paginate` | global | `<!-- paginate: true -->` |
| `class` | local | `<!-- _class: lead -->` |
| `header` / `footer` | local | `<!-- _footer: "Chronicle 3.1" -->` |
| `backgroundColor` | local | `<!-- _backgroundColor: #fff -->` |

This deck uses them live — see the cover and closing slides.

---

# Code

```ts
// data is read straight from the filesystem — no fetch, no API
import { readFileSync } from 'node:fs'
import { parseSlides } from '@chronicle/shared'

const md = readFileSync('data/posts/slides-demo/index.md', 'utf-8')
const { meta, slides } = parseSlides(md, renderSlide)
console.log(`${meta.slideCount} slides ready`)
```

Fenced code is syntax-highlighted; `bash` blocks copy-paste cleanly.

---

# Speaker Notes

Every slide can carry **presenter notes** — text for you, hidden from the audience:

- Add a marker line `<!-- speaker notes -->` after the slide content
- Everything after it belongs to the notes, up to the next slide
- Notes stay in the same `index.md` — versioned with the deck
- Visible in the CMS preview, never rendered on the published slideshow

Rehearse from the same file you publish.

---

# What You Get

- 📝 Markdown editor with live split-pane preview — plus a dedicated **slides mode**
- 🏷️ Collections — nested groups, breadcrumbs, collection navigation
- 💬 Comments — static JSON or **Waline (headless)**
- 🔍 Search — suggestions, global search, full-text
- 📡 RSS + sitemap auto-generated
- 🌐 i18n — English and Chinese out of the box
- 🎨 Themes — light, dark, follow-system, and a per-deck slides theme

---

# Image Pipeline

```text
photo.jpg
  ├── sharp → photo.webp (80% quality)
  └── sharp → photo.avif (55% quality)

Browser picks the best format:
<picture>
  <source srcset="photo.avif" type="image/avif">
  <source srcset="photo.webp" type="image/webp">
  <img src="photo.jpg" alt="">
</picture>
```

`data/` keeps source quality; compression is a **CI/CD concern**. Zero config.

---

# Slides Skip PrevNext

Slides are fullscreen shows, not articles — they never enter prev/next navigation:

- Current page is a slides post → no prev/next rendered
- A slides post is never a prev/next candidate
- Ordinary articles navigate around decks seamlessly

---

# Start Today

```bash
git clone https://github.com/vanvanhasnophi/chronicle-aurora
cd chronicle-aurora/packages/manager
npm install && npm run dev   # Electron CMS
```

1. Open the CMS — local machine is trusted, no login
2. New Post → create as **Slides**
3. Write Marp markdown, preview in slides mode
4. Sync → commit + push → CI publishes
5. Your blog — and your decks — are live

---

<!-- _paginate: false -->
<!-- _class: lead -->
# Thank You

**Chronicle Aurora**  
*Your words. Your files. Your control.*

[github.com/vanvanhasnophi/chronicle-aurora](https://github.com/vanvanhasnophi/chronicle-aurora)
