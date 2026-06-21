import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgeCent,
  Camera,
  CalendarDays,
  ClipboardList,
  Database,
  Home,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Radio,
  ShieldCheck,
  UserCog,
  Users
} from "lucide-react";
import { apiRequest } from "./api/client";
import { CurrentSessionWorkspace } from "./views/CurrentSessionWorkspace";
import { FanManager } from "./views/FanManager";
import { LiveSessionManager } from "./views/LiveSessionManager";
import { SettingsView } from "./views/SettingsView";
import { cards } from "./constants";
import type { Account, LiveSessionItem, SetupStatus, StreamerOption } from "./types";
import { formatDateTime } from "./utils/format";
import { RankingManager } from "./views/RankingManager";
import { TicketManager } from "./views/TicketManager";
import { defaultSessionTitle, sessionStatusLabel, sessionTypeLabel } from "./utils/labels";

const navItems = [
  { key: "today", label: "今日工作台", icon: Home, roles: ["streamer"] },
  { key: "session-workspace", label: "当前场次", icon: Radio, roles: ["streamer", "admin"] },
  { key: "admin-home", label: "管理首页", icon: LayoutDashboard, roles: ["admin"] },
  { key: "sessions", label: "场次管理", icon: CalendarDays, roles: ["admin", "streamer"] },
  { key: "ranking", label: "定榜管理", icon: ClipboardList, roles: ["admin", "streamer"] },
  { key: "tickets", label: "票务流水", icon: BadgeCent, roles: ["admin", "streamer"] },
  { key: "fans", label: "粉丝资料", icon: Users, roles: ["admin", "streamer"] },
  { key: "locks", label: "锁牌", icon: LockKeyhole, roles: ["admin", "streamer"] },
  { key: "screenshots", label: "截图", icon: Camera, roles: ["admin", "streamer"] },
  { key: "data", label: "基础资料", icon: Database, roles: ["admin"] },
  { key: "settings", label: "账号设置", icon: UserCog, roles: ["admin"] }
] as const;


type ViewKey = (typeof navItems)[number]["key"] | "dashboard";

