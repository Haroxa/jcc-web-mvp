import { ReactNode, useCallback, useEffect, useState } from "react";
import { BadgeCent, Camera, ListChecks, LockKeyhole } from "lucide-react";
import { apiRequest } from "../api/client";
import type { Account, LiveSessionItem, SessionAction, StreamerOption, WorkspaceTab } from "../types";
import { formatDateTime } from "../utils/format";
import { sessionStatusLabel, sessionTypeLabel } from "../utils/labels";
import { RankingManager } from "./RankingManager";
import { TicketManager } from "./TicketManager";

export function CurrentSessionWorkspace({
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
  const stageSteps = [
    { key: "preparing", label: "准备", detail: "开始直播" },
    { key: "live", label: "直播中", detail: "维护榜单 / 定榜" },
    { key: "pending_settlement", label: "待结算", detail: "核对票数" },
    { key: "settled", label: "已结算", detail: "查看结果" }
  ];
  const activeStageIndex = stageSteps.findIndex((step) => step.key === activeSession?.status);
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

      <div className="session-stage-flow">
        {stageSteps.map((step, index) => (
          <div
            className={activeStageIndex >= 0 && index < activeStageIndex ? "done" : index === activeStageIndex ? "active" : ""}
            key={step.key}
          >
            <strong>{step.label}</strong>
            <span>{step.detail}</span>
          </div>
        ))}
      </div>

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
