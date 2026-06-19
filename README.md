# JCC Web New

金铲铲水友赛直播辅助工具新项目。

当前阶段：项目骨架和账号登录基础。目标是先保证本地可运行，并预留 Cloudflare Pages / Workers / D1 / R2 部署路线。

## 技术选择

- TypeScript
- React
- Vite
- Drizzle ORM
- SQLite / Cloudflare D1
- Cloudflare Workers API 预留
- 朴素后台风格

## 本地启动

安装依赖：

```bash
npm install
```

启动前端：

```bash
npm run dev
```

启动 Worker API：

```bash
npm run worker:dev
```

初始化本地 D1：

```bash
npm run db:migrate:local
```

本地联调时，前端运行在 `http://127.0.0.1:5173`，Worker API 运行在 `http://127.0.0.1:8787`，Vite 会把 `/api` 请求代理到 Worker。

验证 Cloudflare Pages Functions 形态：

```bash
npm run pages:dev
```

该命令会构建前端，并用 Pages Functions 在同一个本地域名下提供 `/api/*`。

类型检查：

```bash
npm run typecheck
```

构建：

```bash
npm run build
```

## Cloudflare Pages

当前项目是 Vite 应用，Cloudflare Pages 需要使用构建产物目录。

Pages 构建设置：

```text
Build command: npm run build
Build output directory: dist
Root directory: /
```

如果使用 Wrangler 手动部署：

```bash
npm run build
npm run pages:deploy
```

说明：

- `wrangler.toml` 仅用于 Pages 部署。
- `wrangler.worker.toml` 预留给后续独立 Worker API。
- `functions/api/[[path]].ts` 用于让 Cloudflare Pages 同域名接入 `/api/*`。

Pages 后台需要在“设置 -> 绑定”中配置：

```text
D1 database binding: DB
R2 bucket binding: SCREENSHOTS
Environment variable: ADMIN_SETUP_TOKEN
```

配置完成后重新部署，`https://jcc-web-mvp.pages.dev/api/health` 应返回 JSON。

## 文档

项目规划文档在 `docs/` 下。
