const STORAGE_KEY = "jcc_web_mvp_state_v1";
const defaultPlayers = Array.from({ length: 8 }, (_, index) => `玩家${index + 1}`);
const defaultCards = Array.from({ length: 8 }, (_, index) => `五费${index + 1}`);

const initialState = {
  screenshots: [],
  locks: defaultPlayers.map((name) => ({
    name,
    status: "alive",
    cards: [],
    note: "",
  })),
  ticketRecords: [],
};

let state = loadState();

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) return structuredClone(initialState);
    return {
      screenshots: Array.isArray(saved.screenshots) ? saved.screenshots : [],
      locks: Array.isArray(saved.locks) && saved.locks.length === 8 ? saved.locks : structuredClone(initialState.locks),
      ticketRecords: Array.isArray(saved.ticketRecords) ? saved.ticketRecords : [],
    };
  } catch {
    return structuredClone(initialState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatTime(value) {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function switchTab(tabName) {
  document.querySelectorAll(".tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tabName);
  });
  document.querySelectorAll(".panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === tabName);
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function download(filename, content, type = "application/json") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function renderScreenshots() {
  const list = document.querySelector("#screenshotList");
  const template = document.querySelector("#shotTemplate");
  const query = document.querySelector("#screenshotSearch").value.trim().toLowerCase();
  const rows = state.screenshots.filter((item) => {
    const text = `${item.player} ${item.tags} ${item.note}`.toLowerCase();
    return text.includes(query);
  });

  list.innerHTML = "";
  if (!rows.length) {
    list.innerHTML = `<div class="empty">暂无截图记录。</div>`;
    return;
  }

  rows
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .forEach((item) => {
      const node = template.content.cloneNode(true);
      node.querySelector("img").src = item.image;
      node.querySelector("h3").textContent = item.player || "未填写玩家";
      node.querySelector(".meta").textContent = `${formatTime(item.createdAt)} · ${item.tags || "无标签"}`;
      node.querySelector(".note").textContent = item.note || "无备注";
      node.querySelector("button").addEventListener("click", () => {
        state.screenshots = state.screenshots.filter((shot) => shot.id !== item.id);
        saveState();
        renderScreenshots();
      });
      list.appendChild(node);
    });
}

function lockedCards() {
  return state.locks
    .filter((player) => player.status === "alive")
    .flatMap((player) => player.cards);
}

function renderLocks() {
  const used = lockedCards();
  const available = defaultCards.filter((card) => !used.includes(card));
  document.querySelector("#lockedCardsText").textContent = used.length ? used.join("、") : "暂无";
  document.querySelector("#availableCardsText").textContent = available.length ? available.join("、") : "暂无";

  const ordered = state.locks
    .map((player, index) => ({ ...player, index }))
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "alive" ? -1 : 1;
      return a.index - b.index;
    });

  document.querySelector("#lockTable").innerHTML = `
    <table>
      <thead>
        <tr>
          <th>玩家</th>
          <th>状态</th>
          <th>锁定五费</th>
          <th>添加锁牌</th>
          <th>备注</th>
        </tr>
      </thead>
      <tbody>
        ${ordered.map((player) => lockRowHtml(player, used)).join("")}
      </tbody>
    </table>
  `;

  document.querySelectorAll("[data-lock-name]").forEach((input) => {
    input.addEventListener("change", (event) => {
      state.locks[event.target.dataset.index].name = event.target.value.trim() || defaultPlayers[event.target.dataset.index];
      saveState();
      renderLocks();
      renderTicketOptions();
      renderTickets();
    });
  });

  document.querySelectorAll("[data-lock-status]").forEach((select) => {
    select.addEventListener("change", (event) => {
      const player = state.locks[event.target.dataset.index];
      player.status = event.target.value;
      if (player.status === "eliminated") player.cards = [];
      saveState();
      renderLocks();
    });
  });

  document.querySelectorAll("[data-add-card]").forEach((select) => {
    select.addEventListener("change", (event) => {
      const card = event.target.value;
      if (!card) return;
      state.locks[event.target.dataset.index].cards.push(card);
      saveState();
      renderLocks();
    });
  });

  document.querySelectorAll("[data-remove-card]").forEach((button) => {
    button.addEventListener("click", (event) => {
      const index = Number(event.currentTarget.dataset.index);
      const card = event.currentTarget.dataset.removeCard;
      state.locks[index].cards = state.locks[index].cards.filter((item) => item !== card);
      saveState();
      renderLocks();
    });
  });

  document.querySelectorAll("[data-lock-note]").forEach((input) => {
    input.addEventListener("change", (event) => {
      state.locks[event.target.dataset.index].note = event.target.value;
      saveState();
    });
  });
}

function lockRowHtml(player, used) {
  const availableForPlayer = defaultCards.filter((card) => !used.includes(card) || player.cards.includes(card));
  const cardTags = player.cards.length
    ? player.cards.map((card) => `<span class="tag">${card}<button data-index="${player.index}" data-remove-card="${card}" type="button">×</button></span>`).join("")
    : `<span class="meta">未锁牌</span>`;

  return `
    <tr class="${player.status === "eliminated" ? "eliminated" : ""}">
      <td><input data-lock-name data-index="${player.index}" value="${escapeHtml(player.name)}"></td>
      <td>
        <select data-lock-status data-index="${player.index}">
          <option value="alive" ${player.status === "alive" ? "selected" : ""}>存活</option>
          <option value="eliminated" ${player.status === "eliminated" ? "selected" : ""}>淘汰并释放</option>
        </select>
      </td>
      <td><div class="card-tags">${cardTags}</div></td>
      <td>
        <select data-add-card data-index="${player.index}" ${player.status === "eliminated" ? "disabled" : ""}>
          <option value="">选择五费</option>
          ${availableForPlayer.filter((card) => !player.cards.includes(card)).map((card) => `<option value="${card}">${card}</option>`).join("")}
        </select>
      </td>
      <td><input data-lock-note data-index="${player.index}" value="${escapeHtml(player.note || "")}" placeholder="例如：准备追三星"></td>
    </tr>
  `;
}

function ticketPlayers() {
  return state.locks.map((player, index) => player.name || defaultPlayers[index]);
}

function ticketBalances() {
  const balances = Object.fromEntries(ticketPlayers().map((name) => [name, 0]));
  state.ticketRecords.forEach((record) => {
    if (!(record.player in balances)) balances[record.player] = 0;
    balances[record.player] += record.type === "deposit" ? record.amount : -record.amount;
  });
  return balances;
}

function renderTicketOptions() {
  document.querySelector("#ticketPlayer").innerHTML = ticketPlayers()
    .map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`)
    .join("");
}

function renderTickets() {
  const balances = ticketBalances();
  const rank = Object.entries(balances).sort((a, b) => b[1] - a[1]);
  document.querySelector("#ticketRank").innerHTML = rank
    .map(([player, balance], index) => `
      <div class="rank-row">
        <span>${index + 1}. ${escapeHtml(player)}</span>
        <span class="balance">${balance}</span>
      </div>
    `)
    .join("");

  const history = state.ticketRecords.slice().sort((a, b) => b.createdAt - a.createdAt);
  document.querySelector("#ticketHistory").innerHTML = history.length
    ? history.map((record) => `
      <div class="history-row">
        <div>
          <strong>${escapeHtml(record.player)}</strong>
          <small>${formatTime(record.createdAt)} · ${record.note ? escapeHtml(record.note) : "无备注"}</small>
        </div>
        <span class="balance">${record.type === "deposit" ? "+" : "-"}${record.amount}</span>
      </div>
    `).join("")
    : `<div class="empty">暂无存票记录。</div>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

document.querySelectorAll(".tab").forEach((button) => {
  button.addEventListener("click", () => switchTab(button.dataset.tab));
});

document.querySelector("#screenshotForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const file = document.querySelector("#shotFile").files[0];
  if (!file) return;

  const image = await readFileAsDataUrl(file);
  state.screenshots.push({
    id: uid(),
    image,
    player: document.querySelector("#shotPlayer").value.trim(),
    tags: document.querySelector("#shotTags").value.trim(),
    note: document.querySelector("#shotNote").value.trim(),
    createdAt: Date.now(),
  });
  saveState();
  event.target.reset();
  renderScreenshots();
});

document.querySelector("#screenshotSearch").addEventListener("input", renderScreenshots);

document.querySelector("#ticketForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const amount = Number(document.querySelector("#ticketAmount").value);
  if (!Number.isFinite(amount) || amount <= 0) return;

  state.ticketRecords.push({
    id: uid(),
    player: document.querySelector("#ticketPlayer").value,
    type: document.querySelector("#ticketType").value,
    amount,
    note: document.querySelector("#ticketNote").value.trim(),
    createdAt: Date.now(),
  });
  saveState();
  event.target.reset();
  document.querySelector("#ticketAmount").value = 1;
  renderTickets();
});

document.querySelector("#exportData").addEventListener("click", () => {
  download(`jcc-web-mvp-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(state, null, 2));
});

document.querySelector("#importData").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const imported = JSON.parse(await file.text());
    state = {
      screenshots: Array.isArray(imported.screenshots) ? imported.screenshots : [],
      locks: Array.isArray(imported.locks) && imported.locks.length === 8 ? imported.locks : structuredClone(initialState.locks),
      ticketRecords: Array.isArray(imported.ticketRecords) ? imported.ticketRecords : [],
    };
    saveState();
    renderAll();
    event.target.value = "";
  } catch {
    alert("导入失败：文件不是有效的 JSON 数据。");
  }
});

document.querySelector("#resetData").addEventListener("click", () => {
  if (!confirm("确认清空本地所有数据？导出的备份不会受影响。")) return;
  state = structuredClone(initialState);
  saveState();
  renderAll();
});

document.querySelector("#resetLocks").addEventListener("click", () => {
  state.locks = structuredClone(initialState.locks);
  saveState();
  renderLocks();
  renderTicketOptions();
  renderTickets();
});

document.querySelector("#resetTickets").addEventListener("click", () => {
  if (!confirm("确认清空存票记录？")) return;
  state.ticketRecords = [];
  saveState();
  renderTickets();
});

function renderAll() {
  renderScreenshots();
  renderLocks();
  renderTicketOptions();
  renderTickets();
}

renderAll();
