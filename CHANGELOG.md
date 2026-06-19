# 变更记录

本文件用于说明项目当前文件、常用 Git 命令，以及每次重要变更的摘要。

## 当前文件说明

- `src/`：React 前端源码，当前是朴素后台首页骨架。
- `worker/`：Cloudflare Worker API 入口。
- `drizzle/schema.ts`：Drizzle 数据库 schema。
- `migrations/0000_initial.sql`：SQLite / D1 首版数据库迁移草案。
- `docs/新项目需求梳理.md`：新项目目标、角色、MVP、功能和边界。
- `docs/02-数据模型设计.md`：业务实体和关系。
- `docs/03-页面流程草图.md`：主播端、管理端、游客端页面流程。
- `docs/04-MVP版本切分.md`：MVP 必须做、可以做、暂不做和验收标准。
- `docs/05-技术方案评估.md`：Cloudflare、本地和 Docker 方案评估。
- `docs/06-数据库草案.md`：表结构、索引、关键查询和数据完整性建议。
- `docs/07-项目创建方案.md`：技术栈、目录结构、模块边界和首批任务。
- `docs/项目状态.md`：当前模块状态、已验证项和未验证项。
- `docs/项目功能执行计划清单.md`：P0/P1/P2/P3 功能执行计划。
- `docs/问题汇总与解决.md`：依赖、代理、构建、部署等问题记录。
- `docs/风险清单.md`：票务、公开、截图、部署等风险。
- `docs/决策记录.md`：关键技术和产品决策。
- `AGENTS.md`：Codex 在本项目中的工作规则。
- `README.md`：项目说明和启动方式。
- `CHANGELOG.md`：当前文件说明、常用 Git 命令和变更记录。

## 常用 Git 命令

### 初始化 Git 仓库

```powershell
git init
```

用途：让当前项目开始使用 Git 管理版本。

### 查看当前文件状态

```powershell
git status --short --branch
```

用途：查看哪些文件新增、修改或还没有提交。

### 查看具体修改内容

```powershell
git diff
```

用途：在提交前检查具体改了什么。

### 把文件加入本次提交

```powershell
git add .
```

用途：把当前文件夹里的改动加入待提交列表。

### 只加入某个文件

```powershell
git add CHANGELOG.md
```

用途：只把指定文件加入待提交列表。

### 提交一个版本

```powershell
git commit -m "本次变更摘要"
```

用途：保存一个可以回看的版本点。引号里的内容要简短说明这次改了什么。

### 查看提交历史

```powershell
git log --oneline
```

用途：用简短形式查看之前提交过哪些版本。

### 查看最近一次提交详情

```powershell
git show --stat
```

用途：查看最近一次提交改动了哪些文件。

## 变更记录

### 2026-06-19 09:31 实现账号登录基础

#### 摘要

- 新增 `account_sessions` 会话表，支持单账号单设备在线。
- 新增 Worker 接口：管理员初始化、登录、登出、当前账号识别。
- 前端接入初始化管理员和登录面板。
- 前端加入静态预览模式，避免 Pages 尚未接入 Worker API 时线上页面不可用。
- 修正 D1 本地迁移脚本，显式使用 `wrangler.worker.toml`。
- 补充 README 本地联调说明。
- 同步更新数据库草案、决策记录、项目状态、功能计划、问题汇总和风险清单。

#### 说明

本次完成 MVP 第一阶段的账号基础：首次无账号时可初始化管理员，登录后通过 HTTP-only cookie 保存会话；同账号新登录会撤销旧会话，后续可在此基础上扩展主播账号管理和页面级权限控制。生产环境部署 Worker 前需要配置 `ADMIN_SETUP_TOKEN`，避免公开环境被抢先初始化。

#### 本次变更的 Git 命令

```powershell
npm run typecheck
npm run build
npm run db:migrate:local
npm run worker:dev
npm run dev -- --host 127.0.0.1
git diff --check
git add .
git commit -m "实现账号登录基础"
git push origin main
```

### 2026-06-18 23:58 补充项目文档维护规则

#### 摘要

- 在 `AGENTS.md` 中补充文档维护规则，明确高频文档的更新触发条件。
- 在 `docs/问题汇总与解决.md` 中新增问题概览和问题时间线。
- 在 `docs/风险清单.md` 中新增风险概览和风险时间线。
- 在 `docs/项目功能执行计划清单.md` 中新增进度概览和计划时间线。
- 同步更新 `docs/项目状态.md`。

#### 说明

原文档能记录具体内容，但缺少顶部概览和按时间追踪的入口，后续容易出现“代码已经推进，但计划、风险、问题没有同步”的情况。本次将问题、风险、功能计划三类高频文档改为总览优先，并把维护规则写入 `AGENTS.md`，作为后续每次任务结束前的检查标准。

#### 本次变更的 Git 命令

```powershell
git diff --check
git add .
git commit -m "补充项目文档维护规则"
git push origin main
```

### 2026-06-18 23:43 补充 Pages 静态资源规则

