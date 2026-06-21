import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiRequest } from "../api/client";
import type { Account, StreamerAccountItem } from "../types";

export function SettingsView({ account }: { account: Account | null }) {
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
