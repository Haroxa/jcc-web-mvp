import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgeCent,
  Camera,
  CalendarDays,
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
  { key: "sessions", label: "场次", icon: CalendarDays },
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

type StreamerOption = {
  id: string;
  name: string;
};

type FanItem = {
  id: string;
  streamerId: string;
  displayName: string;
  douyinName: string | null;
  wechatName: string | null;
  gameName: string | null;
  fanGroupLevel: string | null;
  statuses: string[];
  isPublicInBalanceBoard: boolean;
  publicName: string | null;
  cachedTicketBalance: number;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

type LiveSessionItem = {
  id: string;
  streamerId: string;
  streamerName: string | null;
  title: string;
  sessionType: string;
  status: string;
  startedAt: string | null;
  endedAt: string | null;
  settledAt: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

type LiveSessionForm = {
  title: string;
  sessionType: string;
  status: string;
  note: string;
};

type TicketLedgerItem = {
  id: string;
  streamerId: string;
  fanId: string;
  fanName: string;
  sessionId: string | null;
  sessionTitle: string | null;
  type: string;
  amount: number;
  affectsBalance: boolean;
  affectsCompetition: boolean;
  status: string;
  note: string | null;
  createdByName: string | null;
  createdAt: string;
  voidedAt: string | null;
};

type TicketForm = {
  fanId: string;
  sessionId: string;
  type: string;
  amount: string;
  note: string;
};

type RankingSnapshotItem = {
  id: string;
  sessionId: string;
  sessionTitle: string;
  streamerId: string;
  title: string;
  roundNo: number;
  style: string;
  status: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

type RankingEntryItem = {
  id: string;
  rankingSnapshotId: string;
  fanId: string | null;
  displayNameAtTime: string;
  rankOrder: number;
  giftDiamonds: number;
  ticketUsed: number;
  manualAdjustment: number;
  competitionScore: number;
  fanTypeAtTime: string;
  seatDecision: string;
  note: string | null;
};

type RankingForm = {
  sessionId: string;
  title: string;
  style: string;
  note: string;
};

type RankingEntryForm = {
  fanId: string;
  rankOrder: string;
  giftDiamonds: string;
  ticketUsed: string;
  manualAdjustment: string;
  note: string;
};

const emptyLiveSessionForm: LiveSessionForm = {
  title: "",
  sessionType: "afternoon",
  status: "preparing",
  note: ""
};

const sessionTypeOptions = [
  { key: "afternoon", label: "下午场" },
  { key: "evening", label: "晚上场" },
  { key: "custom", label: "自定义" }
];

const sessionStatusOptions = [
  { key: "preparing", label: "准备中" },
  { key: "live", label: "进行中" },
  { key: "pending_settlement", label: "待结算" },
  { key: "settled", label: "已结算" },
  { key: "cancelled", label: "已取消" }
];

const ticketTypeOptions = [
  { key: "deposit", label: "存票" },
  { key: "withdraw", label: "取票" },
  { key: "gift", label: "现刷" },
  { key: "adjustment", label: "修正" }
];

const rankingStyleOptions = [
  { key: "top7", label: "定榜七" },
  { key: "top5", label: "定榜五" }
];

type FanForm = {
  displayName: string;
  douyinName: string;
  wechatName: string;
  gameName: string;
  fanGroupLevel: string;
  statuses: string[];
  isPublicInBalanceBoard: boolean;
  publicName: string;
  note: string;
};

const emptyFanForm: FanForm = {
  displayName: "",
  douyinName: "",
  wechatName: "",
  gameName: "",
  fanGroupLevel: "",
  statuses: [],
  isPublicInBalanceBoard: false,
  publicName: "",
  note: ""
};

const fanStatusOptions = [
  { key: "new_fan", label: "新粉" },
  { key: "old_fan", label: "老粉" },
  { key: "manager", label: "管理" },
  { key: "violated", label: "违规" },
  { key: "blacklisted", label: "拉黑" }
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
            <button className="primary-button" onClick={() => setActiveView("sessions")} type="button">
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

function TicketManager({ account }: { account: Account | null }) {
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
      sessionId: current.sessionId || result.sessions[0]?.id || ""
    }));
  }, []);

  useEffect(() => {
    loadTickets().catch((error) => setNotice(error instanceof Error ? error.message : "加载失败"));
  }, [loadTickets]);

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

