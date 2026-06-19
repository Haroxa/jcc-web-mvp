import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
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
  { key: "dashboard", label: "工作台", icon: LayoutDashboard },
  { key: "ranking", label: "定榜", icon: ClipboardList },
  { key: "locks", label: "锁牌", icon: LockKeyhole },
  { key: "tickets", label: "存票", icon: BadgeCent },
  { key: "fans", label: "粉丝", icon: Users },
  { key: "screenshots", label: "截图", icon: Camera },
  { key: "data", label: "资料", icon: Database },
  { key: "settings", label: "设置", icon: Settings }
];

const cards = [
  { title: "当前场次", value: "未开始", note: "创建下午场或晚上场后进入直播流程" },
  { title: "待结算", value: "0", note: "直播结束后确认存票入账和回退" },
  { title: "公开存票榜", value: "关闭", note: "游客只看到公开模块和公开字段" },
  { title: "截图存储", value: "暂缓", note: "R2 需绑定银行卡，当前先不启用云端截图" }
];

type ViewKey = (typeof navItems)[number]["key"];

type StreamerAccountItem = {
  streamer: {
    id: string;
    name: string;
    douyinName: string | null;
    note: string | null;
    status: string;
    createdAt: string;
    updatedAt: string;
  };
  account: {
    id: string;
    username: string;
    displayName: string;
    status: string;
    lastLoginAt: string | null;
  } | null;
};

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
  const [activeView, setActiveView] = useState<ViewKey>("dashboard");
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

  function renderContent() {
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
          {navItems.map((item) => {
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
                <div>
                  <strong>{item.streamer.name}</strong>
                  <span>
                    {item.account?.username ?? "未绑定账号"} ·{" "}
                    {item.account?.status === "disabled" ? "已停用" : "正常"}
                  </span>
                  {item.streamer.douyinName ? <span>抖音：{item.streamer.douyinName}</span> : null}
                </div>

                {item.account ? (
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
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
