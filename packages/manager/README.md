# Chronicle Manager

The desktop CMS for [Chronicle Aurora](https://github.com/vanvanhasnophi/chronicle-aurora) — a local-first, git-backed Jamstack blog.

A Vue 3 + Vite SPA that runs in the browser (default) or inside an optional Electron shell.
Reads and writes `data/` directly (no API server) and syncs via git (`git commit` / `git push`).
This repository does not bundle Electron — the supported development flow is the browser, which uses the
`vite-data` plugin as its filesystem backend.

## Develop

```bash
npm install
npm run dev            # browser dev (Vite) — uses the vite-data plugin
npm run electron:dev   # Electron + Vite dev
npm run build          # build the renderer
```

## Notes

- Settings pages are schema-driven — edit a JSON Schema in `packages/template-astro/schemas/` and register it in `SCHEMA_REGISTRY`.
- Content lives in the repository `data/` directory; the editor workspace (theme, window state) lives in `.chronicle/`.