#### 摘要

- 新增 `public/_headers`，明确 Cloudflare Pages 中 JS/CSS 静态资源响应头。
- 新增 `public/_redirects`，为后续 React 页面路由提供刷新回退。
- 记录 Cloudflare Pages 空白页和 module script MIME 报错的线上验证结果。

#### 说明

线上首页当前已经引用 Vite 构建后的 `/assets/index-*.js` 和 `/assets/index-*.css`，不再引用 `/src/main.tsx`。线上 JS 资源响应头已验证为 `Content-Type: application/javascript`，CSS 为 `text/css; charset=utf-8`。若浏览器仍显示旧的 `application/octet-stream` 报错，优先按旧缓存或旧部署页面处理。

#### 本次变更的 Git 命令

```powershell
npm run build
git diff --check
git add .
git commit -m "补充 Cloudflare Pages 静态资源规则"
git push origin main
```

### 2026-06-18 23:41 拆分 Pages 和 Worker 配置

#### 摘要

- 将 `wrangler.toml` 简化为 Cloudflare Pages 专用配置。
- 新增 `wrangler.worker.toml`，预留后续独立 Worker API。
- 更新 `worker:dev` 和 `worker:deploy` 脚本，显式使用 Worker 配置文件。
- 更新 README，说明 Pages 和 Worker 配置分工。

#### 说明

线上空白页的直接原因是生产环境仍加载仓库根目录源码入口 `/src/main.tsx`，而不是 Vite 构建后的 `dist/assets/*.js`。上一版 Cloudflare 部署 `a8e2e39` 失败，生产仍停留在旧部署。`wrangler.toml` 中混放 Worker 的 `main`、D1/R2 占位配置，可能干扰 Pages 构建配置识别。本次拆分配置，确保 Pages 只关心 `dist` 输出目录。

#### 本次变更的 Git 命令

```powershell
npm run typecheck
npm run build
git diff --check
git add .
git commit -m "拆分 Cloudflare Pages 和 Worker 配置"
git push origin main
```

### 2026-06-18 23:31 修正 Cloudflare Pages 构建配置

#### 摘要

- 在 `wrangler.toml` 中新增 `pages_build_output_dir = "dist"`。
- 在 `package.json` 中新增 `pages:deploy` 脚本。
- 在 `README.md` 中补充 Cloudflare Pages 构建设置。
- 删除本地重复目录 `JCC-Web-New`。
- 尝试通过 Wrangler 手动部署 `dist`，但当前环境缺少 `CLOUDFLARE_API_TOKEN`，无法非交互部署。

#### 说明

旧项目之前是静态页面，Cloudflare Pages 可以直接发布根目录。新项目是 Vite 应用，根目录的 `index.html` 会引用 `/src/main.tsx`，线上不会自动执行浏览器端 TSX 编译，所以如果 Pages 仍按旧设置发布根目录，会出现空白页。正确方式是执行 `npm run build` 并发布 `dist`。

#### 本次变更的 Git 命令

```powershell
npm run build
npx wrangler pages deploy dist --project-name jcc-web-mvp --branch main
git status --short --branch
git diff --check
git add .
git commit -m "修正 Cloudflare Pages 构建配置"
git push origin main
```

### 2026-06-18 18:39 将旧仓库主分支切换为新项目

#### 摘要

- 将旧项目当前 `main` 保存为 `old-mvp-main` 分支并推送到远程。
- 在旧仓库 `main` 中替换为新项目骨架和新项目文档。
- 删除旧静态 MVP 的源码文件、旧数据文件和旧文档目录。
- 保留旧项目历史，后续可通过 `old-mvp-main` 查看旧版本。
- 验证新项目依赖安装、类型检查和构建。

#### 说明

这次是主分支用途切换：`main` 从旧静态 MVP 切换为新项目，旧项目不丢失，已保存在远程分支 `old-mvp-main`。后续默认在 `main` 上继续开发新项目。

#### 本次变更的 Git 命令

```powershell
git status --short --branch
git add data/玩家.txt docs/重构沉淀
git commit -m "保存旧项目当前沉淀资料"
git branch old-mvp-main
git push origin old-mvp-main
npm install --no-audit --no-fund
npm run typecheck
npm run build
git add .
git commit -m "重建主分支为新项目骨架"
git push origin main
git log --oneline -5
```

### 2026-06-18 18:22 初始化 Git 并补充提交规则

#### 摘要

- 在 `AGENTS.md` 中新增 Git 提交规则。
- 明确每完成一组明确任务后应提交一次版本点。
- 明确提交前需要检查状态、运行必要验证，并避免提交依赖、构建产物、密钥和临时文件。
- 准备执行新项目首次提交。
- 修正 TypeScript 构建生成的 `drizzle/*.js` 和 `worker/*.js` 不应进入 Git 的问题。

#### 说明

新项目后续会频繁修改数据库、业务规则和页面。将提交规则写入协作规则，可以避免只改不提交导致后续难以回看，也能避免过度零碎提交影响历史可读性。

