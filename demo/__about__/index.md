## About Chronicle

Chronicle is a **local-first, git-backed Jamstack blogging platform**. It's built on the belief that your content should live on your terms — as plain files, in your control, forever.

### Philosophy

Most blogging platforms ask you to trade convenience for ownership:

- SaaS platforms own your data and can disappear overnight
- Traditional CMSes need servers, databases, and constant maintenance
- Static site generators give you control but lack a writing experience

Chronicle takes a different path. **Your content is a Git repository.** The CMS is an app that edits files directly on your disk. No API, no database, no lock-in.

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Editor | Electron + Vue 3 + CodeMirror |
| Build | Astro SSG |
| Images | Sharp → WebP + AVIF |
| Markdown | markdown-it + KaTeX + Mermaid |
| Deploy | GitHub Actions → Pages |

### Open Source

Chronicle is MIT licensed and developed in the open.

[View on GitHub →](https://github.com/vanvanhasnophi/chronicle-aurora)
