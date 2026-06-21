import { FormEvent, useEffect, useMemo, useState } from "react";
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
import { AdminHome, DashboardView, TodayWorkspace } from "./views/HomeViews";
import { LiveSessionManager } from "./views/LiveSessionManager";
import { SettingsView } from "./views/SettingsView";
import type { Account, SetupStatus } from "./types";
import { RankingManager } from "./views/RankingManager";
import { TicketManager } from "./views/TicketManager";

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
            <p className="eyebrow">JCC 直播场次管理</p>
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
