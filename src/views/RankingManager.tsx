import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiRequest } from "../api/client";
import { rankingStyleOptions } from "../constants";
import type {
  Account,
  BoardEntryItem,
  FanItem,
  LiveSessionItem,
  RankingEntryForm,
  RankingEntryItem,
  RankingForm,
  RankingSnapshotItem,
  StreamerOption
} from "../types";
import { formatDateTime, formatDuration, toInteger } from "../utils/format";
import {
  boardStatusLabel,
  fanTypeLabel,
  rankingStatusLabel,
  rankingStyleLabel,
  seatDecisionLabel,
  sessionStatusLabel
} from "../utils/labels";
export function RankingManager({ account, contextSessionId = "" }: { account: Account | null; contextSessionId?: string }) {
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

