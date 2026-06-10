const STORAGE_KEY = "jcc_web_mvp_state_v1";
const defaultPlayers = Array.from({ length: 8 }, (_, index) => `玩家${index + 1}`);
const defaultCards = Array.from({ length: 8 }, (_, index) => `五费${index + 1}`);
const cardCategories = {
  normal: "正常五费",
  unlocked: "解锁五费",
  optional: "可选五费",
};

const defaultPlayerObjects = defaultPlayers.map((name, index) => ({
  id: `player-${index + 1}`,
  name,
  active: true,
  note: "",
}));

const defaultCardObjects = defaultCards.map((name, index) => ({
  id: `card-${index + 1}`,
  name,
  category: "normal",
  active: true,
  tags: [],
  note: "",
}));

const initialState = {
  screenshots: [],
  players: structuredClone(defaultPlayerObjects),
  cards: structuredClone(defaultCardObjects),
  locks: defaultPlayers.map(() => ({
    status: "alive",
    cards: [],
    note: "",
  })),
  ticketRecords: [],
};

let state = loadState();
let lockCardFilter = "all";

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) return structuredClone(initialState);
    const players = normalizePlayers(saved.players, saved.locks);
    const cards = normalizeCards(saved.cards);
    return {
      screenshots: Array.isArray(saved.screenshots) ? saved.screenshots : [],
      players,
      cards,
      locks: normalizeLocks(saved.locks),
      ticketRecords: Array.isArray(saved.ticketRecords) ? saved.ticketRecords : [],
    };
  } catch {
    return structuredClone(initialState);
  }
}

function normalizePlayers(players, locks) {
  if (Array.isArray(players) && players.length) {
    return players.map((player, index) => ({
      id: player.id || `player-${index + 1}`,
      name: String(player.name || "").trim() || defaultPlayers[index] || `玩家${index + 1}`,
      active: typeof player.active === "boolean" ? player.active : index < 8,
      note: player.note || "",
    }));
  }

  if (Array.isArray(locks) && locks.length) {
    return locks.map((player, index) => ({
      id: `player-${index + 1}`,
      name: String(player.name || "").trim() || defaultPlayers[index] || `玩家${index + 1}`,
      active: index < 8,
      note: "",
    }));
  }

  return structuredClone(defaultPlayerObjects);
}

function normalizeCards(cards) {
  if (!Array.isArray(cards) || !cards.length) return structuredClone(defaultCardObjects);
  return cards.map((card, index) => {
    if (typeof card === "string") {
      return {
        id: `card-${index + 1}`,
        name: card.trim() || defaultCards[index] || `五费${index + 1}`,
        category: "normal",
        active: true,
        tags: [],
        note: "",
      };
    }
    return {
      id: card.id || `card-${index + 1}`,
      name: String(card.name || "").trim() || defaultCards[index] || `五费${index + 1}`,
      category: normalizeCardCategory(card.category),
      active: typeof card.active === "boolean" ? card.active : true,
      tags: Array.isArray(card.tags) ? card.tags.map((tag) => String(tag).trim()).filter(Boolean) : parseTags(card.tags),
      note: card.note || "",
    };
  });
}

function normalizeCardCategory(category) {
  if (category === "optional" || category === "可选五费") return "optional";
  if (category === "unlocked" || category === "解锁五费") return "unlocked";
  return "normal";
}

function normalizeLocks(locks) {
  if (!Array.isArray(locks) || !locks.length) return structuredClone(initialState.locks);
  return locks.map((player) => ({
    status: player.status === "eliminated" ? "eliminated" : "alive",
    cards: Array.isArray(player.cards) ? player.cards : [],
    note: player.note || "",
  }));
}