export function App() {
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [activeView, setActiveView] = useState<ViewKey>("today");
  const [currentSessionId, setCurrentSessionId] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const [message, setMessage] = useState("正在检查登录状态...");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isApiUnavailable, setIsApiUnavailable] = useState(false);

  const isSetupMode = Boolean(setupStatus?.needsAdminSetup);
  const authTitle = useMemo(() => (isSetupMode ? "初始化管理员" : "登录后台"), [isSetupMode]);
  const visibleNavItems = useMemo(
    () => navItems.filter((item) => !account || item.roles.some((role) => role === account.role)),
    [account]
  );
  const pageTitle = useMemo(() => {
    if (activeView === "today") return "今日工作台";
    if (activeView === "session-workspace") return "当前场次工作台";
    if (activeView === "admin-home") return "管理首页";
    return navItems.find((item) => item.key === activeView)?.label ?? "直播管理工作台";
  }, [activeView]);

  useEffect(() => {
    async function bootstrap() {
      try {
        const [status, me] = await Promise.all([
          apiRequest<SetupStatus>("/api/setup/status"),
          apiRequest<{ account: Account | null }>("/api/auth/me")
        ]);

        setSetupStatus(status);
        setAccount(me.account);
        if (me.account) {
          setActiveView(me.account.role === "admin" ? "admin-home" : "today");
        }
        setMessage(status.needsAdminSetup ? "首次使用需要先创建管理员账号。" : "请输入账号和密码。");
      } catch (error) {
        setIsApiUnavailable(true);
        setMessage(error instanceof Error ? error.message : "无法连接后端 API。");
      }
    }

    void bootstrap();
  }, []);

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage("");

    try {
      if (isSetupMode) {
        const result = await apiRequest<{ account: Account }>("/api/setup/admin", {
          method: "POST",
          body: JSON.stringify({ username, password, displayName, setupToken })
        });
        setAccount(result.account);
        setActiveView(result.account.role === "admin" ? "admin-home" : "today");
        setSetupStatus({ needsAdminSetup: false, requiresSetupToken: false });
        setMessage("管理员已创建，请使用该账号登录。");
      } else {
        const result = await apiRequest<{ account: Account }>("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({ username, password })
        });
        setAccount(result.account);
        setActiveView(result.account.role === "admin" ? "admin-home" : "today");
        setMessage("登录成功。");
      }

      setPassword("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function logout() {
    await apiRequest<{ ok: boolean }>("/api/auth/logout", { method: "POST", body: "{}" });
    setAccount(null);
    setCurrentSessionId("");
    setActiveView("today");
    setMessage("已登出。");
  }

  function renderContent() {
    if (activeView === "today") {
      return (
        <TodayWorkspace
          account={account}
          onOpenSession={(sessionId) => {
            setCurrentSessionId(sessionId);
            setActiveView("session-workspace");
          }}
        />
      );
    }

    if (activeView === "session-workspace") {
      return (
        <CurrentSessionWorkspace
          account={account}
          initialSessionId={currentSessionId}
          onSessionChange={setCurrentSessionId}
        />
      );
    }

    if (activeView === "admin-home") {
      return (
        <AdminHome
          account={account}
          onNavigate={setActiveView}
          onOpenSession={(sessionId) => {
            setCurrentSessionId(sessionId);
            setActiveView("session-workspace");
          }}
        />
      );
    }

    if (activeView === "ranking") {
      return <RankingManager account={account} />;
    }

    if (activeView === "tickets") {
      return <TicketManager account={account} />;
    }

    if (activeView === "sessions") {
      return <LiveSessionManager account={account} />;
    }

    if (activeView === "fans") {
      return <FanManager account={account} />;
    }

    if (activeView === "settings") {
      return <SettingsView account={account} />;
    }

    return <DashboardView account={account} isApiUnavailable={isApiUnavailable} message={message} />;
  }

  if (!account && !isApiUnavailable) {
    return (
      <main className="auth-page">
        <form className="auth-panel" onSubmit={submitAuth}>
          <div className="auth-icon">
            <ShieldCheck size={28} />
          </div>
          <p className="eyebrow">JCC 直播助手</p>
          <h1>{authTitle}</h1>
          <p className="auth-copy">{message}</p>

          <label>
            账号
            <input
              autoComplete="username"
              onChange={(event) => setUsername(event.target.value)}
              placeholder="例如 admin"
              required
              value={username}
            />
          </label>

          {isSetupMode ? (
            <label>
              显示名称
              <input
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="例如 管理员"
                value={displayName}
              />
            </label>
          ) : null}

          <label>
            密码
            <input
              autoComplete={isSetupMode ? "new-password" : "current-password"}
              minLength={8}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="至少 8 位"
              required
              type="password"
              value={password}
            />
          </label>

          {isSetupMode && setupStatus?.requiresSetupToken ? (
            <label>
              初始化口令
              <input
                onChange={(event) => setSetupToken(event.target.value)}
                placeholder="Cloudflare 环境变量 ADMIN_SETUP_TOKEN"
                required
                value={setupToken}
              />
            </label>
          ) : null}

          <button className="primary-button" disabled={isSubmitting} type="submit">
            {isSubmitting ? "处理中..." : authTitle}
          </button>
        </form>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">J</span>
          <div>
            <strong>JCC 直播助手</strong>
            <span>
              {account
                ? `${account.role === "admin" ? "管理员" : "主播"}：${account.displayName}`
                : "静态预览模式"}
            </span>
          </div>
        </div>
        <nav className="nav-list">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={`nav-item ${activeView === item.key ? "active" : ""}`}
                key={item.label}
                onClick={() => setActiveView(item.key)}
                type="button"
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="main">
        <header className="page-header">
          <div>
            <p className="eyebrow">TypeScript + React + Drizzle</p>
            <h1>{pageTitle}</h1>
            <p className="header-copy">
              {isApiUnavailable
                ? "当前页面已加载，后端 Worker API 尚未连接；本地联调时启动 Worker 后可初始化管理员和登录。"
                : account?.role === "admin"
                  ? "管理端用于账号、资料、代操作和排查；直播中的高频动作集中到当前场次工作台。"
                  : "主播端优先围绕当前场次操作，减少直播时在多个资料页之间来回切换。"}
            </p>
          </div>
          <div className="header-actions">
            <button
              className="primary-button"
              onClick={() => setActiveView(account?.role === "admin" ? "admin-home" : "today")}
              type="button"
            >
              {account?.role === "admin" ? "回到管理首页" : "回到今日工作台"}
            </button>
            {account ? (
              <button className="icon-button" onClick={logout} title="登出" type="button">
                <LogOut size={18} />
              </button>
            ) : null}
          </div>
        </header>

        {renderContent()}
      </main>
    </div>
  );
}

