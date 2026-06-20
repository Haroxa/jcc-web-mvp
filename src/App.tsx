import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgeCent,
  Camera,
  CalendarDays,
  ClipboardList,
  Database,
  Home,
  LayoutDashboard,
  ListChecks,
  LockKeyhole,
  LogOut,
  Radio,
  ShieldCheck,
  UserCog,
  Users
} from "lucide-react";
import { apiRequest } from "./api/client";
import {
  cards,
  emptyFanForm,
  emptyLiveSessionForm,
  fanStatusOptions,
  rankingStyleOptions,
  sessionStatusOptions,
  sessionTypeOptions,
  ticketTypeOptions
} from "./constants";
import type {
  Account,
  BoardEntryItem,
  FanForm,
  FanItem,
  LiveSessionForm,
  LiveSessionItem,
  RankingEntryForm,
  RankingEntryItem,
  RankingForm,
  RankingSnapshotItem,
  SessionAction,
  SetupStatus,
  StreamerAccountItem,
  StreamerOption,
  TicketForm,
  TicketLedgerItem,
  WorkspaceTab
} from "./types";
import { formatDateTime, formatDuration, toInteger } from "./utils/format";
import {
  boardStatusLabel,
  defaultSessionTitle,
  fanTypeLabel,
  rankingStatusLabel,
  rankingStyleLabel,
  seatDecisionLabel,
  sessionStatusLabel,
  sessionTypeLabel,
  ticketTypeLabel
} from "./utils/labels";

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

function CurrentSessionWorkspace({
  account,
  initialSessionId,
  onSessionChange
}: {
  account: Account | null;
  initialSessionId: string;
  onSessionChange: (sessionId: string) => void;
}) {
  const [sessions, setSessions] = useState<LiveSessionItem[]>([]);
  const [activeSessionId, setActiveSessionId] = useState(initialSessionId);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("ranking");
  const [notice, setNotice] = useState("");
  const [isSessionActionLoading, setIsSessionActionLoading] = useState(false);

  const loadSessions = useCallback(async () => {
    const result = await apiRequest<{
      items: LiveSessionItem[];
      streamers: StreamerOption[];
      activeStreamerId: string | null;
    }>("/api/live-sessions");
    setSessions(result.items);
    const preferredId =
      initialSessionId ||
      result.items.find((item) => item.status === "live")?.id ||
      result.items.find((item) => item.status === "preparing")?.id ||
      result.items[0]?.id ||
      "";
    setActiveSessionId((current) => current || preferredId);
    if (preferredId) {
      onSessionChange(preferredId);
    }
  }, [initialSessionId, onSessionChange]);

  useEffect(() => {
    if (account) {
      loadSessions().catch((error) => setNotice(error instanceof Error ? error.message : "加载当前场次失败"));
    }
  }, [account, loadSessions]);

  if (!account) {
    return (
      <section className="panel">
        <div className="panel-header">
          <h2>当前场次</h2>
          <span>未登录</span>
        </div>
        <p className="muted">请先登录后再进入当前场次工作台。</p>
      </section>
    );
  }

  const activeSession = sessions.find((session) => session.id === activeSessionId);
  const tabs: Array<{ key: WorkspaceTab; label: string }> = [
    { key: "ranking", label: "榜单/定榜" },
    { key: "lineup", label: "名单确认" },
    { key: "match", label: "对局/锁牌" },
    { key: "settlement", label: "结算" },
    { key: "tickets", label: "存票流水" },
    { key: "notes", label: "截图/备注" }
  ];

  async function runSessionAction(action: SessionAction) {
    if (!activeSession) return;

    setIsSessionActionLoading(true);
    setNotice("");
    try {
      const result = await apiRequest<{ ok: boolean; ledgerCount?: number }>(`/api/live-sessions/${activeSession.id}/action`, {
        method: "POST",
        body: JSON.stringify({ action })
      });
      if (action === "start") setNotice("直播已开始。");
      if (action === "end") setNotice("直播已结束，进入待结算。");
      if (action === "settle") setNotice(`结算已确认，已生成 ${result.ledgerCount ?? 0} 条正式票务流水。`);
      await loadSessions();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "场次操作失败");
    } finally {
      setIsSessionActionLoading(false);
    }
  }

  function renderSessionPrimaryAction() {
    if (!activeSession) return null;
    if (activeSession.status === "preparing") {
      return (
        <button className="primary-button" disabled={isSessionActionLoading} onClick={() => runSessionAction("start")} type="button">
          开始直播
        </button>
      );
    }
    if (activeSession.status === "live") {
      return (
        <button className="primary-button" disabled={isSessionActionLoading} onClick={() => runSessionAction("end")} type="button">
          结束直播
        </button>
      );
    }
    if (activeSession.status === "pending_settlement") {
      return (
        <button className="primary-button" disabled={isSessionActionLoading} onClick={() => runSessionAction("settle")} type="button">
          确认结算
        </button>
      );
    }
    if (activeSession.status === "settled") {
      return (
        <button className="secondary-button" onClick={() => setActiveTab("settlement")} type="button">
          查看结算结果
        </button>
      );
    }
    return null;
  }

  function renderTabContent() {
    if (!activeSession) {
      return (
        <section className="panel">
          <div className="panel-header">
            <h2>没有可操作场次</h2>
            <span>待创建</span>
          </div>
          <p className="muted">请先到今日工作台或场次管理中创建直播场次。</p>
        </section>
      );
    }

    if (activeTab === "ranking") {
      return <RankingManager account={account} contextSessionId={activeSession.id} />;
    }

    if (activeTab === "tickets") {
      return <TicketManager account={account} contextSessionId={activeSession.id} />;
    }

    if (activeTab === "lineup") {
      return (
        <WorkflowPlaceholder
          icon={<ListChecks size={22} />}
          title="名单确认"
          status="下一步实现"
          items={[
            "从定榜推荐名单带入 8 个席位",
            "支持上车、待定、补位和备注",
            "确认后创建对局草稿"
          ]}
        />
      );
    }

    if (activeTab === "match") {
      return (
        <WorkflowPlaceholder
          icon={<LockKeyhole size={22} />}
          title="对局/锁牌"
          status="待接入规则"
          items={["8 个席位记录游戏名", "存活玩家锁牌互斥", "淘汰后保留记录并释放占用"]}
        />
      );
    }

    if (activeTab === "settlement") {
      return (
        <WorkflowPlaceholder
          icon={<BadgeCent size={22} />}
          title="结算"
          status="待接入预览"
          items={["汇总本场存票、取票、现刷和修正", "标记未使用取票回退", "二次确认后写入结算日志"]}
        />
      );
    }

    return (
      <WorkflowPlaceholder
        icon={<Camera size={22} />}
        title="截图/备注"
        status="R2 暂缓"
        items={["截图云存储暂缓", "先保留业务关联和公开策略设计", "后续可接公开截图墙"]}
      />
    );
  }

  return (
    <>
      <section className="session-context">
        <div>
          <p className="eyebrow">{account.role === "admin" ? "管理员代操作" : "主播当前场次"}</p>
          <h2>{activeSession ? activeSession.title : "未选择场次"}</h2>
          <p>
            {activeSession
              ? `${activeSession.streamerName || account.displayName} · ${sessionTypeLabel(activeSession.sessionType)} · ${sessionStatusLabel(activeSession.status)}`
              : "创建场次后，定榜、名单、锁牌、存票和结算都会默认挂到当前场次。"}
          </p>
          {activeSession ? (
            <p className="session-timeline">
              开始：{formatDateTime(activeSession.startedAt)} · 结束：{formatDateTime(activeSession.endedAt)} · 结算：
              {formatDateTime(activeSession.settledAt)}
            </p>
          ) : null}
        </div>
        <div className="session-context-actions">
          <label>
            切换场次
            <select
              onChange={(event) => {
                setActiveSessionId(event.target.value);
                onSessionChange(event.target.value);
              }}
              value={activeSessionId}
            >
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.title} · {sessionStatusLabel(session.status)}
                </option>
              ))}
            </select>
          </label>
          {renderSessionPrimaryAction()}
        </div>
      </section>

      <div className="workspace-tabs">
        {tabs.map((tab) => (
          <button
            className={activeTab === tab.key ? "active" : ""}
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>

      {notice ? <p className="notice workspace-notice">{notice}</p> : null}
      {renderTabContent()}
    </>
  );
}

function WorkflowPlaceholder({
  icon,
  title,
  status,
  items
}: {
  icon: ReactNode;
  title: string;
  status: string;
  items: string[];
}) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>
          <span className="title-icon">{icon}</span>
          {title}
        </h2>
        <span>{status}</span>
      </div>
      <ol className="flow-list">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>
    </section>
  );
}

