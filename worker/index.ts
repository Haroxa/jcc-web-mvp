import { Hono } from "hono";
import { cors } from "hono/cors";

import type { Bindings } from "./shared";
import { registerAccountRoutes } from "./routes/accounts";
import { registerFanRoutes } from "./routes/fans";
import { registerLiveSessionRoutes } from "./routes/liveSessions";
import { registerTicketRoutes } from "./routes/tickets";
import { registerSessionBoardRoutes } from "./routes/sessionBoard";
import { registerRankingRoutes } from "./routes/rankings";

const app = new Hono<{ Bindings: Bindings }>();
app.use(
  "/api/*",
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true
  })
);

app.get("/api/health", (context) => {
  const screenshotsConfigured = Boolean(context.env.SCREENSHOTS);

  return context.json({
    ok: true,
    service: "jcc-web-new",
    storage: {
      database: Boolean(context.env.DB),
      screenshots: screenshotsConfigured,
      screenshotsStatus: screenshotsConfigured ? "ready" : "deferred"
    }
  });
});

registerAccountRoutes(app);

registerFanRoutes(app);

registerLiveSessionRoutes(app);

registerTicketRoutes(app);

registerSessionBoardRoutes(app);

registerRankingRoutes(app);

app.notFound((context) => context.json({ error: "Not found" }, 404));

export default app;
