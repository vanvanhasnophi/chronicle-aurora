# Chronicle Aurora 项目评估报告

> 评估日期：2026-11-18
> 评估对象：`chronicle-aurora`（代号 aurora，包版本 3.0.12）
> 评估口径：**fork 分发模型**——本项目兼具 demo 与源码双重身份，下游通过 fork 到自己的仓库使用并部署
> 存放位置：`docs/`（该目录被 `.gitignore` 忽略，属本地文档；如需入库见文末「入库建议」）

---

## 0. 一句话结论

**工程实现 A−，分发契约 D。**
项目已经跨过「能不能用」的合格线，卡在「陌生人能不能自助 fork 并长期存活」那条线上。
缺的不是功能，是**可见性与入口**：fork 生命周期所需的脚本全都写好了，但没有一个出现在 README 或 `package.json` 里。

---

## 1. 评估口径说明

同一份代码，用两把尺子量会得到相反结论：

| 尺子 | 结论 | 说明 |
|---|---|---|
| 开源作品集 | 不合格 | 品类（Astro 博客模板）极度拥挤；无测试、无 live demo、文档不入库，无法自证 |
| **fork 分发模板** | **接近合格** | 工程结构、生命周期脚本、插件架构都是围绕「下游仓库」长的，方向正确；差在分发契约 |

本文采用第二把尺子。**理由：fork 模式下评价对象是「下游仓库能否自己活下去」，而不是「外人是否欣赏」。**

fork 模型下，采用度本身就是最好的作品集（fork 数 / 下游站点 / issue），但前提是下游能自助。所以评估按下游用户的真实旅程拆分为四段。

---

## 2. 项目画像（事实）

| 指标 | 数值 |
|---|---|
| 提交数 | 336（2026-08-07 → 2026-11-18） |
| 版本 | v3.0.1 – v3.0.12（13 个 tag），HEAD = `f0fcc8f chore(release): 3.0.12` |
| 贡献者 | 1 人（`EightyFor`），bus factor = 1 |
| 代码量 | 约 8.5 万行（manager 45,547 / template-astro 34,410 / shared 2,983 / gen 1,424） |
| 结构 | npm workspaces monorepo：`template-astro`（Astro SSG）+ `gen`（构建编排）+ `manager`（Electron/Vue CMS）+ `shared` |
| 内容 | 9 篇 demo 文章（同时充当用户手册） |
| 提交类型 | fix 92 / feat 72 / refactor 61 / chore 20 / 其他 63 |
| 债务标记 | TODO/FIXME 约 25 处；`any`/`@ts-ignore` 类逃逸约 365 处（粗略统计） |
| 许可证 | MIT |

---

## 3. 下游旅程评分

| 阶段 | 评分 | 依据 |
|---|---|---|
| **发现** | B− | README 双语 + 截图 + 架构分层描述，质量不低；但无 live demo 链接，无「谁在用」证据 |
| **起步** | C+ | `init-clean.mjs` / `reset-site.mjs` / `reset-cms.mjs` / `reset-data.mjs` / `migrate-legacy.mjs` 全在，CMS 内还有 `SystemReset.vue` 按钮；但 README 全程只出现「Fork」，**没有任何一条命令**，`package.json` 也无对应 entry |
| **使用** | B | manager 4.5 万行是真资产，配置面很宽；但手册（demo 文章）会被自己清理掉，`docs/` 与下游无关 |
| **升级** | D | `update-app.sh` 机制完整（备份 → `-X theirs` 合并 → 恢复 → amend），但 README 零提及；无 CHANGELOG；定制范围未声明 |

---

## 4. 工程记分卡

