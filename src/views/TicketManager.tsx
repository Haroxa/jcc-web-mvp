import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiRequest } from "../api/client";
import { ticketTypeOptions } from "../constants";
import type { Account, FanItem, LiveSessionItem, StreamerOption, TicketForm, TicketLedgerItem } from "../types";
import { formatDateTime } from "../utils/format";
import { ticketTypeLabel } from "../utils/labels";

export function TicketManager({ account, contextSessionId = "" }: { account: Account | null; contextSessionId?: string }) {
  const [items, setItems] = useState<TicketLedgerItem[]>([]);
  const [fans, setFans] = useState<FanItem[]>([]);
  const [balanceFans, setBalanceFans] = useState<FanItem[]>([]);
  const [sessions, setSessions] = useState<LiveSessionItem[]>([]);
  const [streamers, setStreamers] = useState<StreamerOption[]>([]);
  const [activeStreamerId, setActiveStreamerId] = useState("");
  const [fanFilter, setFanFilter] = useState("");
  const [fanSearch, setFanSearch] = useState("");
  const [filterSearch, setFilterSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [form, setForm] = useState<TicketForm>({
    fanId: "",
    sessionId: "",
    type: "deposit",
    amount: "",
    note: ""
  });
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const pageSize = 10;

  const loadTickets = useCallback(async (streamerId = "", fanId = "", nextPage = 1) => {
    const params = new URLSearchParams();
    if (streamerId) params.set("streamerId", streamerId);
    if (fanId) params.set("fanId", fanId);
    params.set("page", String(nextPage));
    params.set("pageSize", String(pageSize));

    const result = await apiRequest<{
      items: TicketLedgerItem[];
      fans: FanItem[];
      balanceFans: FanItem[];
      sessions: LiveSessionItem[];
      streamers: StreamerOption[];
      activeStreamerId: string | null;
      page: number;
      pageSize: number;
      total: number;
    }>(`/api/tickets?${params.toString()}`);
    setItems(result.items);
    setFans(result.fans);
    setBalanceFans(result.balanceFans);
    setSessions(result.sessions);
    setStreamers(result.streamers);
    setActiveStreamerId(result.activeStreamerId ?? "");
    setPage(result.page);
    setTotal(result.total);
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
      await loadTickets(activeStreamerId, fanFilter, 1);
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
      await loadTickets(activeStreamerId, fanFilter, page);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "作废失败");
    } finally {
      setIsLoading(false);
    }
  }

  const selectedFan = fans.find((fan) => fan.id === form.fanId);
  const selectedFilterFan = fans.find((fan) => fan.id === fanFilter);
  const filteredFormFans = filterFans(fans, fanSearch);
  const filteredListFans = filterFans(fans, filterSearch);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function selectFormFan(fan: FanItem) {
    patchForm("fanId", fan.id);
    setFanSearch(fan.displayName);
  }

  function selectFilterFan(fanId: string, name = "") {
    setFanFilter(fanId);
    setFilterSearch(name);
    loadTickets(activeStreamerId, fanId, 1).catch((error) =>
      setNotice(error instanceof Error ? error.message : "筛选失败")
    );
  }

  async function restoreTicket(item: TicketLedgerItem) {
    setIsLoading(true);
    setNotice("");
    try {
      await apiRequest<{ ok: boolean }>(`/api/tickets/${item.id}/restore`, {
        method: "POST"
      });
      setNotice("票务记录已恢复。");
      await loadTickets(activeStreamerId, fanFilter, page);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "恢复失败");
    } finally {
      setIsLoading(false);
    }
  }

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

        <div className="fan-picker">
          粉丝
          <input
            onChange={(event) => setFanSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.preventDefault();
            }}
            placeholder="搜索昵称、抖音、微信、游戏名"
            value={fanSearch}
          />
          <div className="fan-picker-list ticket-fan-picker-list">
            {filteredFormFans.map((fan) => (
              <button
                className={fan.id === form.fanId ? "fan-picker-option active" : "fan-picker-option"}
                key={fan.id}
                onClick={() => selectFormFan(fan)}
                type="button"
              >
                <strong>{fan.displayName}</strong>
                <span>余额 {fan.cachedTicketBalance}</span>
              </button>
            ))}
          </div>
        </div>

        {balanceFans.length ? (
          <div className="balance-rank-panel">
            <div className="panel-header compact-panel-header">
              <h2>非 0 余额</h2>
              <span>{balanceFans.length}</span>
            </div>
            <div className="balance-rank-list">
              {balanceFans.slice(0, 8).map((fan) => (
                <button key={fan.id} onClick={() => selectFormFan(fan)} type="button">
                  <strong>{fan.displayName}</strong>
                  <span>{fan.cachedTicketBalance}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

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

        <div className="ticket-filter-panel">
          <input
            onChange={(event) => setFilterSearch(event.target.value)}
            placeholder={selectedFilterFan ? `当前：${selectedFilterFan.displayName}` : "搜索粉丝筛选流水"}
            value={filterSearch}
          />
          <div className="row-actions">
            <button className="secondary-button" onClick={() => selectFilterFan("", "")} type="button">
              全部粉丝
            </button>
          </div>
          {filterSearch ? (
            <div className="fan-picker-list ticket-filter-list">
              {filteredListFans.map((fan) => (
                <button className="fan-picker-option" key={fan.id} onClick={() => selectFilterFan(fan.id, fan.displayName)} type="button">
                  <strong>{fan.displayName}</strong>
                  <span>余额 {fan.cachedTicketBalance}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {items.length === 0 ? (
          <p className="muted">还没有票务流水。</p>
        ) : (
          <div className="account-list">
            {items.map((item) => (
              <article className={`account-row fan-row ticket-row ${ticketToneClass(item)}`} key={item.id}>
                <div>
                  <strong>
                    <span className="ticket-type-pill">{ticketTypeLabel(item.type)}</span>
                    {item.fanName} · {formatTicketAmount(item)}
                  </strong>
                  <span>
                    {item.sessionTitle || "未关联场次"} · {item.status === "voided" ? "已作废" : "正常"} ·{" "}
                    {formatDateTime(item.createdAt)}
                  </span>
                  <span>
                    来源：{ticketSourceLabel(item)} · 影响余额：{item.affectsBalance ? "是" : "否"} · 影响竞争票：
                    {item.affectsCompetition ? "是" : "否"} · 操作人：{item.createdByName || "未知"}
                  </span>
                  {item.note ? <span>备注：{item.note}</span> : null}
                </div>
                <div className="row-actions">
                  {item.status === "voided" ? (
                    <button className="secondary-button" disabled={isLoading} onClick={() => restoreTicket(item)} type="button">
                      恢复
                    </button>
                  ) : (
                    <button className="secondary-button" disabled={isLoading} onClick={() => voidTicket(item)} type="button">
                      作废
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
        <div className="pagination-bar">
          <button
            className="secondary-button"
            disabled={page <= 1}
            onClick={() => loadTickets(activeStreamerId, fanFilter, page - 1)}
            type="button"
          >
            上一页
          </button>
          <span>
            第 {page} / {totalPages} 页 · 共 {total}
          </span>
          <button
            className="secondary-button"
            disabled={page >= totalPages}
            onClick={() => loadTickets(activeStreamerId, fanFilter, page + 1)}
            type="button"
          >
            下一页
          </button>
        </div>
      </section>
    </section>
  );
}

function filterFans(fans: FanItem[], keyword: string) {
  const query = keyword.trim().toLowerCase();
  if (!query) return fans.slice(0, 12);
  return fans
    .filter((fan) =>
      [fan.displayName, fan.douyinName, fan.wechatName, fan.gameName]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query))
    )
    .slice(0, 12);
}

function ticketSourceLabel(item: TicketLedgerItem) {
  return item.note?.startsWith("场次结算") ? "场次结算" : "手工记录";
}

function ticketToneClass(item: TicketLedgerItem) {
  if (item.status === "voided") return "ticket-row-voided";
  if (item.type === "deposit") return "ticket-row-deposit";
  if (item.type === "withdraw") return "ticket-row-withdraw";
  return "ticket-row-neutral";
}

function formatTicketAmount(item: TicketLedgerItem) {
  if (item.type === "withdraw") return `-${item.amount}`;
  if (item.type === "deposit") return `+${item.amount}`;
  return String(item.amount);
}