function DashboardView({
  account,
  isApiUnavailable,
  message
}: {
  account: Account | null;
  isApiUnavailable: boolean;
  message: string;
}) {
  return (
    <>
        <section className="metric-grid">
          {cards.map((card) => (
            <article className="metric-card" key={card.title}>
              <span>{card.title}</span>
              <strong>{card.value}</strong>
              <p>{card.note}</p>
            </article>
          ))}
        </section>

        <section className="work-area">
          <div className="panel">
            <div className="panel-header">
              <h2>MVP 主流程</h2>
              <span>待实现</span>
            </div>
            <ol className="flow-list">
              <li>创建直播场次</li>
              <li>录入定榜并生成推荐名单</li>
              <li>确认对局席位并记录锁牌</li>
              <li>记录存票、取票、现刷和修正</li>
              <li>结算确认并更新长期余额</li>
              <li>开放游客公开存票榜</li>
            </ol>
          </div>

          <div className="panel">
            <div className="panel-header">
              <h2>{account ? "账号状态" : "后端状态"}</h2>
              <span>{account ? "已登录" : "未连接"}</span>
            </div>
            {account ? (
              <ul className="status-list">
                <li>当前账号：{account.username}</li>
                <li>显示名称：{account.displayName}</li>
                <li>角色：{account.role === "admin" ? "管理员" : "主播"}</li>
                <li>会话策略：新设备登录后旧会话失效</li>
              </ul>
            ) : (
              <ul className="status-list">
                <li>前端页面：已加载</li>
                <li>Worker API：未连接</li>
                <li>本地联调：先运行 Worker，再运行前端</li>
                <li>提示：{message}</li>
              </ul>
            )}
          </div>
        </section>
    </>
  );
}

