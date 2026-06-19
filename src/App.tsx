import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  BadgeCent,
  Camera,
  ClipboardList,
  Database,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Settings,
  ShieldCheck,
  Users
} from "lucide-react";

type Account = {
  id: string;
  role: "admin" | "streamer";
  streamerId: string | null;
  username: string;
  displayName: string;
};

type SetupStatus = {
  needsAdminSetup: boolean;
  requiresSetupToken: boolean;
};

const navItems = [
  { label: "工作台", icon: LayoutDashboard },
  { label: "定榜", icon: ClipboardList },
  { label: "锁牌", icon: LockKeyhole },
  { label: "存票", icon: BadgeCent },
  { label: "粉丝", icon: Users },
  { label: "截图", icon: Camera },
  { label: "资料", icon: Database },
  { label: "设置", icon: Settings }
];

const cards = [
  { title: "当前场次", value: "未开始", note: "创建下午场或晚上场后进入直播流程" },
  { title: "待结算", value: "0", note: "直播结束后确认存票入账和回退" },
  { title: "公开存票榜", value: "关闭", note: "游客只看到公开模块和公开字段" },
  { title: "截图存储", value: "暂缓", note: "R2 需绑定银行卡，当前先不启用云端截图" }
];

async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers
    }
  });
  const data = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(data.error ?? "请求失败");
  }

  return data;
}

export function App() {
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const [message, setMessage] = useState("正在检查登录状态...");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isApiUnavailable, setIsApiUnavailable] = useState(false);

  const isSetupMode = Boolean(setupStatus?.needsAdminSetup);
  const authTitle = useMemo(() => (isSetupMode ? "初始化管理员" : "登录后台"), [isSetupMode]);

  useEffect(() => {
    async function bootstrap() {
      try {
        const [status, me] = await Promise.all([
          apiRequest<SetupStatus>("/api/setup/status"),
          apiRequest<{ account: Account | null }>("/api/auth/me")
        ]);

        setSetupStatus(status);
        setAccount(me.account);
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
        setSetupStatus({ needsAdminSetup: false, requiresSetupToken: false });
        setMessage("管理员已创建，请使用该账号登录。");
      } else {
        const result = await apiRequest<{ account: Account }>("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({ username, password })
        });
        setAccount(result.account);
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
    setMessage("已登出。");
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
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button className="nav-item" key={item.label} type="button">
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
            <h1>直播管理工作台</h1>
            <p className="header-copy">
              {isApiUnavailable
                ? "当前页面已加载，后端 Worker API 尚未连接；本地联调时启动 Worker 后可初始化管理员和登录。"
                : "当前已接入管理员初始化、登录状态识别和单账号单设备会话基础。"}
            </p>
          </div>
          <div className="header-actions">
            <button className="primary-button" type="button">
              创建直播场次
            </button>
            {account ? (
              <button className="icon-button" onClick={logout} title="登出" type="button">
                <LogOut size={18} />
              </button>
            ) : null}
          </div>
        </header>

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
      </main>
    </div>
  );
}
