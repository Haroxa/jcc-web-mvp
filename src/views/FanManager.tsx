import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiRequest } from "../api/client";
import { emptyFanForm, fanStatusOptions } from "../constants";
import type { Account, FanForm, FanItem, StreamerOption } from "../types";

export function FanManager({ account }: { account: Account | null }) {
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
