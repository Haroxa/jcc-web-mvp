import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiRequest } from "../api/client";
import { rankingStyleOptions } from "../constants";
import type {
  Account,
  BoardEntryItem,
  FanItem,
  LiveSessionItem,
  RankingEntryForm,
  RankingForm,
  RankingSnapshotItem,
  StreamerOption
} from "../types";
import { formatDateTime, formatDuration, toInteger } from "../utils/format";
import {
  rankingStatusLabel,
  rankingStyleLabel,
  sessionStatusLabel
} from "../utils/labels";
import { BoardEntryGroup } from "./RankingGroups";
export function RankingManager({
  account,
  contextSessionId = "",
  onOpenLineup
}: {
  account: Account | null;
  contextSessionId?: string;
  onOpenLineup?: () => void;
}) {
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
  const pausedSnapshot = snapshots.find((item) => item.status === "paused");
  const activeTimingSnapshot = countdownSnapshot ?? pausedSnapshot;
  const latestFrozenSnapshot = snapshots.find((item) => ["frozen", "confirmed", "used_for_match"].includes(item.status));
  const latestFinishedSnapshot = latestFrozenSnapshot ?? snapshots.find((item) => item.status !== "voided");
  const boardTimingSnapshot = activeTimingSnapshot ?? latestFinishedSnapshot;
  const countdownLeft = countdownSnapshot?.countdownEndsAt
    ? Math.max(0, Math.floor((new Date(countdownSnapshot.countdownEndsAt).getTime() - nowTick) / 1000))
    : 0;
  const timingLeft = countdownSnapshot ? countdownLeft : pausedSnapshot?.countdownSeconds ?? 0;
  const isBoardReadOnly = session?.status === "settled" || session?.status === "cancelled";

  const isSessionLive = session?.status === "live";
  const canCreateRanking = Boolean(activeSessionId && isSessionLive && boardEntries.length > 0 && !isBoardReadOnly && !activeTimingSnapshot);
  const rankingActionHint = !activeSessionId
    ? "请先选择场次。"
    : !isSessionLive
      ? "开始直播后才能创建定榜。"
      : boardEntries.length === 0
        ? "先维护本场榜单，再创建定榜。"
        : activeTimingSnapshot
          ? "当前已有定榜倒计时，继续维护榜单或按需操作倒计时。"
          : "创建后会直接开始三分钟倒计时。";
  const rankingStatusText = activeTimingSnapshot
    ? `${rankingStatusLabel(activeTimingSnapshot.status)} ${formatDuration(timingLeft)}`
    : latestFinishedSnapshot
      ? rankingStatusLabel(latestFinishedSnapshot.status)
      : "未定榜";
  const nextStepText = countdownSnapshot
    ? "倒计时结束会自动冻结，可暂停、重置或提前冻结。"
    : pausedSnapshot
      ? "倒计时已暂停，可继续、重置或提前冻结。"
    : latestFrozenSnapshot
      ? "检查冻结结果后进入名单确认。"
      : boardEntries.length > 0
        ? "确认榜单后开始定榜倒计时。"
        : "先录入本场榜单。";
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
    if (!canCreateRanking) {
      setNotice(rankingActionHint);
      return;
    }

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
      await apiRequest<{ ok: boolean }>(`/api/rankings/${result.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ action: "start_countdown", seconds: 180 })
      });
      setActiveSnapshotId(result.id);
      setNotice("定榜记录已创建，三分钟倒计时已开始。");
      setRankingForm((current) => ({ ...current, title: "", note: "", roundNo: "" }));
      await loadBoard(activeSessionId);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "创建定榜失败");
    } finally {
      setIsLoading(false);
    }
  }

  async function updateSnapshotStatus(
    snapshotId: string,
    action: "start_countdown" | "pause_countdown" | "resume_countdown" | "reset_countdown" | "freeze" | "reopen"
  ) {
    setIsLoading(true);
    setNotice("");
    try {
      await apiRequest<{ ok: boolean }>(`/api/rankings/${snapshotId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ action, seconds: 180 })
      });
      setNotice(
        action === "start_countdown"
          ? "三分钟倒计时已开始。"
          : action === "pause_countdown"
            ? "定榜倒计时已暂停。"
            : action === "resume_countdown"
              ? "定榜倒计时已继续。"
              : action === "reset_countdown"
                ? "定榜倒计时已重置为 3 分钟并暂停。"
                : action === "freeze"
                  ? "已按当前榜单重新冻结。"
                  : "已重新打开。"
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
      <section className="panel ranking-board-panel">
        <div className="panel-header">
          <h2>实时榜单</h2>
          <span>{boardEntries.length}</span>
        </div>

        <div className="ranking-status-strip">
          <div>
            <strong>{session ? sessionStatusLabel(session.status) : "未选择场次"}</strong>
            <span>{nextStepText}</span>
          </div>
          <span>{rankingStatusText}</span>
        </div>

        <div className="ranking-summary-grid">
          <div>
            <span>榜单人数</span>
            <strong>{boardEntries.length}</strong>
          </div>
          <div>
            <span>定榜状态</span>
            <strong>{rankingStatusText}</strong>
          </div>
          <div>
            <span>正常榜单</span>
            <strong>{normalEntries.length}</strong>
          </div>
          <div>
            <span>待处理</span>
            <strong>{pendingEntries.length + awayEntries.length + blockedEntries.length}</strong>
          </div>
        </div>

        {boardEntries.length === 0 ? (
          <div className="empty-workflow">
            <strong>本场还没有榜单记录</strong>
            <p>先在右侧选择粉丝，录入礼物、取票、存票或调整。保存后这里会成为主播现场主要查看区域。</p>
          </div>
        ) : null}

        {boardTimingSnapshot ? (
          <div className="board-countdown-strip">
            <div>
              <span>{activeTimingSnapshot ? (pausedSnapshot ? "定榜已暂停" : "定榜倒计时") : "定榜倒计时"}</span>
              <strong>{activeTimingSnapshot ? formatDuration(timingLeft) : "--:--"}</strong>
            </div>
            <span>
              第 {boardTimingSnapshot.roundNo} 次 · {rankingStyleLabel(boardTimingSnapshot.style)} ·{" "}
              {rankingStatusLabel(boardTimingSnapshot.status)}
            </span>
            <div className="row-actions">
              {countdownSnapshot ? (
                <button
                  className="secondary-button"
                  disabled={isLoading}
                  onClick={() => updateSnapshotStatus(countdownSnapshot.id, "pause_countdown")}
                  type="button"
                >
                  暂停
                </button>
              ) : null}
              {pausedSnapshot ? (
                <button
                  className="secondary-button"
                  disabled={isLoading}
                  onClick={() => updateSnapshotStatus(pausedSnapshot.id, "resume_countdown")}
                  type="button"
                >
                  继续
                </button>
              ) : null}
              {activeTimingSnapshot ? (
                <button
                  className="secondary-button"
                  disabled={isLoading}
                  onClick={() => updateSnapshotStatus(activeTimingSnapshot.id, "reset_countdown")}
                  type="button"
                >
                  重置
                </button>
              ) : (
                <button
                  className="secondary-button"
                  disabled={isLoading || !isSessionLive || isBoardReadOnly}
                  onClick={() => updateSnapshotStatus(boardTimingSnapshot.id, "start_countdown")}
                  type="button"
                >
                  开始三分钟
                </button>
              )}
              <button
                className="primary-button"
                disabled={isLoading || !isSessionLive || isBoardReadOnly}
                onClick={() => updateSnapshotStatus(boardTimingSnapshot.id, "freeze")}
                type="button"
              >
                立即冻结
              </button>
            </div>
          </div>
        ) : null}

        <BoardEntryGroup title="正常榜单" entries={normalEntries} fixedRows />
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

      <div className="panel form-panel operation-rail">
        <div className="panel-header">
          <h2>操作面板</h2>
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

        {activeTimingSnapshot ? (
          <section className="form-panel nested-form ranking-action-panel">
            <div className="panel-header">
              <h2>{pausedSnapshot ? "定榜已暂停" : "定榜倒计时"}</h2>
              <span>{formatDuration(timingLeft)}</span>
            </div>
            <div className="action-summary">
              <strong>第 {activeTimingSnapshot.roundNo} 次 · {activeTimingSnapshot.title}</strong>
              <span>{pausedSnapshot ? "倒计时已暂停，可继续或重置。" : "倒计时结束会自动冻结，也可暂停、重置或提前冻结。"}</span>
            </div>
            {countdownSnapshot ? (
              <button
                className="secondary-button"
                disabled={isLoading}
                onClick={() => updateSnapshotStatus(countdownSnapshot.id, "pause_countdown")}
                type="button"
              >
                暂停倒计时
              </button>
            ) : null}
            {pausedSnapshot ? (
              <button
                className="secondary-button"
                disabled={isLoading}
                onClick={() => updateSnapshotStatus(pausedSnapshot.id, "resume_countdown")}
                type="button"
              >
                继续倒计时
              </button>
            ) : null}
            <button
              className="secondary-button"
              disabled={isLoading}
              onClick={() => updateSnapshotStatus(activeTimingSnapshot.id, "reset_countdown")}
              type="button"
            >
              重置为 3 分钟
            </button>
            <button
              className="primary-button"
              disabled={isLoading}
              onClick={() => updateSnapshotStatus(activeTimingSnapshot.id, "freeze")}
              type="button"
            >
              立即按当前榜单冻结
            </button>
          </section>
        ) : latestFrozenSnapshot ? (
          <section className="form-panel nested-form ranking-action-panel">
            <div className="panel-header">
              <h2>冻结结果</h2>
              <span>{rankingStatusLabel(latestFrozenSnapshot.status)}</span>
            </div>
            <div className="action-summary">
              <strong>第 {latestFrozenSnapshot.roundNo} 次 · {latestFrozenSnapshot.title}</strong>
              <span>冻结：{formatDateTime(latestFrozenSnapshot.frozenAt)}</span>
              <span>下一步应确认名单，再进入对局。</span>
            </div>
            <button className="primary-button" disabled={!onOpenLineup} onClick={onOpenLineup} type="button">
              进入名单确认
            </button>
            <button
              className="secondary-button"
              disabled={isLoading}
              onClick={() => updateSnapshotStatus(latestFrozenSnapshot.id, "freeze")}
              type="button"
            >
              按当前榜单重新冻结
            </button>
          </section>
        ) : (
          <form className="form-panel nested-form ranking-action-panel" onSubmit={createRanking}>
            <div className="panel-header">
              <h2>开始定榜</h2>
              <span>默认 3:00</span>
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
            <p className="muted">{rankingActionHint}</p>
            <button className="primary-button" disabled={isLoading || !canCreateRanking} type="submit">
              开始三分钟定榜
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