| 维度 | 评级 | 依据 |
|---|---|---|
| 规模与复杂度 | A | 8.5 万行、4 包 monorepo、Electron CMS + SSG + 构建编排 |
| 架构 | B+ | 插件化 + manifest 注册 + `verify:isolation` 构建断言（启用/禁用双向验证，思路优于多数模板）；但 `gen` 的 copy-to-target、增量构建仍为 TODO，core 残留 4 处 `@deprecated` |
| 自动化质量门禁 | F | **零测试**（全仓无 `*.test.*` / `*.spec.*`）；CI 仅 `deploy.yml`，只 build + 部署；无 lint / typecheck |
| 版本与口径一致性 | D | README 标题 v3.0.7 vs 包版本 3.0.12；示例文档把已发布内容称「3.1.x」；4 个 `package.json` 手工同步版本号；无 CHANGELOG |
| 对外可见性 | D | `docs/` 被 gitignore；README 指向不存在的 `docs/architecture-positioning.md`；无 live demo |
| 维护活跃度 | A | 3.5 个月 336 次提交，持续到今天 |
| 代码卫生 | C | 约 365 处类型逃逸，25 处 TODO |

---

## 5. 关键发现

### F1（高）生命周期脚本「存在但不可见」

**现象**：fork 起步所需的全部脚本齐备，且 `init-clean.mjs` 的执行顺序设计正确（reset-site → reset-cms → reset-data）。

**证据**：
- `scripts/init-clean.mjs` 存在且逻辑完整
- `package.json` 的 scripts 中无 `init:clean` / `reset:*` / `update` / `migrate`（只有 `init`、`dev:*`、`build:astro`、`verify:isolation*`、`ai:summaries`、`preview:astro`、`stop`）
- README / README.zh.md 中「Fork」仅出现在 Quick Start 第 1 步，其余生命周期命令零提及
- `packages/manager/src/pages/settings/SystemReset.vue` + `useGlobalReset.ts` 已提供 UI 版重置

**影响**：下游维护者必须翻阅 `scripts/` 才能发现该跑什么、按什么顺序跑。这是「缺入口」而非「缺功能」。

**修法**：`package.json` 接线 + README 增补两节（见待办 T1/T2）。

---

### F2（高）手册在 fork 之后不存在

**现象**：`docs/` 被 `.gitignore` 明确忽略（`# Local dev docs (not committed)`），27 份设计文档已于 2026-08-07 的 `31f3279` 一次性删除（据 `docs/versions.md` §4）。而 `data/posts/` 下的 9 篇 `*-config` / `getting-started` 文章是事实上的用户手册。

**冲突点**：`reset-data.mjs` 会删除 `data/posts/` 下全部内容。也就是说：**「示例站即文档」这个聪明设计，被自己的清理脚本毁掉。**

**影响**：fork 的下游复制的是**仓库**而非网站。未入库的 `docs/` 在下游等于不存在；执行干净初始化后，手册文章也没了。下游得到的是一个「空的、无说明书的」博客框架。

**修法**：把 9 篇指南文章迁到 `starter/`（reset 不触碰）或独立 docs 站；或让 `reset-data` 保留 `data/posts/_guide/`。

---

### F3（高）个人状态混入模板基线

**现象**：`.chronicle/state.json` 与 `.chronicle/workspace.json` 均被 git 跟踪。`workspace.json` 内含作者个人偏好：

```
"backendAccent":"#2ea35f",
"backendBackgroundMeta":{"url":"asset://meow.jpg", ...},
"previewAutoOpen":true, "previewPort":4321
```

而 `reset-data.mjs` 会清空 `data/assets/*`（含 `meow.jpg`）。

**影响**：新 fork 执行干净初始化后，背景立即指向已被删除的文件，首屏即坏。`state.json` 同理（窗口尺寸、`lastOpenedPost`）。

**修法**：`.chronicle/*` 移除跟踪，改为 `*.example` + 首次启动生成默认值；个人背景不入库。

---

### F4（中）升级策略是「上游覆盖」，但未声明

**现象**：`update-app.sh` 使用 `git merge -X theirs`，仅保护 `data/` 与 `.chronicle/`（脚本头部注释与 `PROTECTED_DIRS` 均如此）。

**影响**：下游任何代码层改动（主题、插件、组件）在上游碰同一文件时会被静默覆盖。以本项目的插件架构而言，下游改主题几乎必然发生，第一个冲突者会被咬。

**修法**：显式声明「可定制面 = `data/` + `themes/`；其余代码随上游更新」。若确实需要下游改码，则需改为受保护目录 + 三方合并。

---