function TodayWorkspace({
  account,
  onOpenSession
}: {
  account: Account | null;
  onOpenSession: (sessionId: string) => void;
}) {
  const [items, setItems] = useState<LiveSessionItem[]>([]);
  const [streamers, setStreamers] = useState<StreamerOption[]>([]);
  const [activeStreamerId, setActiveStreamerId] = useState("");
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const loadSessions = useCallback(async () => {
    const result = await apiRequest<{
      items: LiveSessionItem[];
      streamers: StreamerOption[];
      activeStreamerId: string | null;
    }>("/api/live-sessions");
    setItems(result.items);
    setStreamers(result.streamers);
    setActiveStreamerId(result.activeStreamerId ?? "");
  }, []);

  useEffect(() => {
    if (account) {
      loadSessions().catch((error) => setNotice(error instanceof Error ? error.message : "加载场次失败"));
    }
  }, [account, loadSessions]);

  if (!account) {
    return (
      <section className="panel">
        <div className="panel-header">
          <h2>今日工作台</h2>
          <span>未登录</span>
        </div>
        <p className="muted">请先登录后再进入直播工作台。</p>
      </section>
    );
  }

  const activeSessions = items.filter((item) => item.status === "live" || item.status === "preparing");
  const pendingSessions = items.filter((item) => item.status === "pending_settlement");
  const currentSession = activeSessions[0] ?? pendingSessions[0] ?? items[0];

  async function createQuickSession(sessionType: string) {
    if (!activeStreamerId) {
      setNotice("请先创建或选择主播账号。");
      return;
    }

    setIsLoading(true);
    setNotice("");
    try {
      const result = await apiRequest<{ ok: boolean; id: string }>("/api/live-sessions", {
        method: "POST",
        body: JSON.stringify({
          streamerId: activeStreamerId,
          title: defaultSessionTitle(sessionType),
          sessionType,
          status: "live",
          note: ""
        })
      });
      await loadSessions();
      onOpenSession(result.id);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "创建场次失败");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      <section className="metric-grid">
        <article className="metric-card">
          <span>当前场次</span>
          <strong>{currentSession ? sessionStatusLabel(currentSession.status) : "未开始"}</strong>
          <p>{currentSession ? currentSession.title : "创建下午场或晚上场后进入直播流程"}</p>
        </article>
        <article className="metric-card">
          <span>待结算</span>
          <strong>{pendingSessions.length}</strong>
          <p>直播结束后确认取票回退和长期余额变化。</p>
        </article>
        <article className="metric-card">
          <span>进行中/准备中</span>
          <strong>{activeSessions.length}</strong>
          <p>优先进入最近的当前场次继续操作。</p>
        </article>
        <article className="metric-card">
          <span>公开存票榜</span>
          <strong>待接入</strong>
          <p>游客只看到公开模块和公开字段。</p>
        </article>
      </section>

      <section className="work-area">
        <div className="panel">
          <div className="panel-header">
            <h2>今天要做的事</h2>
            <span>主播端</span>
          </div>
          {currentSession ? (
            <div className="current-session-card">
              <strong>{currentSession.title}</strong>
              <span>
                {sessionTypeLabel(currentSession.sessionType)} · {sessionStatusLabel(currentSession.status)}
              </span>
              <span>
                开始：{formatDateTime(currentSession.startedAt)} · 结束：{formatDateTime(currentSession.endedAt)}
              </span>
              {currentSession.note ? <span>备注：{currentSession.note}</span> : null}
              <button className="primary-button" onClick={() => onOpenSession(currentSession.id)} type="button">
                进入当前场次
              </button>
            </div>
          ) : (
            <p className="muted">当前没有直播场次，可以直接创建下午场或晚上场。</p>
          )}
          {notice ? <p className="notice">{notice}</p> : null}
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2>快速开场</h2>
            <span>减少跳页</span>
          </div>
          {account.role === "admin" ? (
            <label className="field-label">
              代操作主播
              <select onChange={(event) => setActiveStreamerId(event.target.value)} value={activeStreamerId}>
                {streamers.map((streamer) => (
                  <option key={streamer.id} value={streamer.id}>
                    {streamer.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="quick-actions">
            <button className="secondary-button" disabled={isLoading} onClick={() => createQuickSession("afternoon")} type="button">
              创建下午场
            </button>
            <button className="secondary-button" disabled={isLoading} onClick={() => createQuickSession("evening")} type="button">
              创建晚上场
            </button>
            <button className="secondary-button" disabled={isLoading} onClick={() => createQuickSession("custom")} type="button">
              创建自定义
            </button>
          </div>
          <ol className="flow-list compact-flow">
            <li>创建或进入当前场次</li>
            <li>开始直播后维护本场榜单</li>
            <li>录入定榜并查看推荐</li>
            <li>确认名单后进入对局</li>
            <li>直播中预记取票和存票</li>
            <li>结束直播后统一确认结算</li>
          </ol>
        </div>
      </section>
    </>
  );
}

function AdminHome({
  account,
  onNavigate,
  onOpenSession
}: {
  account: Account | null;
  onNavigate: (view: ViewKey) => void;
  onOpenSession: (sessionId: string) => void;
}) {
  const [sessions, setSessions] = useState<LiveSessionItem[]>([]);
  const [streamers, setStreamers] = useState<StreamerOption[]>([]);
  const [notice, setNotice] = useState("");

  const loadAdminHome = useCallback(async () => {
    const result = await apiRequest<{
      items: LiveSessionItem[];
      streamers: StreamerOption[];
      activeStreamerId: string | null;
    }>("/api/live-sessions");
    setSessions(result.items);
    setStreamers(result.streamers);
  }, []);

  useEffect(() => {
    if (account) {
      loadAdminHome().catch((error) => setNotice(error instanceof Error ? error.message : "加载管理首页失败"));
    }
  }, [account, loadAdminHome]);

  if (!account || account.role !== "admin") {
    return (
      <section className="panel">
        <div className="panel-header">
          <h2>管理首页</h2>
          <span>无权限</span>
        </div>
        <p className="muted">当前账号不能访问管理端。</p>
      </section>
    );
  }

  const liveSessions = sessions.filter((session) => session.status === "live");
  const pendingSessions = sessions.filter((session) => session.status === "pending_settlement");

  return (
    <>
      <section className="metric-grid">
        <article className="metric-card">
          <span>主播空间</span>
          <strong>{streamers.length}</strong>
          <p>管理员可创建账号、停用账号，并代主播处理资料和场次。</p>
        </article>
        <article className="metric-card">
          <span>进行中场次</span>
          <strong>{liveSessions.length}</strong>
          <p>需要辅助时从这里进入当前场次工作台。</p>
        </article>
        <article className="metric-card">
          <span>待结算</span>
          <strong>{pendingSessions.length}</strong>
          <p>后续结算页会集中显示需要确认的票务变化。</p>
        </article>
        <article className="metric-card">
          <span>操作日志</span>
          <strong>待筛选</strong>
          <p>关键操作已逐步写日志，后续补日志筛选页。</p>
        </article>
      </section>

      <section className="work-area">
        <div className="panel">
          <div className="panel-header">
            <h2>需要关注的场次</h2>
            <span>{liveSessions.length + pendingSessions.length}</span>
          </div>
          {liveSessions.length + pendingSessions.length === 0 ? (
            <p className="muted">当前没有进行中或待结算场次。</p>
          ) : (
            <div className="account-list">
              {[...liveSessions, ...pendingSessions].map((session) => (
                <article className="account-row fan-row" key={session.id}>
                  <div>
                    <strong>{session.title}</strong>
                    <span>
                      {session.streamerName || "未知主播"} · {sessionTypeLabel(session.sessionType)} ·{" "}
                      {sessionStatusLabel(session.status)}
                    </span>
                    <span>开始：{formatDateTime(session.startedAt)}</span>
                  </div>
                  <div className="row-actions">
                    <button className="secondary-button" onClick={() => onOpenSession(session.id)} type="button">
                      代操作
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
          {notice ? <p className="notice">{notice}</p> : null}
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2>管理入口</h2>
            <span>后台</span>
          </div>
          <div className="quick-actions">
            <button className="secondary-button" onClick={() => onNavigate("settings")} type="button">
              主播账号
            </button>
            <button className="secondary-button" onClick={() => onNavigate("fans")} type="button">
              粉丝资料
            </button>
            <button className="secondary-button" onClick={() => onNavigate("tickets")} type="button">
              票务流水
            </button>
            <button className="secondary-button" onClick={() => onNavigate("sessions")} type="button">
              场次管理
            </button>
          </div>
          <p className="muted">管理员侧重点是代操作、排查和维护资料；直播现场高频操作统一放到当前场次工作台。</p>
        </div>
      </section>
    </>
  );
}
