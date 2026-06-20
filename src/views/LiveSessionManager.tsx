import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiRequest } from "../api/client";
import { emptyLiveSessionForm, sessionStatusOptions, sessionTypeOptions } from "../constants";
import type { Account, LiveSessionForm, LiveSessionItem, StreamerOption } from "../types";
import { formatDateTime } from "../utils/format";
import { defaultSessionTitle, sessionStatusLabel, sessionTypeLabel } from "../utils/labels";

export function LiveSessionManager({ account }: { account: Account | null }) {
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
