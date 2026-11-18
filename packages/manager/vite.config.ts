import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import chronicleData from './vite-data.mjs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))
// Single source of truth for the app version: the root package.json.
const rootPkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf-8'))
const VERSION = rootPkg.version || pkg.version
const __dirname = fileURLToPath(new URL('.', import.meta.url))
const sharedPath = resolve(__dirname, '..', 'shared')
const repoRoot = resolve(__dirname, '..', '..')
const isElectron = !!process.env.ELECTRON

export default defineConfig({
  plugins: [
    vue(),
    chronicleData(),
    { name: 'fix-font-paths', transformIndexHtml(html: string) { return isElectron ? html.replace('/fonts/', './fonts/') : html } },
  ],
  resolve: {
    alias: {
      // 统一约定：import 一律 @chronicle/shared/src/...（与 template-astro 一致）
      '@chronicle/shared': resolve(sharedPath),
    },
  },
  base: isElectron ? './' : '/',
  define: { __VERSION__: JSON.stringify(VERSION), __YEAR__: JSON.stringify(new Date().getFullYear()) },
  server: {
    fs: { strict: false, allow: [repoRoot, resolve(__dirname, '..', 'template-astro'), sharedPath] },
    proxy: {
      // Proxy /api/* to a mini Express handler that does CRUD on the filesystem
    },
  },
})