### F5（中）CI 无质量门禁，在分发模型下是信任问题

**现象**：`.github/workflows/deploy.yml` 只做 build + GitHub Pages 部署，无测试、无 lint、无 typecheck。唯一的架构不变量检查 `verify:isolation` 是手动脚本，需人工判定 PASS。

**影响**：自用项目中这是「不够严谨」；分发模型中，它是「上游一次坏提交会直接部署到所有下游站点」。此处测试不是自证，是对下游的契约。

**修法**：CI 增加 `verify:isolation` + `tsc --noEmit` + 至少一组针对 `gen` indexer 与插件注册表的单测。

---

### F6（低）版本口径分裂

**现象**（已由 `docs/versions.md` §5 记录）：
- README 标题写 v3.0.7，包版本 3.0.12
- 示例文章仍称当前为「3.1.x」（`data/posts/welcome-to-chronicle/index.md` 等 7 处）
- 4 个 `package.json` 手工同步版本号
- README:41 指向不存在的 `docs/architecture-positioning.md`（悬空链接）
- Quick Start 存在重复的「5.」编号（README.md:70-76）

**影响**：下游无法判断「我该跟哪个版本」。

**修法**：一次决策（承认 3.1.x 为内部里程碑，或提升到 3.1.0）+ 版本号单一来源 + 修链接。

---

## 6. 重新评分与合格判定

| 层面 | 结论 |
|---|---|
| 工程实现 | **A−**：插件化、隔离断言、CMS、迁移脚本，比多数同类模板扎实 |
| 分发契约 | **D**：能力齐备，可见性接近零 |

**判定：**
- 作为「作者自用的可部署站点」→ 合格
- 作为「能 fork 的基础模板」→ 已跑通
- 作为「陌生人能自助 fork 的模板」→ **不合格**，卡在 F1–F3 三条
- 作为「开源作品集」→ 不合格，但这是选错尺子；模板的采用度（fork / 下游 / issue）才是其作品集形态

---

## 7. 待办清单

按投入产出排序。全部完成约需 2–3 个工作日。

- [x] **T1** `package.json` 接线 `init:clean` / `update` / `reset:site` / `reset:cms` / `reset:data` / `migrate`（30 分钟）
- [x] **T2** README + README.zh.md 增补两节：「Make it yours」（fork 后怎么做成自己的站）、「Update from upstream」（怎么安全拉取上游）——把 T1 的命令写进去（2 小时）
- [ ] **T3** `.chronicle/*` 停止跟踪，改 `*.example` + 首次启动生成；移除 `meow.jpg` 依赖（1 小时）
- [ ] **T4** 9 篇指南文章迁到 `starter/` 或文档站，使 `reset-data` 只清真实内容（半天）
- [ ] **T5** CI 增加 `verify:isolation` + `tsc --noEmit` 门禁，保护下游（半天）
- [ ] **T6** 声明「可定制面」与升级语义；建 `CHANGELOG.md`（可复用 `docs/v3-features.md` 作 3.0 章节）（半天）
- [x] **T7** README 顶部补 live demo 链接（10 分钟）
- [ ] **T8** 决策 3.1.x 口径，收敛版本号到单一来源，修 README 悬空链接与重复编号（半天）

**最小可交付**：T1 + T2 + T7（合计不到 3 小时），即可把「起步」从 C+ 拉到 A。