function LiveSessionManager({ account }: { account: Account | null }) {
  const [items, setItems] = useState<LiveSessionItem[]>([]);
  const [streamers, setStreamers] = useState<StreamerOption[]>([]);
  const [activeStreamerId, setActiveStreamerId] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [form, setForm] = useState<LiveSessionForm>(() => ({
    ...emptyLiveSessionForm,
    title: defaultSessionTitle("afternoon")
  }));
  const [editForm, setEditForm] = useState<LiveSessionForm>(emptyLiveSessionForm);
  const [editingSessionId, setEditingSessionId] = useState("");
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const loadSessions = useCallback(async (streamerId = "", status = "") => {
    const params = new URLSearchParams();
    if (streamerId) params.set("streamerId", streamerId);
    if (status) params.set("status", status);

    const result = await apiRequest<{
      items: LiveSessionItem[];
      streamers: StreamerOption[];
      activeStreamerId: string | null;
    }>(`/api/live-sessions?${params.toString()}`);
    setItems(result.items);
    setStreamers(result.streamers);
    setActiveStreamerId(result.activeStreamerId ?? "");
  }, []);

  useEffect(() => {
    loadSessions().catch((error) => setNotice(error instanceof Error ? error.message : "加载失败"));
  }, [loadSessions]);

  if (!account) {
    return (
      <section className="panel">
        <div className="panel-header">
          <h2>直播场次</h2>
          <span>未登录</span>
        </div>
        <p className="muted">请先登录后再管理直播场次。</p>
      </section>
    );
  }

  function patchForm(key: keyof LiveSessionForm, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function patchEditForm(key: keyof LiveSessionForm, value: string) {
    setEditForm((current) => ({ ...current, [key]: value }));
  }

  function toForm(item: LiveSessionItem): LiveSessionForm {
    return {
      title: item.title,
      sessionType: item.sessionType,
      status: item.status,
      note: item.note ?? ""
    };
  }

  async function createSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setNotice("");

    try {
      await apiRequest<{ ok: boolean; id: string }>("/api/live-sessions", {
        method: "POST",
        body: JSON.stringify({ ...form, streamerId: activeStreamerId })
      });
      setNotice("直播场次已创建。");
      setForm({ ...emptyLiveSessionForm, title: defaultSessionTitle(form.sessionType) });
      await loadSessions(activeStreamerId, statusFilter);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "创建失败");
    } finally {
      setIsLoading(false);
    }
  }

  async function saveSession(sessionId: string) {
    setIsLoading(true);
    setNotice("");

    try {
      await apiRequest<{ ok: boolean }>(`/api/live-sessions/${sessionId}`, {
        method: "PATCH",
        body: JSON.stringify(editForm)
      });
      setNotice("直播场次已更新。");
      setEditingSessionId("");
      await loadSessions(activeStreamerId, statusFilter);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "保存失败");
    } finally {
      setIsLoading(false);
    }
  }

  async function applyStatusFilter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    await loadSessions(activeStreamerId, statusFilter).catch((error) =>
      setNotice(error instanceof Error ? error.message : "筛选失败")
    );
  }

  return (
    <section className="settings-grid">
      <form className="panel form-panel" onSubmit={createSession}>
        <div className="panel-header">
          <h2>创建直播场次</h2>
          <span>{account.role === "admin" ? "可代操作" : "主播端"}</span>
        </div>

        {account.role === "admin" ? (
          <label>
            所属主播
            <select
              onChange={(event) => {
                setActiveStreamerId(event.target.value);
                loadSessions(event.target.value, statusFilter).catch((error) =>
                  setNotice(error instanceof Error ? error.message : "切换主播失败")
                );
              }}
              value={activeStreamerId}
            >
              {streamers.map((streamer) => (
                <option key={streamer.id} value={streamer.id}>
                  {streamer.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <LiveSessionFields
          form={form}
          includeStatus={false}
          onChange={(key, value) => {
            patchForm(key, value);
            if (key === "sessionType" && !form.title.trim()) {
              patchForm("title", defaultSessionTitle(value));
            }
          }}
        />

        <button className="primary-button" disabled={isLoading || !activeStreamerId} type="submit">
          {isLoading ? "处理中..." : "创建场次"}
        </button>

        {notice ? <p className="notice">{notice}</p> : null}
      </form>

      <section className="panel list-panel">
        <div className="panel-header">
          <h2>直播场次</h2>
          <span>{items.length}</span>
        </div>

        <form className="filter-bar compact-filter" onSubmit={applyStatusFilter}>
          <select onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
            <option value="">全部状态</option>
            {sessionStatusOptions.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
          <button className="secondary-button" type="submit">
            筛选
          </button>
        </form>

        {items.length === 0 ? (
          <p className="muted">还没有直播场次。</p>
        ) : (
          <div className="account-list">
            {items.map((item) => (
              <article className="account-row fan-row" key={item.id}>
                {editingSessionId === item.id ? (
                  <div className="fan-edit">
                    <LiveSessionFields form={editForm} includeStatus onChange={patchEditForm} />
                  </div>
                ) : (
                  <div>
                    <strong>{item.title}</strong>
                    <span>
                      {sessionTypeLabel(item.sessionType)} · {sessionStatusLabel(item.status)}
                      {item.streamerName ? ` · ${item.streamerName}` : ""}
                    </span>
                    <span>
                      开始：{formatDateTime(item.startedAt)} · 结束：{formatDateTime(item.endedAt)} · 结算：
                      {formatDateTime(item.settledAt)}
                    </span>
                    {item.note ? <span>备注：{item.note}</span> : null}
                  </div>
                )}

                <div className="row-actions">
                  {editingSessionId === item.id ? (
                    <>
                      <button className="secondary-button" disabled={isLoading} onClick={() => saveSession(item.id)} type="button">
                        保存
                      </button>
                      <button className="secondary-button" disabled={isLoading} onClick={() => setEditingSessionId("")} type="button">
                        取消
                      </button>
                    </>
                  ) : (
                    <button
                      className="secondary-button"
                      disabled={isLoading}
                      onClick={() => {
                        setEditingSessionId(item.id);
                        setEditForm(toForm(item));
                        setNotice("");
                      }}
                      type="button"
                    >
                      编辑
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

function TicketManager({ account, contextSessionId = "" }: { account: Account | null; contextSessionId?: string }) {
  const [items, setItems] = useState<TicketLedgerItem[]>([]);
  const [fans, setFans] = useState<FanItem[]>([]);
  const [sessions, setSessions] = useState<LiveSessionItem[]>([]);
  const [streamers, setStreamers] = useState<StreamerOption[]>([]);
  const [activeStreamerId, setActiveStreamerId] = useState("");
  const [fanFilter, setFanFilter] = useState("");
  const [form, setForm] = useState<TicketForm>({
    fanId: "",
    sessionId: "",
    type: "deposit",
    amount: "",
    note: ""
  });
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const loadTickets = useCallback(async (streamerId = "", fanId = "") => {
    const params = new URLSearchParams();
    if (streamerId) params.set("streamerId", streamerId);
    if (fanId) params.set("fanId", fanId);

    const result = await apiRequest<{
      items: TicketLedgerItem[];
      fans: FanItem[];
      sessions: LiveSessionItem[];
      streamers: StreamerOption[];
      activeStreamerId: string | null;
    }>(`/api/tickets?${params.toString()}`);
    setItems(result.items);
    setFans(result.fans);
    setSessions(result.sessions);
    setStreamers(result.streamers);
    setActiveStreamerId(result.activeStreamerId ?? "");
    setForm((current) => ({
      ...current,
      fanId: current.fanId || result.fans[0]?.id || "",
      sessionId: contextSessionId || current.sessionId || result.sessions[0]?.id || ""
    }));
  }, [contextSessionId]);

  useEffect(() => {
    loadTickets().catch((error) => setNotice(error instanceof Error ? error.message : "加载失败"));
  }, [loadTickets]);

  useEffect(() => {
    if (contextSessionId) {
      setForm((current) => ({ ...current, sessionId: contextSessionId }));
    }
  }, [contextSessionId]);

  if (!account) {
    return (
      <section className="panel">
        <div className="panel-header">
          <h2>存票</h2>
          <span>未登录</span>
        </div>
        <p className="muted">请先登录后再管理票务流水。</p>
      </section>
    );
  }

  function patchForm(key: keyof TicketForm, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function createTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setNotice("");

    try {
      await apiRequest<{ ok: boolean }>("/api/tickets", {
        method: "POST",
        body: JSON.stringify({
          streamerId: activeStreamerId,
          fanId: form.fanId,
          sessionId: form.sessionId || undefined,
          type: form.type,
          amount: Number(form.amount),
          note: form.note
        })
      });
      setNotice("票务记录已新增。");
      setForm((current) => ({ ...current, amount: "", note: "" }));
      await loadTickets(activeStreamerId, fanFilter);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "新增失败");
    } finally {
      setIsLoading(false);
    }
  }

  async function voidTicket(item: TicketLedgerItem) {
    const reason = window.prompt("请输入作废原因", "误操作作废");
    if (reason === null) return;

    setIsLoading(true);
    setNotice("");
    try {
      await apiRequest<{ ok: boolean }>(`/api/tickets/${item.id}/void`, {
        method: "POST",
        body: JSON.stringify({ note: reason })
      });
      setNotice("票务记录已作废。");
      await loadTickets(activeStreamerId, fanFilter);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "作废失败");
    } finally {
      setIsLoading(false);
    }
  }

  const selectedFan = fans.find((fan) => fan.id === form.fanId);

  return (
    <section className="settings-grid">
      <form className="panel form-panel" onSubmit={createTicket}>
        <div className="panel-header">
          <h2>新增票务记录</h2>
          <span>{selectedFan ? `余额 ${selectedFan.cachedTicketBalance}` : "流水"}</span>
        </div>

        {account.role === "admin" ? (
          <label>
            所属主播
            <select
              onChange={(event) => {
                setActiveStreamerId(event.target.value);
                setFanFilter("");
                setForm((current) => ({ ...current, fanId: "", sessionId: "" }));
                loadTickets(event.target.value).catch((error) =>
                  setNotice(error instanceof Error ? error.message : "切换主播失败")
                );
              }}
              value={activeStreamerId}
            >
              {streamers.map((streamer) => (
                <option key={streamer.id} value={streamer.id}>
                  {streamer.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label>
          粉丝
          <select onChange={(event) => patchForm("fanId", event.target.value)} required value={form.fanId}>
            {fans.map((fan) => (
              <option key={fan.id} value={fan.id}>
                {fan.displayName}（余额 {fan.cachedTicketBalance}）
              </option>
            ))}
          </select>
        </label>

        <label>
          关联场次
          <select onChange={(event) => patchForm("sessionId", event.target.value)} value={form.sessionId}>
            <option value="">不关联场次</option>
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.title}
              </option>
            ))}
          </select>
        </label>

        <label>
          类型
          <select onChange={(event) => patchForm("type", event.target.value)} value={form.type}>
            {ticketTypeOptions.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          票数
          <input
            inputMode="numeric"
            onChange={(event) => patchForm("amount", event.target.value)}
            placeholder={form.type === "adjustment" ? "可填正数或负数" : "必须大于 0"}
            required
            value={form.amount}
          />
        </label>

        <label>
          备注
          <textarea onChange={(event) => patchForm("note", event.target.value)} placeholder="建议填写来源或原因" rows={3} value={form.note} />
        </label>

        <button className="primary-button" disabled={isLoading || !activeStreamerId || !fans.length} type="submit">
          {isLoading ? "处理中..." : "新增记录"}
        </button>

        {notice ? <p className="notice">{notice}</p> : null}
      </form>

      <section className="panel list-panel">
        <div className="panel-header">
          <h2>票务流水</h2>
          <span>{items.length}</span>
        </div>

        <form
          className="filter-bar compact-filter"
          onSubmit={(event) => {
            event.preventDefault();
            loadTickets(activeStreamerId, fanFilter).catch((error) =>
              setNotice(error instanceof Error ? error.message : "筛选失败")
            );
          }}
        >
          <select onChange={(event) => setFanFilter(event.target.value)} value={fanFilter}>
            <option value="">全部粉丝</option>
            {fans.map((fan) => (
              <option key={fan.id} value={fan.id}>
                {fan.displayName}
              </option>
            ))}
          </select>
          <button className="secondary-button" type="submit">
            筛选
          </button>
        </form>

        {items.length === 0 ? (
          <p className="muted">还没有票务流水。</p>
        ) : (
          <div className="account-list">
            {items.map((item) => (
              <article className="account-row fan-row" key={item.id}>
                <div>
                  <strong>
                    {item.fanName} · {ticketTypeLabel(item.type)} {item.amount}
                  </strong>
                  <span>
                    {item.sessionTitle || "未关联场次"} · {item.status === "voided" ? "已作废" : "正常"} ·{" "}
                    {formatDateTime(item.createdAt)}
                  </span>
                  <span>
                    影响余额：{item.affectsBalance ? "是" : "否"} · 影响竞争票：
                    {item.affectsCompetition ? "是" : "否"} · 操作人：{item.createdByName || "未知"}
                  </span>
                  {item.note ? <span>备注：{item.note}</span> : null}
                </div>
                <div className="row-actions">
                  <button
                    className="secondary-button"
                    disabled={isLoading || item.status === "voided"}
                    onClick={() => voidTicket(item)}
                    type="button"
                  >
                    作废
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

function RankingManager({ account, contextSessionId = "" }: { account: Account | null; contextSessionId?: string }) {
  const [session, setSession] = useState<LiveSessionItem | null>(null);
  const [boardEntries, setBoardEntries] = useState<BoardEntryItem[]>([]);
  const [snapshots, setSnapshots] = useState<RankingSnapshotItem[]>([]);
  const [fans, setFans] = useState<FanItem[]>([]);
  const [sessions, setSessions] = useState<LiveSessionItem[]>([]);
  const [activeSessionId, setActiveSessionId] = useState(contextSessionId);
  const [activeSnapshotId, setActiveSnapshotId] = useState("");
  const [rankingForm, setRankingForm] = useState<RankingForm>({
    sessionId: contextSessionId,
    roundNo: "",
    title: "",
    style: "top7",
    note: ""
  });
  const [entryForm, setEntryForm] = useState<RankingEntryForm>({
    fanId: "",
    giftDiamonds: "",
    ticketUsed: "",
    depositAmount: "",
    manualAdjustment: "0",
    status: "normal",
    tieOrder: "",
    note: ""
  });
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());

  const loadSessionList = useCallback(async () => {
    const result = await apiRequest<{
      items: LiveSessionItem[];
      streamers: StreamerOption[];
      activeStreamerId: string | null;
    }>("/api/live-sessions");
    setSessions(result.items);
    const preferredId = contextSessionId || activeSessionId || result.items[0]?.id || "";
    setActiveSessionId(preferredId);
    setRankingForm((current) => ({ ...current, sessionId: preferredId }));
  }, [activeSessionId, contextSessionId]);

  const loadBoard = useCallback(
    async (sessionId = activeSessionId) => {
      if (!sessionId) return;
      const result = await apiRequest<{
        session: LiveSessionItem;
        entries: BoardEntryItem[];
        fans: FanItem[];
        snapshots: RankingSnapshotItem[];
      }>(`/api/session-board?sessionId=${encodeURIComponent(sessionId)}`);
      setSession(result.session);
      setBoardEntries(result.entries);
      setFans(result.fans);
      setSnapshots(result.snapshots);
      setActiveSessionId(sessionId);
      setActiveSnapshotId((current) => current || result.snapshots[0]?.id || "");
      setRankingForm((current) => ({
        ...current,
        sessionId,
        roundNo: current.roundNo || String((result.snapshots[0]?.roundNo ?? 0) + 1)
      }));
      setEntryForm((current) => {
        const preferredFanId = current.fanId || result.entries[0]?.fanId || result.fans[0]?.id || "";
        const currentEntry = result.entries.find((entry) => entry.fanId === preferredFanId);
        if (!currentEntry) {
          return {
            ...current,
            fanId: preferredFanId,
            giftDiamonds: current.fanId ? current.giftDiamonds : "",
            ticketUsed: current.fanId ? current.ticketUsed : "",
            depositAmount: current.fanId ? current.depositAmount : "",
            manualAdjustment: current.fanId ? current.manualAdjustment : "0",
            status: current.fanId ? current.status : "normal",
            tieOrder: current.tieOrder || String(result.entries.length + 1),
            note: current.fanId ? current.note : ""
          };
        }
        return {
          ...current,
          fanId: preferredFanId,
          giftDiamonds: String(currentEntry.giftDiamonds),
          ticketUsed: String(currentEntry.ticketUsed),
          depositAmount: String(currentEntry.ticketDeposit),
          manualAdjustment: String(currentEntry.manualAdjustment),
          status: currentEntry.status,
          tieOrder: String(currentEntry.tieOrder || ""),
          note: currentEntry.note || ""
        };
      });
    },
    [activeSessionId]
  );

  useEffect(() => {
    if (account) {
      loadSessionList()
        .then(() => loadBoard(contextSessionId || activeSessionId))
        .catch((error) => setNotice(error instanceof Error ? error.message : "加载榜单失败"));
    }
  }, [account, activeSessionId, contextSessionId, loadBoard, loadSessionList]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const snapshot = snapshots.find((item) => item.status === "countdown");
    if (!snapshot?.countdownEndsAt) return;
    const left = Math.max(0, Math.floor((new Date(snapshot.countdownEndsAt).getTime() - nowTick) / 1000));
    if (left === 0) {
      loadBoard(activeSessionId).catch((error) => setNotice(error instanceof Error ? error.message : "自动冻结刷新失败"));
    }
  }, [activeSessionId, loadBoard, nowTick, snapshots]);

  if (!account) {
    return (
      <section className="panel">
        <div className="panel-header">
          <h2>榜单/定榜</h2>
          <span>未登录</span>
        </div>
        <p className="muted">请先登录后再管理榜单。</p>
      </section>
    );
  }

  const activeSnapshot = snapshots.find((snapshot) => snapshot.id === activeSnapshotId) ?? snapshots[0];
  const selectedFan = fans.find((fan) => fan.id === entryForm.fanId);
  const quickGift = toInteger(entryForm.giftDiamonds);
  const quickTicket = toInteger(entryForm.ticketUsed);
  const quickDeposit = toInteger(entryForm.depositAmount);
  const quickAdjustment = toInteger(entryForm.manualAdjustment);
  const previewScore = quickGift + quickTicket - quickDeposit + quickAdjustment;
  const previewBalance = selectedFan ? selectedFan.cachedTicketBalance + quickDeposit - quickTicket : 0;
  const normalEntries = boardEntries.filter((entry) => entry.status === "normal");
  const newFanEntries = boardEntries.filter((entry) => entry.status === "new_fan");
  const pendingEntries = boardEntries.filter((entry) => entry.status === "pending");
  const awayEntries = boardEntries.filter((entry) => entry.status === "away");
  const blockedEntries = boardEntries.filter((entry) => entry.status === "blocked");
  const countdownSnapshot = snapshots.find((item) => item.status === "countdown");
  const countdownLeft = countdownSnapshot?.countdownEndsAt
    ? Math.max(0, Math.floor((new Date(countdownSnapshot.countdownEndsAt).getTime() - nowTick) / 1000))
    : 0;
  const isBoardReadOnly = session?.status === "settled" || session?.status === "cancelled";

  function patchRankingForm(key: keyof RankingForm, value: string) {
    setRankingForm((current) => ({ ...current, [key]: value }));
  }

  function patchEntryForm(key: keyof RankingEntryForm, value: string) {
    setEntryForm((current) => ({ ...current, [key]: value }));
  }

  function selectBoardFan(fanId: string) {
    const currentEntry = boardEntries.find((entry) => entry.fanId === fanId);
    setEntryForm((current) => ({
      ...current,
      fanId,
      giftDiamonds: currentEntry ? String(currentEntry.giftDiamonds) : "",
      ticketUsed: currentEntry ? String(currentEntry.ticketUsed) : "",
      depositAmount: currentEntry ? String(currentEntry.ticketDeposit) : "",
      manualAdjustment: currentEntry ? String(currentEntry.manualAdjustment) : "0",
      status: currentEntry?.status ?? "normal",
      tieOrder: currentEntry ? String(currentEntry.tieOrder || "") : "",
      note: currentEntry?.note ?? ""
    }));
  }

  async function saveBoardEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isBoardReadOnly) {
      setNotice("已结算或已取消的场次不能继续编辑本场榜单。");
      return;
    }
    if (!activeSessionId) {
      setNotice("请先选择场次。");
      return;
    }

    setIsLoading(true);
    setNotice("");
    try {
      await apiRequest<{ ok: boolean }>("/api/session-board/entries", {
        method: "POST",
        body: JSON.stringify({
          sessionId: activeSessionId,
          fanId: entryForm.fanId,
          giftDiamonds: quickGift,
          ticketUsed: quickTicket,
          ticketDeposit: quickDeposit,
          manualAdjustment: quickAdjustment,
          status: entryForm.status,
          tieOrder: Number(entryForm.tieOrder || 0),
          note: entryForm.note
        })
      });
      setNotice("本场榜单草稿已更新，取票和存票会在确认结算后正式入账。");
      await loadBoard(activeSessionId);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "保存失败");
    } finally {
      setIsLoading(false);
    }
  }

  async function createRanking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setNotice("");

    try {
      const result = await apiRequest<{ ok: boolean; id: string }>("/api/rankings", {
        method: "POST",
        body: JSON.stringify({
          sessionId: activeSessionId,
          roundNo: Number(rankingForm.roundNo || 0),
          title: rankingForm.title,
          style: rankingForm.style,
          note: rankingForm.note
        })
      });
      setActiveSnapshotId(result.id);
      setNotice("定榜记录已创建，可以开始倒计时。");
      setRankingForm((current) => ({ ...current, title: "", note: "", roundNo: "" }));
      await loadBoard(activeSessionId);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "创建定榜失败");
    } finally {
      setIsLoading(false);
    }
  }

  async function updateSnapshotStatus(snapshotId: string, action: "start_countdown" | "freeze" | "reopen") {
    setIsLoading(true);
    setNotice("");
    try {
      await apiRequest<{ ok: boolean }>(`/api/rankings/${snapshotId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ action, seconds: 180 })
      });
      setNotice(
        action === "start_countdown" ? "三分钟倒计时已开始。" : action === "freeze" ? "已按当前榜单重新冻结。" : "已重新打开。"
      );
      await loadBoard(activeSessionId);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "操作失败");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="ranking-workbench">
      <div className="panel form-panel">
        <div className="panel-header">
          <h2>本场榜单草稿</h2>
          <span>{session ? sessionStatusLabel(session.status) : "未选择"}</span>
        </div>

        <label>
          当前场次
          <select
            onChange={(event) => {
              setActiveSessionId(event.target.value);
              setRankingForm((current) => ({ ...current, sessionId: event.target.value }));
              loadBoard(event.target.value).catch((error) => setNotice(error instanceof Error ? error.message : "切换场次失败"));
            }}
            value={activeSessionId}
          >
            {sessions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title} · {sessionStatusLabel(item.status)}
              </option>
            ))}
          </select>
        </label>

        <form className="form-panel nested-form" onSubmit={saveBoardEntry}>
          <div className="panel-header">
            <h2>快速编辑</h2>
            <span>{selectedFan ? `当前余额 ${selectedFan.cachedTicketBalance}` : "粉丝"}</span>
          </div>

          <label>
            粉丝
            <select onChange={(event) => selectBoardFan(event.target.value)} required value={entryForm.fanId}>
              {fans.map((fan) => (
                <option key={fan.id} value={fan.id}>
                  {fan.displayName}（余额 {fan.cachedTicketBalance}）
                </option>
              ))}
            </select>
          </label>

          <div className="score-grid">
            <label>
              礼物钻
              <input inputMode="numeric" onChange={(event) => patchEntryForm("giftDiamonds", event.target.value)} placeholder="0" value={entryForm.giftDiamonds} />
            </label>
            <label>
              取票
              <input inputMode="numeric" onChange={(event) => patchEntryForm("ticketUsed", event.target.value)} placeholder="0" value={entryForm.ticketUsed} />
            </label>
            <label>
              存票
              <input inputMode="numeric" onChange={(event) => patchEntryForm("depositAmount", event.target.value)} placeholder="0" value={entryForm.depositAmount} />
            </label>
            <label>
              调整
              <input inputMode="numeric" onChange={(event) => patchEntryForm("manualAdjustment", event.target.value)} value={entryForm.manualAdjustment} />
            </label>
          </div>

          <div className="score-preview">
            <span>本场总票：{previewScore}</span>
            <span>预计结算后余额：{selectedFan ? previewBalance : "未选择粉丝"}</span>
            <span>取票和存票会在确认结算后正式入账。</span>
          </div>

          <label>
            状态
            <select onChange={(event) => patchEntryForm("status", event.target.value)} value={entryForm.status}>
              <option value="normal">正常竞争</option>
              <option value="new_fan">本场新粉</option>
              <option value="away">有事不来</option>
              <option value="pending">待定</option>
              <option value="blocked">禁赛</option>
            </select>
          </label>

          <label>
            同票顺序
            <input inputMode="numeric" onChange={(event) => patchEntryForm("tieOrder", event.target.value)} placeholder="同票时按这个顺序" value={entryForm.tieOrder} />
          </label>

          <label>
            备注
            <textarea onChange={(event) => patchEntryForm("note", event.target.value)} placeholder="例如：临时不玩、补票约定、游戏名" rows={2} value={entryForm.note} />
          </label>

          <button className="primary-button" disabled={isLoading || isBoardReadOnly || !activeSessionId || !fans.length} type="submit">
            保存本场榜单
          </button>
          {notice ? <p className="notice">{notice}</p> : null}
        </form>

        <form className="form-panel nested-form" onSubmit={createRanking}>
          <div className="panel-header">
            <h2>开始定榜</h2>
            <span>{countdownSnapshot ? `倒计时 ${formatDuration(countdownLeft)}` : "默认 3:00"}</span>
          </div>

          <label>
            定榜编号
            <input inputMode="numeric" onChange={(event) => patchRankingForm("roundNo", event.target.value)} placeholder="留空自动接着编号" value={rankingForm.roundNo} />
          </label>
          <label>
            定榜规则
            <select onChange={(event) => patchRankingForm("style", event.target.value)} value={rankingForm.style}>
              {rankingStyleOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            定榜名称
            <input onChange={(event) => patchRankingForm("title", event.target.value)} placeholder="留空自动生成" value={rankingForm.title} />
          </label>
          <button className="primary-button" disabled={isLoading || !activeSessionId} type="submit">
            创建定榜记录
          </button>
        </form>
      </div>

      <section className="panel ranking-board-panel">
        <div className="panel-header">
          <h2>实时榜单</h2>
          <span>{boardEntries.length}</span>
        </div>

        <BoardEntryGroup title="正常竞争榜" entries={normalEntries} />
        <BoardEntryGroup title="本场新粉" entries={newFanEntries} emptyText="当前没有本场新粉。" />
        <BoardEntryGroup title="待定" entries={pendingEntries} emptyText="没有待定粉丝。" />
        <BoardEntryGroup title="有事不来" entries={awayEntries} emptyText="没有标记有事不来的粉丝。" />
        <BoardEntryGroup title="禁赛/拉黑" entries={blockedEntries} emptyText="没有禁赛粉丝。" />

        <div className="ranking-group">
          <div className="ranking-group-title">
            <strong>定榜记录</strong>
            <span>{snapshots.length}</span>
          </div>
          {snapshots.length === 0 ? (
            <p className="muted">还没有定榜记录。</p>
          ) : (
            <div className="account-list">
              {snapshots.map((snapshot) => {
                const left = snapshot.countdownEndsAt
                  ? Math.max(0, Math.floor((new Date(snapshot.countdownEndsAt).getTime() - nowTick) / 1000))
                  : 0;
                return (
                  <article className="account-row fan-row" key={snapshot.id}>
                    <div>
                      <strong>
                        第 {snapshot.roundNo} 次 · {snapshot.title}
                      </strong>
                      <span>
                        {rankingStyleLabel(snapshot.style)} · {rankingStatusLabel(snapshot.status)}
                        {snapshot.status === "countdown" ? ` · 剩余 ${formatDuration(left)}` : ""}
                      </span>
                      <span>冻结：{formatDateTime(snapshot.frozenAt)}</span>
                    </div>
                    <div className="row-actions">
                      <button
                        className="secondary-button"
                        disabled={isLoading || snapshot.status === "countdown"}
                        onClick={() => updateSnapshotStatus(snapshot.id, "start_countdown")}
                        type="button"
                      >
                        开始三分钟
                      </button>
                      <button
                        className="secondary-button"
                        disabled={isLoading}
                        onClick={() => updateSnapshotStatus(snapshot.id, "freeze")}
                        type="button"
                      >
                        按当前榜单冻结
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </section>
  );
}

function RankingEntryGroup({
  title,
  entries,
  emptyText = "当前分区还没有粉丝。"
}: {
  title: string;
  entries: RankingEntryItem[];
  emptyText?: string;
}) {
  return (
    <div className="ranking-group">
      <div className="ranking-group-title">
        <strong>{title}</strong>
        <span>{entries.length}</span>
      </div>
      {entries.length === 0 ? (
        <p className="muted">{emptyText}</p>
      ) : (
        <div className="account-list">
          {entries.map((entry, index) => (
            <article className="account-row fan-row ranking-row" key={entry.id}>
              <div>
                <strong>
                  #{index + 1} {entry.displayNameAtTime} · {seatDecisionLabel(entry.seatDecision)}
                </strong>
                <span>
                  总票数：{entry.competitionScore} = 礼物 {entry.giftDiamonds} + 取票 {entry.ticketUsed} + 调整{" "}
                  {entry.manualAdjustment}
                </span>
                <span>
                  粉丝类型：{fanTypeLabel(entry.fanTypeAtTime)} · 同票顺序：{entry.rankOrder}
                </span>
                {entry.note ? <span>备注：{entry.note}</span> : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function BoardEntryGroup({
  title,
  entries,
  emptyText = "当前分区还没有粉丝。"
}: {
  title: string;
  entries: BoardEntryItem[];
  emptyText?: string;
}) {
  return (
    <div className="ranking-group">
      <div className="ranking-group-title">
        <strong>{title}</strong>
        <span>{entries.length}</span>
      </div>
      {entries.length === 0 ? (
        <p className="muted">{emptyText}</p>
      ) : (
        <div className="board-table">
          <div className="board-table-head">
            <span>粉丝 / 总票</span>
            <span>票数明细</span>
            <span>余额预览</span>
            <span>备注</span>
          </div>
          {entries.map((entry, index) => (
            <article className="board-row" key={entry.id}>
              <div>
                <strong>
                  #{index + 1} {entry.displayName} {entry.competitionScore}
                </strong>
                <span>
                  {boardStatusLabel(entry.status)} · 同票顺序 {entry.tieOrder || "-"}
                </span>
              </div>
              <div>
                <span>
                  礼物 {entry.giftDiamonds} + 取票 {entry.ticketUsed} - 存票 {entry.ticketDeposit} + 调整{" "}
                  {entry.manualAdjustment}
                </span>
              </div>
              <div>
                <span>
                  {entry.cachedTicketBalance} 到 {entry.balancePreview}
                </span>
              </div>
              <div>{entry.note ? <span>{entry.note}</span> : <span className="muted">无</span>}</div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function LiveSessionFields({
  form,
  includeStatus,
  onChange
}: {
  form: LiveSessionForm;
  includeStatus: boolean;
  onChange: (key: keyof LiveSessionForm, value: string) => void;
}) {
  return (
    <>
      <label>
        场次标题
        <input onChange={(event) => onChange("title", event.target.value)} required value={form.title} />
      </label>
      <label>
        场次类型
        <select onChange={(event) => onChange("sessionType", event.target.value)} value={form.sessionType}>
          {sessionTypeOptions.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {includeStatus ? (
        <label>
          场次状态
          <select onChange={(event) => onChange("status", event.target.value)} value={form.status}>
            {sessionStatusOptions.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label>
        备注
        <textarea onChange={(event) => onChange("note", event.target.value)} placeholder="可选" rows={3} value={form.note} />
      </label>
    </>
  );
}

function FanManager({ account }: { account: Account | null }) {
  const [items, setItems] = useState<FanItem[]>([]);
  const [streamers, setStreamers] = useState<StreamerOption[]>([]);
  const [activeStreamerId, setActiveStreamerId] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [form, setForm] = useState<FanForm>(emptyFanForm);
  const [editForm, setEditForm] = useState<FanForm>(emptyFanForm);
  const [editingFanId, setEditingFanId] = useState("");
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const loadFans = useCallback(
    async (streamerId = "", q = "", status = "") => {
      const params = new URLSearchParams();
      if (streamerId) params.set("streamerId", streamerId);
      if (q.trim()) params.set("q", q.trim());
      if (status) params.set("status", status);

      const result = await apiRequest<{
        items: FanItem[];
        streamers: StreamerOption[];
        activeStreamerId: string | null;
      }>(`/api/fans?${params.toString()}`);
      setItems(result.items);
      setStreamers(result.streamers);
      setActiveStreamerId(result.activeStreamerId ?? "");
    },
    []
  );

  useEffect(() => {
    loadFans().catch((error) => setNotice(error instanceof Error ? error.message : "加载失败"));
  }, [loadFans]);

  if (!account) {
    return (
      <section className="panel">
        <div className="panel-header">
          <h2>粉丝资料</h2>
          <span>未登录</span>
        </div>
        <p className="muted">请先登录后再管理粉丝资料。</p>
      </section>
    );
  }

  function patchForm(key: keyof FanForm, value: FanForm[keyof FanForm]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function patchEditForm(key: keyof FanForm, value: FanForm[keyof FanForm]) {
    setEditForm((current) => ({ ...current, [key]: value }));
  }

  function toggleStatus(statuses: string[], status: string) {
    return statuses.includes(status)
      ? statuses.filter((item) => item !== status)
      : [...statuses, status];
  }

  function toForm(item: FanItem): FanForm {
    return {
      displayName: item.displayName,
      douyinName: item.douyinName ?? "",
      wechatName: item.wechatName ?? "",
      gameName: item.gameName ?? "",
      fanGroupLevel: item.fanGroupLevel ?? "",
      statuses: item.statuses,
      isPublicInBalanceBoard: item.isPublicInBalanceBoard,
      publicName: item.publicName ?? "",
      note: item.note ?? ""
    };
  }

  async function createFan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setNotice("");

    try {
      await apiRequest<{ ok: boolean; id: string }>("/api/fans", {
        method: "POST",
        body: JSON.stringify({ ...form, streamerId: activeStreamerId })
      });
      setNotice("粉丝资料已创建。");
      setForm(emptyFanForm);
      await loadFans(activeStreamerId, query, statusFilter);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "创建失败");
    } finally {
      setIsLoading(false);
    }
  }

  async function saveFan(fanId: string) {
    setIsLoading(true);
    setNotice("");

    try {
      await apiRequest<{ ok: boolean }>(`/api/fans/${fanId}`, {
        method: "PATCH",
        body: JSON.stringify(editForm)
      });
      setNotice("粉丝资料已更新。");
      setEditingFanId("");
      await loadFans(activeStreamerId, query, statusFilter);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "保存失败");
    } finally {
      setIsLoading(false);
    }
  }

  async function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    await loadFans(activeStreamerId, query, statusFilter).catch((error) =>
      setNotice(error instanceof Error ? error.message : "筛选失败")
    );
  }

  return (
    <section className="settings-grid">
      <form className="panel form-panel" onSubmit={createFan}>
        <div className="panel-header">
          <h2>创建粉丝资料</h2>
          <span>{account.role === "admin" ? "可代操作" : "主播端"}</span>
        </div>

        {account.role === "admin" ? (
          <label>
            所属主播
            <select
              onChange={(event) => {
                setActiveStreamerId(event.target.value);
                loadFans(event.target.value, query, statusFilter).catch((error) =>
                  setNotice(error instanceof Error ? error.message : "切换主播失败")
                );
              }}
              value={activeStreamerId}
            >
              {streamers.map((streamer) => (
                <option key={streamer.id} value={streamer.id}>
                  {streamer.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <FanFields
          form={form}
          onChange={patchForm}
          onToggleStatus={(status) => patchForm("statuses", toggleStatus(form.statuses, status))}
        />

        <button className="primary-button" disabled={isLoading || !activeStreamerId} type="submit">
          {isLoading ? "处理中..." : "创建粉丝"}
        </button>

        {notice ? <p className="notice">{notice}</p> : null}
      </form>

      <section className="panel list-panel">
        <div className="panel-header">
          <h2>粉丝资料</h2>
          <span>{items.length}</span>
        </div>

        <form className="filter-bar" onSubmit={applyFilters}>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索昵称、抖音、微信、游戏名"
            value={query}
          />
          <select onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
            <option value="">全部状态</option>
            {fanStatusOptions.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
          <button className="secondary-button" type="submit">
            筛选
          </button>
        </form>

        {items.length === 0 ? (
          <p className="muted">还没有粉丝资料。</p>
        ) : (
          <div className="account-list">
            {items.map((item) => (
              <article className="account-row fan-row" key={item.id}>
                {editingFanId === item.id ? (
                  <div className="fan-edit">
                    <FanFields
                      form={editForm}
                      onChange={patchEditForm}
                      onToggleStatus={(status) =>
                        patchEditForm("statuses", toggleStatus(editForm.statuses, status))
                      }
                    />
                  </div>
                ) : (
                  <div>
                    <strong>{item.displayName}</strong>
                    <span>
                      抖音：{item.douyinName || "未填"} · 微信：{item.wechatName || "未填"} · 游戏名：
                      {item.gameName || "未填"}
                    </span>
                    <span>粉丝团：{item.fanGroupLevel || "未填"} · 存票余额：{item.cachedTicketBalance}</span>
                    <span>
                      状态：
                      {item.statuses.length
                        ? item.statuses
                            .map((status) => fanStatusOptions.find((option) => option.key === status)?.label ?? status)
                            .join("、")
                        : "无"}
                    </span>
                    <span>
                      公开存票榜：{item.isPublicInBalanceBoard ? `公开为 ${item.publicName || item.displayName}` : "不公开"}
                    </span>
                    {item.note ? <span>备注：{item.note}</span> : null}
                  </div>
                )}

                <div className="row-actions">
                  {editingFanId === item.id ? (
                    <>
                      <button className="secondary-button" disabled={isLoading} onClick={() => saveFan(item.id)} type="button">
                        保存
                      </button>
                      <button className="secondary-button" disabled={isLoading} onClick={() => setEditingFanId("")} type="button">
                        取消
                      </button>
                    </>
                  ) : (
                    <button
                      className="secondary-button"
                      disabled={isLoading}
                      onClick={() => {
                        setEditingFanId(item.id);
                        setEditForm(toForm(item));
                        setNotice("");
                      }}
                      type="button"
                    >
                      编辑
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

function FanFields({
  form,
  onChange,
  onToggleStatus
}: {
  form: FanForm;
  onChange: (key: keyof FanForm, value: FanForm[keyof FanForm]) => void;
  onToggleStatus: (status: string) => void;
}) {
  return (
    <>
      <label>
        粉丝名称
        <input onChange={(event) => onChange("displayName", event.target.value)} required value={form.displayName} />
      </label>
      <label>
        抖音名
        <input onChange={(event) => onChange("douyinName", event.target.value)} placeholder="可选" value={form.douyinName} />
      </label>
      <label>
        微信名
        <input onChange={(event) => onChange("wechatName", event.target.value)} placeholder="可选" value={form.wechatName} />
      </label>
      <label>
        游戏名
        <input onChange={(event) => onChange("gameName", event.target.value)} placeholder="可选" value={form.gameName} />
      </label>
      <label>
        粉丝团等级
        <input onChange={(event) => onChange("fanGroupLevel", event.target.value)} placeholder="例如 12" value={form.fanGroupLevel} />
      </label>

      <fieldset className="check-group">
        <legend>粉丝状态</legend>
        {fanStatusOptions.map((option) => (
          <label key={option.key}>
            <input
              checked={form.statuses.includes(option.key)}
              onChange={() => onToggleStatus(option.key)}
              type="checkbox"
            />
            {option.label}
          </label>
        ))}
      </fieldset>

      <label className="inline-check">
        <input
          checked={form.isPublicInBalanceBoard}
          onChange={(event) => onChange("isPublicInBalanceBoard", event.target.checked)}
          type="checkbox"
        />
        允许显示在游客公开存票榜
      </label>

      <label>
        公开名称
        <input
          onChange={(event) => onChange("publicName", event.target.value)}
          placeholder="留空默认用粉丝名称"
          value={form.publicName}
        />
      </label>

      <label>
        备注
        <textarea onChange={(event) => onChange("note", event.target.value)} placeholder="可选" rows={3} value={form.note} />
      </label>
    </>
  );
}

function SettingsView({ account }: { account: Account | null }) {
  if (!account) {
    return (
      <section className="panel">
        <div className="panel-header">
          <h2>设置</h2>
          <span>未登录</span>
        </div>
        <p className="muted">请先登录后再管理设置。</p>
      </section>
    );
  }

  if (account.role !== "admin") {
    return (
      <section className="panel">
        <div className="panel-header">
          <h2>设置</h2>
          <span>无权限</span>
        </div>
        <p className="muted">当前账号不是管理员，不能管理主播账号。</p>
      </section>
    );
  }

  return <StreamerAccountManager />;
}

function StreamerAccountManager() {
  const [items, setItems] = useState<StreamerAccountItem[]>([]);
  const [streamerName, setStreamerName] = useState("");
  const [douyinName, setDouyinName] = useState("");
  const [streamerUsername, setStreamerUsername] = useState("");
  const [streamerDisplayName, setStreamerDisplayName] = useState("");
  const [streamerPassword, setStreamerPassword] = useState("");
  const [note, setNote] = useState("");
  const [notice, setNotice] = useState("");
  const [generatedPassword, setGeneratedPassword] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [editingStreamerId, setEditingStreamerId] = useState("");
  const [editForm, setEditForm] = useState({
    streamerName: "",
    douyinName: "",
    username: "",
    displayName: "",
    note: ""
  });
  const [isLoading, setIsLoading] = useState(false);

  const loadItems = useCallback(async () => {
    const result = await apiRequest<{ items: StreamerAccountItem[] }>("/api/admin/streamer-accounts");
    setItems(result.items);
  }, []);

  useEffect(() => {
    loadItems().catch((error) => setNotice(error instanceof Error ? error.message : "加载失败"));
  }, [loadItems]);

  async function createStreamerAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setNotice("");
    setGeneratedPassword("");
    setResetPassword("");

    try {
      const result = await apiRequest<{
        generatedPassword: string | null;
      }>("/api/admin/streamer-accounts", {
        method: "POST",
        body: JSON.stringify({
          streamerName,
          douyinName,
          username: streamerUsername,
          displayName: streamerDisplayName,
          password: streamerPassword,
          note
        })
      });

      setNotice("主播账号已创建。");
      setGeneratedPassword(result.generatedPassword ?? "");
      setStreamerName("");
      setDouyinName("");
      setStreamerUsername("");
      setStreamerDisplayName("");
      setStreamerPassword("");
      setNote("");
      await loadItems();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "创建失败");
    } finally {
      setIsLoading(false);
    }
  }

  async function updateStatus(accountId: string, status: "active" | "disabled") {
    setIsLoading(true);
    setNotice("");
    setResetPassword("");

    try {
      await apiRequest<{ ok: boolean }>(`/api/admin/accounts/${accountId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status })
      });
      setNotice(status === "active" ? "账号已启用。" : "账号已停用。");
      await loadItems();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "操作失败");
    } finally {
      setIsLoading(false);
    }
  }

  async function resetAccountPassword(accountId: string, username: string) {
    setIsLoading(true);
    setNotice("");
    setGeneratedPassword("");
    setResetPassword("");

    try {
      const result = await apiRequest<{ password: string }>(
        `/api/admin/accounts/${accountId}/reset-password`,
        {
          method: "POST",
          body: "{}"
        }
      );
      setNotice(`已重置 ${username} 的密码。`);
      setResetPassword(result.password);
      await loadItems();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "重置失败");
    } finally {
      setIsLoading(false);
    }
  }

  function startEdit(item: StreamerAccountItem) {
    setEditingStreamerId(item.streamer.id);
    setEditForm({
      streamerName: item.streamer.name,
      douyinName: item.streamer.douyinName ?? "",
      username: item.account?.username ?? "",
      displayName: item.account?.displayName ?? item.streamer.name,
      note: item.streamer.note ?? ""
    });
    setNotice("");
    setGeneratedPassword("");
    setResetPassword("");
  }

  async function saveEdit(streamerId: string) {
    setIsLoading(true);
    setNotice("");

    try {
      await apiRequest<{ ok: boolean }>(`/api/admin/streamer-accounts/${streamerId}`, {
        method: "PATCH",
        body: JSON.stringify(editForm)
      });
      setNotice("主播账号已更新。");
      setEditingStreamerId("");
      await loadItems();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "保存失败");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="settings-grid">
      <form className="panel form-panel" onSubmit={createStreamerAccount}>
        <div className="panel-header">
          <h2>创建主播账号</h2>
          <span>管理员</span>
        </div>

        <label>
          主播名称
          <input
            onChange={(event) => setStreamerName(event.target.value)}
            placeholder="例如 主播小号"
            required
            value={streamerName}
          />
        </label>

        <label>
          抖音名
          <input
            onChange={(event) => setDouyinName(event.target.value)}
            placeholder="可选"
            value={douyinName}
          />
        </label>

        <label>
          登录账号
          <input
            autoComplete="off"
            onChange={(event) => setStreamerUsername(event.target.value)}
            placeholder="例如 streamer01"
            required
            value={streamerUsername}
          />
        </label>

        <label>
          显示名称
          <input
            onChange={(event) => setStreamerDisplayName(event.target.value)}
            placeholder="默认使用主播名称"
            value={streamerDisplayName}
          />
        </label>

        <label>
          初始密码
          <input
            autoComplete="new-password"
            minLength={8}
            onChange={(event) => setStreamerPassword(event.target.value)}
            placeholder="留空自动生成"
            type="password"
            value={streamerPassword}
          />
        </label>

        <label>
          备注
          <input onChange={(event) => setNote(event.target.value)} placeholder="可选" value={note} />
        </label>

        <button className="primary-button" disabled={isLoading} type="submit">
          {isLoading ? "处理中..." : "创建主播账号"}
        </button>

        {notice ? <p className="notice">{notice}</p> : null}
        {generatedPassword ? (
          <div className="secret-result">
            <span>自动生成密码</span>
            <strong>{generatedPassword}</strong>
          </div>
        ) : null}
        {resetPassword ? (
          <div className="secret-result">
            <span>重置后的新密码</span>
            <strong>{resetPassword}</strong>
          </div>
        ) : null}
      </form>

      <section className="panel list-panel">
        <div className="panel-header">
          <h2>主播账号</h2>
          <span>{items.length}</span>
        </div>

        {items.length === 0 ? (
          <p className="muted">还没有主播账号。</p>
        ) : (
          <div className="account-list">
            {items.map((item) => (
              <article className="account-row" key={item.streamer.id}>
                {editingStreamerId === item.streamer.id ? (
                  <div className="edit-grid">
                    <label>
                      主播名称
                      <input
                        onChange={(event) => setEditForm({ ...editForm, streamerName: event.target.value })}
                        value={editForm.streamerName}
                      />
                    </label>
                    <label>
                      抖音名
                      <input
                        onChange={(event) => setEditForm({ ...editForm, douyinName: event.target.value })}
                        placeholder="可选"
                        value={editForm.douyinName}
                      />
                    </label>
                    <label>
                      登录账号
                      <input
                        onChange={(event) => setEditForm({ ...editForm, username: event.target.value })}
                        value={editForm.username}
                      />
                    </label>
                    <label>
                      显示名称
                      <input
                        onChange={(event) => setEditForm({ ...editForm, displayName: event.target.value })}
                        value={editForm.displayName}
                      />
                    </label>
                    <label className="edit-note">
                      备注
                      <input
                        onChange={(event) => setEditForm({ ...editForm, note: event.target.value })}
                        placeholder="可选"
                        value={editForm.note}
                      />
                    </label>
                  </div>
                ) : (
                  <div>
                    <strong>{item.streamer.name}</strong>
                    <span>
                      {item.account?.username ?? "未绑定账号"} ·{" "}
                      {item.account?.status === "disabled" ? "已停用" : "正常"}
                    </span>
                    {item.account?.displayName ? <span>显示：{item.account.displayName}</span> : null}
                    {item.streamer.douyinName ? <span>抖音：{item.streamer.douyinName}</span> : null}
                    {item.streamer.note ? <span>备注：{item.streamer.note}</span> : null}
                  </div>
                )}

                {item.account ? (
                  <div className="row-actions">
                    {editingStreamerId === item.streamer.id ? (
                      <>
                        <button
                          className="secondary-button"
                          disabled={isLoading}
                          onClick={() => saveEdit(item.streamer.id)}
                          type="button"
                        >
                          保存
                        </button>
                        <button
                          className="secondary-button"
                          disabled={isLoading}
                          onClick={() => setEditingStreamerId("")}
                          type="button"
                        >
                          取消
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="secondary-button"
                          disabled={isLoading}
                          onClick={() => startEdit(item)}
                          type="button"
                        >
                          编辑
                        </button>
                        <button
                          className="secondary-button"
                          disabled={isLoading}
                          onClick={() => resetAccountPassword(item.account!.id, item.account!.username)}
                          type="button"
                        >
                          重置密码
                        </button>
                        <button
                          className="secondary-button"
                          disabled={isLoading}
                          onClick={() =>
                            updateStatus(item.account!.id, item.account!.status === "disabled" ? "active" : "disabled")
                          }
                          type="button"
                        >
                          {item.account.status === "disabled" ? "启用" : "停用"}
                        </button>
                      </>
                    )}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}