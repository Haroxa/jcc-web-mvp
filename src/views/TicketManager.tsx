import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiRequest } from "../api/client";
import { ticketTypeOptions } from "../constants";
import type { Account, FanItem, LiveSessionItem, StreamerOption, TicketForm, TicketLedgerItem } from "../types";
import { formatDateTime } from "../utils/format";
import { ticketTypeLabel } from "../utils/labels";

export function TicketManager({ account, contextSessionId = "" }: { account: Account | null; contextSessionId?: string }) {
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