> **2026-11-18 执行记录（T1 + T2 + T7）**
> - `package.json` 接线 6 条命令；`npm run init:clean -- --dry-run` 走通三步；`reset:site` / `reset:cms` / `reset:data` 的 `--dry-run` 与真实写入均验证过（真实写入后 `git checkout -- data` 还原）。
> - README / README.zh.md 各增「Make it yours / 做成你自己的站」与「Update from upstream / 从上游更新」两节，顶部补 live demo（`https://chr.eightyfor.top`，即 README 里那次 301 指向的站点）。
> - **执行中发现两处「接线即暴露」的存量缺陷**（F1 的「逻辑完整」判断不成立）：
>   1. `scripts/reset-site.mjs` 仍引用已随 schema 拆分删除的 `template-settings.schema.json`，friends/collections 的 schema 路径也已失效 → `init:clean` 第一步直接 ENOENT。已按 `packages/manager/src/data/schemaRegistry.ts` 改为 homepage + appearance + post-page（`post` 子树）+ 插件 schema，并跳过 `x-site-flag` 字段（其值存 site.yml，不该写进 profile/friends 文件）。
>   2. `scripts/update-app.sh` / `stop.sh` 在工作区是 CRLF，bash 报 `$'\r'` 语法错（`bash -n` 失败）→ 已转 LF，并新增 `.gitattributes`（`*.sh text eol=lf`）防止下游 Windows 检出再犯。
> - `migrate-legacy.mjs` 里 `execSync('cp -r …')` 在 Windows 的 cmd 下必然失败，已改为 `fs.cpSync`；该脚本仍输出旧版扁平 `site.yml` 键，与本版结构化 schema 不一致，属 T4/T6 之后的遗留（未在 T1 范围内修）。

