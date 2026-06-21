import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "../api/client";
import { cards } from "../constants";
import type { Account, LiveSessionItem, StreamerOption } from "../types";
import { formatDateTime } from "../utils/format";
import { defaultSessionTitle, sessionStatusLabel, sessionTypeLabel } from "../utils/labels";

type AdminHomeNavigationTarget = "settings" | "fans" | "tickets" | "sessions";

export function DashboardView({
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

export function TodayWorkspace({
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

export function AdminHome({
  account,
  onNavigate,
  onOpenSession
}: {
  account: Account | null;
  onNavigate: (view: AdminHomeNavigationTarget) => void;
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
