# JCC Web New

金铲铲水友赛直播辅助工具新项目。

当前阶段：项目骨架。目标是先保证本地可运行，并预留 Cloudflare Pages / Workers / D1 / R2 部署路线。

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

## 文档

项目规划文档在 `docs/` 下。