#### 本次变更的 Git 命令

```powershell
git status --short --branch
npm run typecheck
npm run build
git add .
git commit -m "初始化新项目骨架和项目文档"
git rm --cached drizzle/schema.js worker/index.js
git commit --amend --no-edit
git log --oneline -5
```

### 2026-06-18 18:18 调整项目文档和 Git 管理准备

#### 摘要

- 将 `CHANGELOG.md` 调整为旧项目风格，加入当前文件说明、常用 Git 命令和按时分记录的变更记录。
- 将项目状态类文档的时间粒度调整到分钟。
- 评估并确认新项目需要使用 Git 管理版本，并初始化 Git 仓库。
- 更新 `.gitignore`，补充构建缓存和 TypeScript 生成文件忽略项。
- 验证 `npm run typecheck` 通过。
- 验证 `npm run build` 通过。

#### 说明

新项目已经从需求梳理进入工程骨架阶段，后续会持续修改数据库、业务规则和页面。使用 Git 能帮助追踪每次改动、回滚错误实现，也方便记录每次功能推进的验证命令。

#### 本次变更的 Git 命令

```powershell
git init
git status --short --branch
git diff
npm run typecheck
npm run build
git status --short --branch
git add .
git commit -m "初始化新项目骨架和项目文档"
git log --oneline -5
```

### 2026-06-18 17:27 新增项目治理文档

#### 摘要

- 新增 `AGENTS.md`，记录 Codex 协作规则、项目边界和常用命令。
- 新增 `docs/项目状态.md`，记录当前模块状态、已验证项和未验证项。
- 新增 `docs/项目功能执行计划清单.md`，按优先级整理后续执行计划。
- 新增 `docs/问题汇总与解决.md`，记录 npm/pip 代理问题和后续问题模板。
- 新增 `docs/风险清单.md`，记录票务、公开字段、锁牌、截图和部署风险。
- 新增 `docs/决策记录.md`，沉淀技术栈、UI、公开、票务、截图和代理决策。

#### 说明

这次主要补齐长期迭代需要的项目治理文档。新项目不再是一次性静态 MVP，需要更明确的状态、风险、问题和决策记录。

#### 本次变更的 Git 命令

```powershell
git status --short --branch
git diff
git add AGENTS.md CHANGELOG.md docs/项目状态.md docs/项目功能执行计划清单.md docs/问题汇总与解决.md docs/风险清单.md docs/决策记录.md
git commit -m "新增项目治理文档"
git log --oneline -5
```

### 2026-06-18 11:53 创建项目骨架和数据库迁移草案

#### 摘要

- 创建 TypeScript + React + Vite 项目骨架。
- 创建朴素后台风格首页。
- 创建 Drizzle schema。
- 创建 SQLite / D1 首版迁移 SQL。
- 创建 Cloudflare Worker API 入口。
- 创建 Cloudflare D1 / R2 配置占位。
- 更新 `docs/07-项目创建方案.md`，确认技术路线。

#### 说明

这次从规划文档进入工程骨架阶段。项目仍处于 MVP 基础建设期，优先保证本地可运行、Cloudflare 可适配、功能边界清楚。

#### 本次变更的 Git 命令

```powershell
git status --short --branch
npm install
npm run typecheck
npm run build
git add .
git commit -m "创建新项目工程骨架"
git log --oneline -5
```

### 2026-06-18 11:29 新增数据库草案和项目创建方案

#### 摘要

- 新增 `docs/06-数据库草案.md`。
- 新增 `docs/07-项目创建方案.md`。
- 将数据模型落到表结构、索引、关键查询和完整性建议。
- 确认项目创建建议：TypeScript + React + Drizzle + SQLite，预留 Cloudflare。

#### 说明

这次将产品设计进一步推进到工程准备层。数据库草案为后续 schema 和迁移提供依据，项目创建方案为后续初始化工程提供约束。

#### 本次变更的 Git 命令

```powershell
git status --short --branch
git diff
git add docs/06-数据库草案.md docs/07-项目创建方案.md
git commit -m "新增数据库草案和项目创建方案"
git log --oneline -5
```

### 2026-06-18 11:16 新增数据模型、页面流程、MVP 和技术方案

#### 摘要

- 新增 `docs/02-数据模型设计.md`。
- 新增 `docs/03-页面流程草图.md`。
- 新增 `docs/04-MVP版本切分.md`。
- 新增 `docs/05-技术方案评估.md`。
- 梳理主播端、管理端、游客端页面流程。
- 切分 MVP 必做、可做、暂不做和验收标准。

#### 说明

这次把已经确认的新项目需求推进为结构设计文档，为后续工程创建、数据库设计和功能排期打基础。

#### 本次变更的 Git 命令

```powershell
git status --short --branch
git diff
git add docs/02-数据模型设计.md docs/03-页面流程草图.md docs/04-MVP版本切分.md docs/05-技术方案评估.md
git commit -m "新增新项目结构设计文档"
git log --oneline -5
```
