# Chronicle Aurora — v3.0.5

中文 [English](README.md)

Jamstack 博客模板。克隆即用——Markdown + YAML 内容管理、Git 版本控制、一键部署静态站点。本地优先：无数据库、无 API 服务、无运行时。

内容以 YAML + Markdown 存储在文件系统中。[Astro](https://astro.build) 静态生成 → 纯 HTML。`git push` → CI → CDN。

## 模板特色

<p align="center">
  <img src="data/assets/demo-desktop.png" alt="Chronicle Aurora desktop" width="70%">
  <img src="data/assets/demo-mobile.png" alt="Chronicle Aurora mobile" width="20%">
</p>

- **默认纯静态** — 所有页面在构建时预渲染。快速、SEO 友好，低客户端 JS。
- **Markdown + frontmatter** — 用 Markdown 写作，YAML 管理元数据。熟悉的写作体验，清晰的 git diff。
- **深色/浅色主题** — 从 3 个基础 token 派生的颜色系统。支持 UI 切换或跟随系统偏好。
- **国际化开箱即用** — 中英文路由（`/zh/`、`/en/`）。添加翻译文件即可扩展更多语言。
- **合集分组** — 将文章组织为精选指南或系列，内置导航。
- **友链/博客名录** — 展示其他站点，带头像、描述和链接。
- **Marp 幻灯片** — 将任意文章转为演示文稿。Markdown → 幻灯片，支持主题和过渡动画。
- **内置搜索** — 客户端全文搜索全部博客文章。
- **评论系统** — 支持 Staticman、GitHub Issues、Twikoo，或完全关闭。新评论存入待审核目录。
- **RSS 订阅** — 自动生成，始终保持最新。
- **响应式布局** — 在手机、平板和桌面端均可阅读。
- **图片管线** — 将图片放入 `data/` 对应目录，构建时自动压缩为 WebP/AVIF。

## 目录结构

```
data/                        — 你的内容：文章、图片、配置。唯一数据源。
packages/template-astro/     — Astro 前端：渲染层（主题 + 预设 + 功能插件）
packages/gen/                — 构建编排：重建索引 → 渲染 → 原子同步
packages/manager/            — 内容管理（本地优先 CMS）
packages/shared/             — 共享类型与工具
```

## 架构

**定位（详见 [docs/architecture-positioning.md](docs/architecture-positioning.md)）：** `template-astro` 是 PaperMod 式、**内容无关的渲染层**。重功能（评论/搜索/Marp 幻灯片/合集/友链）是通过开放抽象层注册的**可选能力**——默认是轻主题，内容源启用后才长出重功能。`data/` + `gen` + `manager` 是围绕它的官方参考实现。

四层结构：

```
主板（内容框架）   — 数据契约 + 页面骨架 + 渲染循环。只提供预设。
可插拔功能（插件） — collections/friends/search/comments/Marp，经 manifest 注册
主题               — 全部样式（tokens/global/critical/组件样式）归主题，可整体更换
manager            — 模板化 CMS：读"模板清单"适配，不绑死本仓库
```

## 快速开始

```bash
# 1. Fork 仓库，然后克隆到本地
git clone https://github.com/<你的用户名>/chronicle-aurora.git
cd chronicle-aurora

# 2. 安装依赖（npm workspaces——一条命令安装全部包）
npm run init

# 3. 启动开发服务器（仓库根目录执行）
npm run dev:astro       # 博客模板 → http://localhost:4321
npm run dev:cms         # CMS 开发服务器（manager）

# 4. 构建生产版本（SSG → dist/）
npm run build:astro     # 输出 → packages/template-astro/dist/

# 5. 本地预览生产版本
npm run preview:astro

# 6. 停止占用开发端口的进程（5173 CMS / 4321 Astro）
npm run stop
```

## 部署

`packages/template-astro/dist/` 目录即为完整静态站点。部署到任意 CDN 或静态托管服务。

**Git 工作流：**

1. 在 `data/` 中编写内容
2. `git commit && git push`
3. CI 执行 `npx astro build` 并将 `packages/template-astro/dist/` 部署到 CDN
4. 完成。

典型 CI 配置（GitHub Actions、Cloudflare Pages 等）：`npm install && npx astro build --root packages/template-astro`，输出目录 `packages/template-astro/dist`。

## 许可证

MIT