> **2026-11-18 批次 1（N1 + N3 + N5 准备）与已定路线**
> - 已定路线：开 Template repository、README 主路径改「Use this template」；`update` 只认 `upstream`（origin 启发式删除）；`SITE_URL` 环境变量化；`.chronicle/` 全量移出版本库 + 默认值下沉；SEO 只做 canonical / og:url / og:image；手册走 `starter/` + `guide:restore`；本轮不发版，改动先合入。
> - N1：`astro.config.mjs` 读 `SITE_URL`（无效 URL 直接抛错，带路径时告警）；`deploy.yml` 把 `Setup Pages` 提前并新增 Resolve site URL —— 解析顺序为「仓库变量 → Pages 设置里的 `origin`（自定义域名/根仓库都已覆盖）→ 仓库名兜底 → 失败并提示」，项目页（`base_path` 非空）报错；另有 Verify production URLs，`localhost` 泄漏即红灯。**因此自定义域名场景无需手动配任何变量**。
> - N3：README 双语部署章节重写为「唯一构建路径 + `dist/` 是产物 + `packages/template-astro/dist` 只是中间目录」；新增 `scripts/serve-dist.mjs` 与 `npm run preview`（服务根 `dist`，零依赖）；修掉快速开始里重复的「5.」。
> - 实测：`SITE_URL=https://chr.eightyfor.top npm run build:astro` 后 `rss.xml` / `sitemap.xml` / `robots.txt` 全部为该域名、0 处 `localhost`；三分支逻辑用从 workflow 提取出的脚本在 WSL 下逐支验证（变量 / 推导写入 GITHUB_ENV / 报错退出）。
> - 遗留：GitHub Pages 项目页（`<user>.github.io/<repo>/`）仍不支持——模板内部链接不带 base 前缀，故不做「推导出子路径」这种看似成功实则全 404 的降级；需要 base 全量化（批次 3）。
> **2026-11-18 批次 1.5（模板清洁化：默认分支拿下来就是空站）**
> - 需求：`Use this template` 得到的仓库必须开箱干净——`data/` 只有 schema 默认值、没有文章，`.chronicle/` 不入库，演示内容不随拷贝走。
> - 结构：演示内容迁到**只含内容的 `demo` 分支**（`demo/**` + README，36 个文件，孤儿提交）；`main` 的 `data/` 重置为 schema 默认（`posts/index.json = {}`）。演示站构建 = `main` 的代码 + `demo` 分支的内容（`git fetch origin demo` → `git checkout … -- demo` → `--dataDir demo`），因此代码只有一份、不可能漂移。
> - `.chronicle/` 停止跟踪（根 `.gitignore` 增加 `.chronicle/`），并把 `ensureChronicleDir` 的手写默认值改为**从 `system-settings.schema.json` 生成**——原手写表已漂移（accent `#2ea336` vs schema `#2ea35f`，且残留 `frontendCodeDir`/`buildGranularity`/`scheduled*` 等已废弃键，缺 `previewPort`/`gitCommitTemplate`）。
> - 新增 `scripts/fetch-demo.mjs` / `scripts/demo-dev.mjs` 与 `demo:fetch` / `dev:demo` / `build:demo` / `preview:demo`；README 截图移到 `.github/assets/`（否则清空 `data/` 后首屏图 404）。
> - `deploy.yml` 新增 `Resolve content directory`：有 `demo` 分支则用它并断言该分支只含 `demo/**` 与 `README.md`；本仓库（上游）缺 `demo` 分支时**拒绝部署**（避免把空站发到演示域名）；无该分支的下游仓库直接构建自己的 `data/`。另加 nightly（03:00）与「demo 构建产物不得为空」断言。
> - 等价校验：`demo` 分支构建 289 个文件与改动前的线上产物**逐个文件一致**，`rss.xml` / `sitemap.xml` 的 SHA-256 相同；干净 `data/` 构建 20 个 HTML、0 条 RSS、12 条 sitemap，空态页面正常。
> - 操作顺序：**先 `git push origin demo`，再推 `main`**，否则上游守卫会让部署失败（这是有意的）。
> - **推 `demo` 立即部署**：`demo` 分支上放了一个极短的 caller workflow（`deploy-demo.yml`），通过 `uses: …/deploy.yml@main` 调用 `main` 上的 reusable workflow；被调用的 workflow 在 `github.ref_name === 'demo'` 时显式 `checkout main`，因此代码仍只有一份。nightly 保留为兜底；`Resolve content directory` 的白名单相应放行 `.github/workflows/deploy-demo.yml`。**该链路只能在 GitHub Actions 上验证**，首次 push 后需看一次日志。
> **2026-11-18 批次 2（T5 / N2 / T6 / T8 + 清理）**
> - T5：新增 `npm run typecheck`（workspaces）与 `npm test`（`node:test`，6 例覆盖 indexer 的 frontmatter、保留目录、合集、空索引）；`.github/workflows/ci.yml` 在 PR 与 main 上跑 typecheck + 单测 + 模板构建 + 两条 isolation（有 demo 分支时才跑）；isolation 脚本改为消费 demo fixtures，fixtures 缺失直接报错退出（此前在空 `data/` 上等于恒真）。
> - N2：Layout 总是输出 `rel=canonical` 与 `og:url`（基于 `SITE_URL` 的 origin）；`og:image` 来自文章 frontmatter 的 `image:`（绝对地址或 `/` 开头），并把 `twitter:card` 升级为 `summary_large_image`；indexer / localFs / PostMeta 增加 `image` 字段，README 记录用法。
> - T6a：新增根 `CHANGELOG.md`（Unreleased + 3.0.x 摘要）；README 双语新增归属表，明确 `data/`、`.chronicle/`、`packages/`、主题各自的归属。
> - T6b：根 `package.json` 持有 `version`，`astro.config` / `vite.config` 从根读取；`npm run release -- x.y.z` 同步 5 个 package.json + package-lock 的版本字段 + 追加 CHANGELOG 章节，可选 `--tag`。
> - T8：README 标题去掉写死的 `v3.0.7`；删除指向不存在文档的链接；demo 内容里的「3.1.x」统一为「3.x」。
> - 清理：移除 `preview:astro`；删除 gen 的无人引用 `.ts` 平行实现（`index.ts` / `astro.ts` / `indexer.ts` / `tsconfig.json`），并移除其 `main` / `typecheck`；README 结构图补 `.github/assets`、`demo/`、`.chronicle/`。
> - 验证：typecheck 0 error；单测 6/6；`build:astro` 20 页、`build:demo` 38 页；canonical / og:url / og:image 在 demo 构建中实测；`release` 3.0.13→3.0.12 往返后 `npm ci --dry-run` 仍通过，构建页脚版本随根版本变化。
> **2026-11-18 批次 3（B 组）**
> - B3 `fetch-demo`：默认检测 `demo/` 与分支差异并拒绝覆盖（`--force` 覆盖、`--dry-run` 只比对）；用 `git hash-object --stdin-paths` 比较（尊重 autocrlf），并忽略构建生成的 `demo/posts/index.json`。实测：本地改一行 → 拒绝 + 退出 1；`--force` → 覆盖；构建后仍判定一致。
> - B4 UI 重置：`useGlobalReset` 的 `stripVirtual` 增加 `x-site-flag` 跳过，与 `scripts/reset-site.mjs` 对齐（`vue-tsc` 通过）。
> - B5 `migrate-legacy`：配置迁移改为「以现有 `data/*.yml` 为 Document 基底 + 旧扁平键映射」——homepage / appearance / analytics / comments / friends / collections / search + 顶层 `aboutPage`；collections 写回 `{collections, post.collectionNav}`。用合成 legacy 归档实测：迁移后可直接构建（标题 “Old Post - Legacy Blog”、1 条 RSS、about 页存在），随后 `git checkout -- data` 还原。
> - B7 `data/branding` 从 `.gitignore` 移除：它是内容（构建时复制到 `dist/branding`，`reset:data` 删除它是正确行为）。
> - B1 base 路径：新增 `src/utils/basePath.ts`（`withBase` / `stripBase`）；`astro.config` 读 `BASE_PATH` 并规范化；路由助手、Layout 的 `routePrefix` 与 `data-base`、搜索索引 URL、合集/相关/上下篇/分享链接、markdown 链接与 `asset://`/`post://` 协议、ThemeInit 字体、根重定向页、sitemap/rss/robots 全部走 base；CI 从 Pages 的 `base_path` 推导 `BASE_PATH`（项目页由「报错」改为「支持」）。
> - 验证：`BASE_PATH=/chronicle-aurora` 构建 demo，HTML 绝对链接 **0 违规**、JS 包内 **0 处**未加前缀；默认构建（无 BASE_PATH）20 页、canonical 无 base、无泄漏。
> - 未做：B8（365 处类型逃逸、模板层 checker）。
> - 维护流程：新增 `npm run demo:commit`
> - 加固：`scripts/check-base-links.mjs`（`npm run check:base`）在 CI 里用 `/ci-base/` 构建一份产物并断言所有站内绝对链接带前缀；Deploy 里当 `BASE_PATH` 非空时同样断言。实测：真实 base 构建 PASS、人为注入两个未加前缀链接会被抓出（exit 1）、根路径自动跳过、`/x` 与 `/x/` 两种写法等价。（临时 index 读写 demo 分支，`--push` 可选）——在 main 检出里改 `demo/` 后直接提交到 `demo` 分支，不污染 main 暂存区；README 双语与 demo 分支 README 均写入该流程。