function parseTags(value) {
  return String(value || "")
    .split(/[,\s，、]+/)
    .map((item) => item.trim())
    .filter(Boolean);
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

function cardNames() {
  return state.cards.map((card) => card.name);
}

function activeCards() {
  return state.cards.filter((card) => card.active);
}

function activeCardNames() {
  return activeCards().map((card) => card.name);
}

function filteredActiveCards() {
  return activeCards().filter((card) => lockCardFilter === "all" || card.category === lockCardFilter);
}

function filteredActiveCardNames() {
  return filteredActiveCards().map((card) => card.name);
}

function playerNames() {
  return state.players.map((player, index) => player.name || defaultPlayers[index]);
}

function activePlayers() {
  return state.players.filter((player) => player.active).slice(0, 8);
}

function activePlayerNames() {
  return activePlayers().map((player, index) => player.name || defaultPlayers[index]);
}

function ensureLockSlots() {
  const count = activePlayers().length;
  while (state.locks.length < count) {
    state.locks.push({ status: "alive", cards: [], note: "" });
  }
  if (state.locks.length > count) {
    state.locks = state.locks.slice(0, count);
  }
}

function cardLabel(cardName) {
  const card = state.cards.find((item) => item.name === cardName);
  return card ? card.name : cardName;
}

function cardTitle(cardName) {
  const card = state.cards.find((item) => item.name === cardName);
  if (!card) return cardName;
  const parts = [cardCategories[card.category] || "正常五费", ...card.tags];
  return `${card.name}：${parts.join("、")}`;
}

function categoryClass(category) {
  return `category-${category || "normal"}`;
}

function cardTagHtml(cardName, options = {}) {
  const card = state.cards.find((item) => item.name === cardName);
  const removeButton = options.remove
    ? `<button data-index="${options.index}" data-remove-card="${escapeHtml(cardName)}" type="button" aria-label="移除${escapeHtml(cardName)}">×</button>`
    : "";
  return `<span class="tag ${categoryClass(card?.category)}" title="${escapeHtml(cardTitle(cardName))}">${escapeHtml(cardLabel(cardName))}${removeButton}</span>`;
}

function cardTagListHtml(cards, emptyText) {
  return cards.length
    ? `<div class="card-tags summary-tags">${cards.map((card) => cardTagHtml(card)).join("")}</div>`
    : `<span class="meta">${emptyText}</span>`;
}

function renderLocks() {
  ensureLockSlots();
  const used = lockedCards();
  const available = activeCardNames().filter((card) => !used.includes(card));
  document.querySelector("#lockedCardsText").innerHTML = cardTagListHtml(used, "暂无");
  document.querySelector("#availableCardsText").innerHTML = cardTagListHtml(available, "暂无");
  document.querySelectorAll("[data-card-filter]").forEach((button) => {
    button.classList.toggle("active", button.dataset.cardFilter === lockCardFilter);
  });

  const ordered = state.locks
    .map((player, index) => ({ ...player, index, name: activePlayerNames()[index] }))
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
  const availableForPlayer = filteredActiveCardNames().filter((card) => !used.includes(card) || player.cards.includes(card));
  const cardTags = player.cards.length
    ? player.cards.map((card) => cardTagHtml(card, { remove: true, index: player.index })).join("")
    : `<span class="meta">未锁牌</span>`;

  return `
    <tr class="${player.status === "eliminated" ? "eliminated" : ""}">
      <td>${escapeHtml(player.name)}</td>
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
          ${availableForPlayer.filter((card) => !player.cards.includes(card)).map((card) => `<option value="${escapeHtml(card)}">${escapeHtml(cardLabel(card))}</option>`).join("")}
        </select>
      </td>
      <td><input data-lock-note data-index="${player.index}" value="${escapeHtml(player.note || "")}" placeholder="例如：准备追三星"></td>
    </tr>
  `;
}

function ticketPlayers() {
  return activePlayerNames();
}

function renderLibrary() {
  document.querySelector("#playerSettings").innerHTML = `
    <div class="player-library-head">
      <span>本场</span>
      <span>玩家</span>
      <span>备注</span>
    </div>
    ${state.players.map((player, index) => playerLibraryRow(player, index)).join("")}
  `;

  document.querySelector("#cardLibrary").innerHTML = `
    <div class="card-library-head">
      <span>本场</span>
      <span>名称</span>
      <span>分类</span>
      <span>标签</span>
      <span>备注</span>
      <span>操作</span>
    </div>
    ${state.cards.map((card, index) => cardLibraryRow(card, index)).join("")}
  `;
}

function playerLibraryRow(player, index) {
  return `
    <div class="player-library-row">
      <input data-player-active data-index="${index}" type="checkbox" ${player.active ? "checked" : ""}>
      <input data-player-name data-index="${index}" value="${escapeHtml(player.name)}" placeholder="玩家名">
      <input data-player-note data-index="${index}" value="${escapeHtml(player.note || "")}" placeholder="备注">
    </div>
  `;
}

function cardLibraryRow(card, index) {
  return `
    <div class="card-library-row">
      <input data-card-active data-index="${index}" type="checkbox" ${card.active ? "checked" : ""}>
      <input data-card-name data-index="${index}" value="${escapeHtml(card.name)}" placeholder="五费名称">
      <select class="${categoryClass(card.category)}" data-card-category data-index="${index}">
        <option value="normal" ${card.category === "normal" ? "selected" : ""}>正常五费</option>
        <option value="unlocked" ${card.category === "unlocked" ? "selected" : ""}>解锁五费</option>
        <option value="optional" ${card.category === "optional" ? "selected" : ""}>可选五费</option>
      </select>
      <input data-card-tags data-index="${index}" value="${escapeHtml(card.tags.join("、"))}" placeholder="例如：S14、主C">
      <input data-card-note data-index="${index}" value="${escapeHtml(card.note || "")}" placeholder="备注">
      <button class="danger small" data-delete-card data-index="${index}" type="button">删除</button>
    </div>
  `;
}

function applyLibrarySettings(nextPlayers, nextCards) {
  const previousPlayers = playerNames();
  const previousCards = cardNames();

  state.players = nextPlayers.map((player, index) => ({
    ...(state.players[index] || {}),
    id: state.players[index]?.id || `player-${index + 1}`,
    name: player.name || defaultPlayers[index] || `玩家${index + 1}`,
    active: Boolean(player.active),
    note: player.note || "",
  }));

  state.locks.forEach((player) => {
    player.cards = player.cards
      .map((card) => {
        const cardIndex = previousCards.indexOf(card);
        return cardIndex >= 0 ? nextCards[cardIndex]?.name : card;
      })
      .filter((card, index, cards) => cardNamesFrom(nextCards).includes(card) && cards.indexOf(card) === index);
  });

  state.cards = nextCards;
  state.ticketRecords = state.ticketRecords.map((record) => {
    const playerIndex = previousPlayers.indexOf(record.player);
    return playerIndex >= 0 && nextPlayers[playerIndex] ? { ...record, player: nextPlayers[playerIndex].name } : record;
  });
  ensureLockSlots();
}

function cardNamesFrom(cards) {
  return cards.map((card) => card.name);
}

function hasDuplicate(values) {
  return new Set(values).size !== values.length;
}

function splitBatchText(text) {
  return text
    .split(/[\n,，、\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parsePlayerBatch(text) {
  return [...new Set(splitBatchText(text))].map((name, index) => ({
    id: `player-${Date.now()}-${index}`,
    name,
    active: index < 8,
    note: "",
  }));
}

function parseCardBatch(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const parts = splitBatchText(line);
      const categoryIndex = parts.findIndex((part) => ["正常五费", "解锁五费", "可选五费"].includes(part));
      const name = parts[0] || `五费${index + 1}`;
      const category = categoryIndex >= 0 ? normalizeCardCategory(parts[categoryIndex]) : "normal";
      const tags = parts.filter((part, partIndex) => partIndex !== 0 && partIndex !== categoryIndex);
      return {
        id: `card-${Date.now()}-${index}`,
        name,
        category,
        active: true,
        tags,
        note: "",
      };
    });
}

function readPlayersFromInputs() {
  return Array.from(document.querySelectorAll("[data-player-name]")).map((input, index) => ({
    id: state.players[index]?.id || `player-${Date.now()}-${index}`,
    name: input.value.trim() || defaultPlayers[index] || `玩家${index + 1}`,
    active: document.querySelector(`[data-player-active][data-index="${index}"]`).checked,
    note: document.querySelector(`[data-player-note][data-index="${index}"]`).value.trim(),
  }));
}

function readCardsFromInputs() {
  return Array.from(document.querySelectorAll("[data-card-name]")).map((input, index) => ({
    id: state.cards[index]?.id || `card-${Date.now()}-${index}`,
    name: input.value.trim() || defaultCards[index] || `五费${index + 1}`,
    active: document.querySelector(`[data-card-active][data-index="${index}"]`).checked,
    category: document.querySelector(`[data-card-category][data-index="${index}"]`).value,
    tags: parseTags(document.querySelector(`[data-card-tags][data-index="${index}"]`).value),
    note: document.querySelector(`[data-card-note][data-index="${index}"]`).value.trim(),
  }));
}

function saveLibrary(nextPlayers, nextCards) {
  const activePlayerCount = nextPlayers.filter((player) => player.active).length;
  const activeCardCount = nextCards.filter((card) => card.active).length;
  if (activePlayerCount < 1 || activePlayerCount > 8) {
    alert("保存失败：本场参与玩家需要 1 到 8 个。");
    renderLibrary();
    return false;
  }
  if (activeCardCount < 1) {
    alert("保存失败：至少需要 1 张本场可用五费。");
    renderLibrary();
    return false;
  }
  if (!nextCards.length) {
    alert("保存失败：至少需要 1 张五费卡。");
    renderLibrary();
    return false;
  }
  if (hasDuplicate(nextPlayers.map((player) => player.name)) || hasDuplicate(cardNamesFrom(nextCards))) {
    alert("保存失败：玩家名和五费名称不能重复。");
    renderLibrary();
    return false;
  }
  applyLibrarySettings(nextPlayers, nextCards);
  saveState();
  renderAll();
  return true;
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

document.querySelector("#cardCategoryFilter").addEventListener("click", (event) => {
  const button = event.target.closest("[data-card-filter]");
  if (!button) return;
  lockCardFilter = button.dataset.cardFilter;
  renderLocks();
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
    const players = normalizePlayers(imported.players, imported.locks);
    state = {
      screenshots: Array.isArray(imported.screenshots) ? imported.screenshots : [],
      players,
      cards: normalizeCards(imported.cards),
      locks: normalizeLocks(imported.locks),
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
  state.locks = state.locks.map(() => ({
    status: "alive",
    cards: [],
    note: "",
  }));
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

document.querySelector("#parsePlayers").addEventListener("click", () => {
  const parsed = parsePlayerBatch(document.querySelector("#playerBatch").value);
  if (!parsed.length) {
    alert("没有解析到玩家名。");
    return;
  }
  saveLibrary(parsed, readCardsFromInputs());
});

document.querySelector("#savePlayers").addEventListener("click", () => {
  saveLibrary(readPlayersFromInputs(), readCardsFromInputs());
});

document.querySelector("#playerSettings").addEventListener("change", () => {
  saveLibrary(readPlayersFromInputs(), readCardsFromInputs());
});

document.querySelector("#parseCards").addEventListener("click", () => {
  const parsed = parseCardBatch(document.querySelector("#cardBatch").value);
  if (!parsed.length) {
    alert("没有解析到五费卡。");
    return;
  }
  saveLibrary(readPlayersFromInputs(), parsed);
});

document.querySelector("#addCard").addEventListener("click", () => {
  state.cards.push({
    id: `card-${Date.now()}`,
    name: `五费${state.cards.length + 1}`,
    active: true,
    category: "normal",
    tags: [],
    note: "",
  });
  saveState();
  renderAll();
});

document.querySelector("#cardLibrary").addEventListener("change", () => {
  saveLibrary(readPlayersFromInputs(), readCardsFromInputs());
});

document.querySelector("#cardLibrary").addEventListener("click", (event) => {
  const button = event.target.closest("[data-delete-card]");
  if (!button) return;
  if (state.cards.length <= 1) {
    alert("至少保留 1 张五费卡。");
    return;
  }
  const index = Number(button.dataset.index);
  const cardName = state.cards[index].name;
  if (!confirm(`确认删除「${cardName}」？已有锁牌中的这张卡也会被移除。`)) return;
  state.cards.splice(index, 1);
  state.locks.forEach((player) => {
    player.cards = player.cards.filter((card) => card !== cardName);
  });
  saveState();
  renderAll();
});

document.querySelector("#resetLibrary").addEventListener("click", () => {
  if (!confirm("确认恢复默认玩家和五费资料？已有存票姓名和锁牌卡名会同步改回默认资料。")) return;
  saveLibrary(structuredClone(defaultPlayerObjects), structuredClone(defaultCardObjects));
});

function renderAll() {
  renderScreenshots();
  renderLibrary();
  renderLocks();
  renderTicketOptions();
  renderTickets();
}

renderAll();