function RankingManager({ account }: { account: Account | null }) {
  const [snapshots, setSnapshots] = useState<RankingSnapshotItem[]>([]);
  const [entries, setEntries] = useState<RankingEntryItem[]>([]);
  const [sessions, setSessions] = useState<LiveSessionItem[]>([]);
  const [fans, setFans] = useState<FanItem[]>([]);
  const [streamers, setStreamers] = useState<StreamerOption[]>([]);
  const [activeStreamerId, setActiveStreamerId] = useState("");
  const [activeSnapshotId, setActiveSnapshotId] = useState("");
  const [rankingForm, setRankingForm] = useState<RankingForm>({
    sessionId: "",
    title: "",
    style: "top7",
    note: ""
  });
  const [entryForm, setEntryForm] = useState<RankingEntryForm>({
    fanId: "",
    rankOrder: "",
    giftDiamonds: "",
    ticketUsed: "",
    manualAdjustment: "0",
    note: ""
  });
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const loadRankings = useCallback(async (streamerId = "", snapshotId = "") => {
    const params = new URLSearchParams();
    if (streamerId) params.set("streamerId", streamerId);
    if (snapshotId) params.set("snapshotId", snapshotId);

    const result = await apiRequest<{
      snapshots: RankingSnapshotItem[];
      entries: RankingEntryItem[];
      sessions: LiveSessionItem[];
      fans: FanItem[];
      streamers: StreamerOption[];
      activeStreamerId: string | null;
      activeSnapshotId: string | null;
    }>(`/api/rankings?${params.toString()}`);
    setSnapshots(result.snapshots);
    setEntries(result.entries);
    setSessions(result.sessions);
    setFans(result.fans);
    setStreamers(result.streamers);
    setActiveStreamerId(result.activeStreamerId ?? "");
    setActiveSnapshotId(result.activeSnapshotId ?? "");
    setRankingForm((current) => ({
      ...current,
      sessionId: current.sessionId || result.sessions[0]?.id || ""
    }));
    setEntryForm((current) => ({
      ...current,
      fanId: current.fanId || result.fans[0]?.id || ""
    }));
  }, []);

  useEffect(() => {
    loadRankings().catch((error) => setNotice(error instanceof Error ? error.message : "加载失败"));
  }, [loadRankings]);

  if (!account) {
    return (
      <section className="panel">
        <div className="panel-header">
          <h2>定榜</h2>
          <span>未登录</span>
        </div>
        <p className="muted">请先登录后再管理定榜。</p>
      </section>
    );
  }

  function patchRankingForm(key: keyof RankingForm, value: string) {
    setRankingForm((current) => ({ ...current, [key]: value }));
  }

  function patchEntryForm(key: keyof RankingEntryForm, value: string) {
    setEntryForm((current) => ({ ...current, [key]: value }));
  }

  async function createRanking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setNotice("");

    try {
      const result = await apiRequest<{ ok: boolean; id: string }>("/api/rankings", {
        method: "POST",
        body: JSON.stringify({ ...rankingForm, streamerId: activeStreamerId })
      });
      setNotice("定榜已创建。");
      setRankingForm((current) => ({ ...current, title: "", note: "" }));
      await loadRankings(activeStreamerId, result.id);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "创建失败");
    } finally {
      setIsLoading(false);
    }
  }

  async function saveEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeSnapshotId) {
      setNotice("请先创建或选择一个定榜。");
      return;
    }

    setIsLoading(true);
    setNotice("");
    try {
      await apiRequest<{ ok: boolean }>(`/api/rankings/${activeSnapshotId}/entries`, {
        method: "POST",
        body: JSON.stringify({
          fanId: entryForm.fanId,
          rankOrder: Number(entryForm.rankOrder),
          giftDiamonds: Number(entryForm.giftDiamonds || 0),
          ticketUsed: Number(entryForm.ticketUsed || 0),
          manualAdjustment: Number(entryForm.manualAdjustment || 0),
          note: entryForm.note
        })
      });
      setNotice("榜单条目已保存。");
      setEntryForm((current) => ({
        ...current,
        rankOrder: "",
        giftDiamonds: "",
        ticketUsed: "",
        manualAdjustment: "0",
        note: ""
      }));
      await loadRankings(activeStreamerId, activeSnapshotId);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "保存失败");
    } finally {
      setIsLoading(false);
    }
  }

  const activeSnapshot = snapshots.find((snapshot) => snapshot.id === activeSnapshotId);

  return (
    <section className="settings-grid">
      <div className="panel form-panel">
        <form className="form-panel nested-form" onSubmit={createRanking}>
          <div className="panel-header">
            <h2>创建定榜</h2>
            <span>{account.role === "admin" ? "可代操作" : "主播端"}</span>
          </div>

          {account.role === "admin" ? (
            <label>
              所属主播
              <select
                onChange={(event) => {
                  setActiveStreamerId(event.target.value);
                  setActiveSnapshotId("");
                  loadRankings(event.target.value).catch((error) =>
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
            关联场次
            <select onChange={(event) => patchRankingForm("sessionId", event.target.value)} required value={rankingForm.sessionId}>
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.title}
                </option>
              ))}
            </select>
          </label>

          <label>
            定榜类型
            <select onChange={(event) => patchRankingForm("style", event.target.value)} value={rankingForm.style}>
              {rankingStyleOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            定榜标题
            <input onChange={(event) => patchRankingForm("title", event.target.value)} placeholder="留空自动生成" value={rankingForm.title} />
          </label>

          <label>
            备注
            <textarea onChange={(event) => patchRankingForm("note", event.target.value)} placeholder="可选" rows={2} value={rankingForm.note} />
          </label>

          <button className="primary-button" disabled={isLoading || !sessions.length} type="submit">
            {isLoading ? "处理中..." : "创建定榜"}
          </button>
        </form>

        <form className="form-panel nested-form" onSubmit={saveEntry}>
          <div className="panel-header">
            <h2>录入榜单</h2>
            <span>{activeSnapshot ? rankingStyleLabel(activeSnapshot.style) : "未选择"}</span>
          </div>

          <label>
            当前定榜
            <select
              onChange={(event) => {
                setActiveSnapshotId(event.target.value);
                loadRankings(activeStreamerId, event.target.value).catch((error) =>
                  setNotice(error instanceof Error ? error.message : "切换定榜失败")
                );
              }}
              value={activeSnapshotId}
            >
              {snapshots.map((snapshot) => (
                <option key={snapshot.id} value={snapshot.id}>
                  {snapshot.sessionTitle} · 第 {snapshot.roundNo} 次 · {snapshot.title}
                </option>
              ))}
            </select>
          </label>

          <label>
            粉丝
            <select onChange={(event) => patchEntryForm("fanId", event.target.value)} required value={entryForm.fanId}>
              {fans.map((fan) => (
                <option key={fan.id} value={fan.id}>
                  {fan.displayName}
                </option>
              ))}
            </select>
          </label>

          <label>
            榜上顺序
            <input
              inputMode="numeric"
              onChange={(event) => patchEntryForm("rankOrder", event.target.value)}
              placeholder="总票相同时按这个顺序"
              required
              value={entryForm.rankOrder}
            />
          </label>
          <label>
            礼物钻
            <input inputMode="numeric" onChange={(event) => patchEntryForm("giftDiamonds", event.target.value)} placeholder="0" value={entryForm.giftDiamonds} />
          </label>
          <label>
            取票
            <input inputMode="numeric" onChange={(event) => patchEntryForm("ticketUsed", event.target.value)} placeholder="0" value={entryForm.ticketUsed} />
          </label>
          <label>
            调整
            <input inputMode="numeric" onChange={(event) => patchEntryForm("manualAdjustment", event.target.value)} value={entryForm.manualAdjustment} />
          </label>
          <label>
            备注
            <textarea onChange={(event) => patchEntryForm("note", event.target.value)} placeholder="可选" rows={2} value={entryForm.note} />
          </label>

          <button className="primary-button" disabled={isLoading || !activeSnapshotId || !fans.length} type="submit">
            保存条目
          </button>
          {notice ? <p className="notice">{notice}</p> : null}
        </form>
      </div>

      <section className="panel list-panel">
        <div className="panel-header">
          <h2>推荐名单</h2>
          <span>{entries.length}</span>
        </div>

        {!activeSnapshot ? (
          <p className="muted">请先创建定榜。</p>
        ) : entries.length === 0 ? (
          <p className="muted">当前定榜还没有榜单条目。</p>
        ) : (
          <div className="account-list">
            {entries.map((entry) => (
              <article className="account-row fan-row" key={entry.id}>
                <div>
                  <strong>
                    #{entry.rankOrder} {entry.displayNameAtTime} · {seatDecisionLabel(entry.seatDecision)}
                  </strong>
                  <span>
                    总票数：{entry.competitionScore} = 礼物 {entry.giftDiamonds} + 取票 {entry.ticketUsed} + 调整 {entry.manualAdjustment}
                  </span>
                  <span>粉丝类型：{fanTypeLabel(entry.fanTypeAtTime)}</span>
                  {entry.note ? <span>备注：{entry.note}</span> : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
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

function defaultSessionTitle(sessionType: string) {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;
  return `${today} ${sessionTypeLabel(sessionType)}`;
}

function sessionTypeLabel(value: string) {
  return sessionTypeOptions.find((option) => option.key === value)?.label ?? "自定义";
}

function sessionStatusLabel(value: string) {
  return sessionStatusOptions.find((option) => option.key === value)?.label ?? value;
}

function ticketTypeLabel(value: string) {
  return ticketTypeOptions.find((option) => option.key === value)?.label ?? value;
}

function rankingStyleLabel(value: string) {
  return rankingStyleOptions.find((option) => option.key === value)?.label ?? value;
}

function seatDecisionLabel(value: string) {
  if (value === "recommended") return "推荐上车";
  if (value === "waitlist") return "待定";
  if (value === "blocked") return "禁赛";
  return value;
}

function fanTypeLabel(value: string) {
  if (value === "new_fan") return "新粉";
  if (value === "old_fan") return "老粉";
  return "未标记";
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "未记录";
  }
  return new Date(value).toLocaleString("zh-CN", {
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
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