### 验收标准

- 陌生人 `fork → clone → npm run init → npm run init:clean → npm run dev:astro`，全程无需读源码
- 新 fork 首屏无坏图、无个人配置残留
- 上游发版后，`npm run update` 能在保留 `data/` 的前提下升级，且有 CHANGELOG 说明改了什么
- CI 在 PR/push 上跑通 build + isolation 断言，红灯即阻断部署

---

## 8. 未验证项

- GitHub 仓库公开状态、star/fork 数、是否有 live 站点：本环境无法联网，未核实（remote 为 `github.com/vanvanhasnophi/chronicle-aurora`）
- 构建可复现性：未执行 `npm run build:astro`（依赖安装与耗时不支持），仅确认 `dist/` 最后生成于 2026-11-16
- 浏览器兼容性、性能指标（历史基线为文章页 FCP 1.3s / LCP 1.4s / Perf 96，见 `docs/versions.md` §4.4，未复测）

---

## 9. 入库建议

本文件位于 `docs/`，该目录当前被 `.gitignore` 忽略。若要让它进入仓库（推荐，因为 F2 的核心论点就是「不入库 = 下游不可见」），可在 `.gitignore` 增加例外：

```gitignore
# Local dev docs (not committed)
docs/*
!docs/aurora-assessment-2026-11-18.md
```

---

## 10. 给下一个会话的接手说明

新会话在工作目录 `chronicle-aurora` 下打开时，可直接以本文件为基线：

1. 读本文件第 7 节的待办清单，确认当前进度
2. 优先执行 T1 + T2 + T7（最小可交付，< 3 小时）
3. 参照第 5 节各条目的「证据」字段定位代码，勿凭印象改动
4. 如需扩展评估，第 8 节列出了尚未验证的盲区
