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
  nickname: name,
  douyinName: "",
  wechatName: "",
  gameName: "",
  active: true,
  note: "",
}));

const defaultCardObjects = defaultCards.map((name, index) => ({
  id: `card-${index + 1}`,
  name,
  alias: "",
  category: "normal",
  active: true,
  tags: [],
  note: "",
}));

const initialState = {
  screenshots: [],
  players: structuredClone(defaultPlayerObjects),
  cards: structuredClone(defaultCardObjects),
  displaySettings: {
    playerNameMode: "nickname",
    cardNameMode: "name",
  },
  locks: defaultPlayerObjects.map((player) => ({
    playerId: player.id,
    status: "alive",
    eliminatedAt: null,
    cardIds: [],
    note: "",
  })),
  ticketRecords: [],
  matchHistory: [],
};

let state = loadState();
let lockCardFilter = "all";
const libraryPagination = {
  players: { page: 1, pageSize: 10 },
  cards: { page: 1, pageSize: 10 },
};

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
      displaySettings: normalizeDisplaySettings(saved.displaySettings),
      locks: normalizeLocks(saved.locks, players, cards),
      ticketRecords: normalizeTicketRecords(saved.ticketRecords, players),
      matchHistory: normalizeMatchHistory(saved.matchHistory, players, cards),
    };
  } catch {
    return structuredClone(initialState);
  }
}

function normalizePlayers(players, locks) {
  if (Array.isArray(players) && players.length) {
    return players.map((player, index) => ({
      id: player.id || `player-${index + 1}`,
      nickname: String(player.nickname || player.name || "").trim() || defaultPlayers[index] || `玩家${index + 1}`,
      douyinName: String(player.douyinName || "").trim(),
      wechatName: String(player.wechatName || "").trim(),
      gameName: String(player.gameName || "").trim(),
      active: typeof player.active === "boolean" ? player.active : index < 8,
      note: player.note || "",
    }));
  }

  if (Array.isArray(locks) && locks.length) {
    return locks.map((player, index) => ({
      id: `player-${index + 1}`,
      nickname: String(player.name || "").trim() || defaultPlayers[index] || `玩家${index + 1}`,
      douyinName: "",
      wechatName: "",
      gameName: "",
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
        alias: "",
        category: "normal",
        active: true,
        tags: [],
        note: "",
      };
    }
    return {
      id: card.id || `card-${index + 1}`,
      name: String(card.name || "").trim() || defaultCards[index] || `五费${index + 1}`,
      alias: String(card.alias || "").trim(),
      category: normalizeCardCategory(card.category),
      active: typeof card.active === "boolean" ? card.active : true,
      tags: Array.isArray(card.tags) ? card.tags.map((tag) => String(tag).trim()).filter(Boolean) : parseTags(card.tags),
      note: card.note || "",
    };
  });
}

function normalizeDisplaySettings(settings) {
  const playerModes = ["nickname", "gameName", "douyinName", "wechatName"];
  const cardModes = ["name", "alias"];
  return {
    playerNameMode: playerModes.includes(settings?.playerNameMode) ? settings.playerNameMode : "nickname",
    cardNameMode: cardModes.includes(settings?.cardNameMode) ? settings.cardNameMode : "name",
  };
}

function normalizeCardCategory(category) {
  if (category === "optional" || category === "可选五费") return "optional";
  if (category === "unlocked" || category === "解锁五费") return "unlocked";
  return "normal";
}

function normalizeLocks(locks, players = defaultPlayerObjects, cards = defaultCardObjects) {
  if (!Array.isArray(locks) || !locks.length) return structuredClone(initialState.locks);
  const activePlayerIds = players.filter((player) => player.active).map((player) => player.id);
  return locks.map((player, index) => ({
    playerId: player.playerId || activePlayerIds[index] || players[index]?.id || `player-${index + 1}`,
    status: player.status === "eliminated" ? "eliminated" : "alive",
    eliminatedAt: Number.isFinite(player.eliminatedAt) ? player.eliminatedAt : null,
    cardIds: normalizeLockCardIds(player, cards),
    note: player.note || "",
  }));
}

function normalizeLockCardIds(lock, cards) {
  if (Array.isArray(lock.cardIds)) {
    return lock.cardIds.filter((cardId) => cards.some((card) => card.id === cardId));
  }
  if (!Array.isArray(lock.cards)) return [];
  return lock.cards
    .map((cardName) => cardIdByName(cardName, cards))
    .filter(Boolean);
}

function normalizeTicketRecords(records, players = defaultPlayerObjects) {
  if (!Array.isArray(records)) return [];
  return records.map((record) => ({
    ...record,
    playerId: record.playerId || playerIdByName(record.player, players),
  }));
}

function normalizeMatchHistory(records, players = defaultPlayerObjects, cards = defaultCardObjects) {
  if (!Array.isArray(records)) return [];
  const playerIds = new Set(players.map((player) => player.id));
  const cardIds = new Set(cards.map((card) => card.id));
  return records.map((record, index) => ({
    id: record.id || `match-${index + 1}`,
    name: String(record.name || "").trim() || `历史对局 ${index + 1}`,
    createdAt: Number.isFinite(record.createdAt) ? record.createdAt : Date.now(),
    note: record.note || "",
    playerIds: Array.isArray(record.playerIds) ? record.playerIds.filter((playerId) => playerIds.has(playerId)).slice(0, 8) : [],
    cardIds: Array.isArray(record.cardIds) ? record.cardIds.filter((cardId) => cardIds.has(cardId)) : [],
    locks: normalizeLocks(record.locks, players, cards),
  }));
}

function parseTags(value) {
  return String(value || "")
    .split(/[,\s，、]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function playerById(playerId) {
  return state.players.find((player) => player.id === playerId);
}

function cardById(cardId) {
  return state.cards.find((card) => card.id === cardId);
}

function playerIdByName(name, players = state.players) {
  if (!name) return "";
  const player = players.find((item) =>
    [item.nickname, item.name, item.gameName, item.douyinName, item.wechatName].filter(Boolean).includes(name)
  );
  return player?.id || "";
}

function cardIdByName(name, cards = state.cards) {
  if (!name) return "";
  const card = cards.find((item) => item.name === name || item.alias === name);
  return card?.id || "";
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
  const activePlayerIds = new Set(activePlayers().map((player) => player.id));
  const enabledCardIds = new Set(activeCardIds());
  return state.locks
    .filter((player) => activePlayerIds.has(player.playerId) && player.status === "alive")
    .flatMap((player) => player.cardIds || [])
    .filter((cardId) => enabledCardIds.has(cardId));
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

function activeCardIds() {
  return activeCards().map((card) => card.id);
}

function sortCardIds(cardIds) {
  const order = new Map(state.cards.map((card, index) => [card.id, index]));
  return cardIds.slice().sort((a, b) => (order.get(a) ?? 9999) - (order.get(b) ?? 9999));
}

function filteredActiveCards() {
  return activeCards().filter((card) => lockCardFilter === "all" || card.category === lockCardFilter);
}

function filteredActiveCardIds() {
  return filteredActiveCards().map((card) => card.id);
}

function playerNames() {
  return state.players.map((player, index) => player.nickname || defaultPlayers[index]);
}

function activePlayers() {
  return state.players.filter((player) => player.active).slice(0, 8);
}

function activePlayerNames() {
  return activePlayers().map((player, index) => playerDisplayName(player, index));
}

function playerDisplayName(player, index = 0) {
  const fallback = player.nickname || defaultPlayers[index] || `玩家${index + 1}`;
  return player[state.displaySettings.playerNameMode] || fallback;
}

function ensureLockSlots() {
  activePlayers().forEach((player) => {
    if (!state.locks.some((lock) => lock.playerId === player.id)) {
      state.locks.push({ playerId: player.id, status: "alive", eliminatedAt: null, cardIds: [], note: "" });
    }
  });
  state.locks = state.locks.filter((lock) => state.players.some((player) => player.id === lock.playerId));
}

function cardLabel(cardName) {
  const card = cardById(cardName) || state.cards.find((item) => item.name === cardName);
  if (!card) return cardName;
  return state.displaySettings.cardNameMode === "alias" ? card.alias || card.name : card.name;
}

function cardTitle(cardName) {
  const card = cardById(cardName) || state.cards.find((item) => item.name === cardName);
  if (!card) return cardName;
  const alias = card.alias ? `外号：${card.alias}` : "";
  const parts = [cardCategories[card.category] || "正常五费", alias, ...card.tags].filter(Boolean);
  return `${card.name}：${parts.join("、")}`;
}

function categoryClass(category) {
  return `category-${category || "normal"}`;
}

function cardTagHtml(cardName, options = {}) {
  const card = cardById(cardName) || state.cards.find((item) => item.name === cardName);
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
  const used = sortCardIds(lockedCards());
  const available = activeCardIds().filter((cardId) => !used.includes(cardId));
  const missingPlayerCount = Math.max(0, 8 - activePlayers().length);
  document.querySelector("#lockedCardsText").innerHTML = cardTagListHtml(used, "暂无");
  document.querySelector("#availableCardsText").innerHTML = cardTagListHtml(available, "暂无");
  document.querySelectorAll("[data-card-filter]").forEach((button) => {
    button.classList.toggle("active", button.dataset.cardFilter === lockCardFilter);
  });
  document.querySelectorAll("[data-player-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.playerMode === state.displaySettings.playerNameMode);
  });
  document.querySelectorAll("[data-card-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.cardMode === state.displaySettings.cardNameMode);
  });

  const ordered = state.locks
    .filter((lock) => activePlayers().some((player) => player.id === lock.playerId))
    .map((player) => ({ ...player, player: playerById(player.playerId), index: state.locks.indexOf(player) }))
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "alive" ? -1 : 1;
      if (a.status === "eliminated") return rankValue(a) - rankValue(b);
      return activePlayers().findIndex((player) => player.id === a.playerId) - activePlayers().findIndex((player) => player.id === b.playerId);
    });

  document.querySelector("#lockTable").innerHTML = `
    <table>
      <thead>
        <tr>
          <th>玩家</th>
          <th>排名</th>
          <th>状态</th>
          <th>锁定五费</th>
          <th>添加锁牌</th>
          <th>备注</th>
        </tr>
      </thead>
      <tbody>
        ${ordered.map((player) => lockRowHtml(player, used)).join("")}
        ${Array.from({ length: missingPlayerCount }, (_, index) => missingLockRowHtml(index)).join("")}
      </tbody>
    </table>
  `;

  document.querySelectorAll("[data-lock-status]").forEach((select) => {
    select.addEventListener("change", (event) => {
      const player = state.locks[event.target.dataset.index];
      player.status = event.target.value;
      player.eliminatedAt = player.status === "eliminated" ? player.eliminatedAt || Date.now() : null;
      saveState();
      renderLocks();
    });
  });

  document.querySelectorAll("[data-add-card]").forEach((select) => {
    select.addEventListener("change", (event) => {
      const cardId = event.target.value;
      if (!cardId) return;
      state.locks[event.target.dataset.index].cardIds.push(cardId);
      saveState();
      renderLocks();
    });
  });

  document.querySelectorAll("[data-remove-card]").forEach((button) => {
    button.addEventListener("click", (event) => {
      const index = Number(event.currentTarget.dataset.index);
      const cardId = event.currentTarget.dataset.removeCard;
      state.locks[index].cardIds = state.locks[index].cardIds.filter((item) => item !== cardId);
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

function missingLockRowHtml(index) {
  return `
    <tr class="missing-row">
      <td>缺少玩家 ${index + 1}</td>
      <td>-</td>
      <td>未配置</td>
      <td><span class="meta">-</span></td>
      <td><span class="meta">请先添加玩家</span></td>
      <td><span class="meta">-</span></td>
    </tr>
  `;
}

function lockRowHtml(player, used) {
  const activePlayerIds = new Set(activePlayers().map((item) => item.id));
  const enabledCardIds = new Set(activeCardIds());
  const occupiedByOthers = state.locks
    .filter((item) => activePlayerIds.has(item.playerId) && item.playerId !== player.playerId && item.status === "alive")
    .flatMap((item) => item.cardIds || []);
  const currentCardIds = sortCardIds((player.cardIds || []).filter((cardId) => enabledCardIds.has(cardId)));
  const availableForPlayer = filteredActiveCardIds().filter((cardId) =>
    player.status === "eliminated" || !occupiedByOthers.includes(cardId) || currentCardIds.includes(cardId)
  );
  const cardTags = currentCardIds.length
    ? currentCardIds.map((cardId) => cardTagHtml(cardId, { remove: true, index: player.index })).join("")
    : `<span class="meta">未锁牌</span>`;
  const displayName = playerDisplayName(player.player, activePlayers().findIndex((item) => item.id === player.playerId));

  return `
    <tr class="${player.status === "eliminated" ? "eliminated" : ""}">
      <td>${escapeHtml(displayName)}</td>
      <td>${rankText(player)}</td>
      <td>
        <select data-lock-status data-index="${player.index}">
          <option value="alive" ${player.status === "alive" ? "selected" : ""}>存活</option>
          <option value="eliminated" ${player.status === "eliminated" ? "selected" : ""}>淘汰</option>
        </select>
      </td>
      <td><div class="card-tags">${cardTags}</div></td>
      <td>
        <select data-add-card data-index="${player.index}">
          <option value="">选择五费</option>
          ${availableForPlayer.filter((cardId) => !currentCardIds.includes(cardId)).map((cardId) => `<option value="${escapeHtml(cardId)}">${escapeHtml(cardLabel(cardId))}</option>`).join("")}
        </select>
      </td>
      <td><input data-lock-note data-index="${player.index}" value="${escapeHtml(player.note || "")}" placeholder="例如：准备追三星"></td>
    </tr>
  `;
}

function rankText(player) {
  if (player.status !== "eliminated") return "-";
  const value = rankValue(player);
  return value ? `${value}名` : "-";
}

function rankValue(player) {
  if (player.status !== "eliminated") return null;
  const activePlayerIds = new Set(activePlayers().map((item) => item.id));
  const eliminated = state.locks
    .filter((item) => activePlayerIds.has(item.playerId) && item.status === "eliminated" && item.eliminatedAt)
    .sort((a, b) => a.eliminatedAt - b.eliminatedAt || activePlayers().findIndex((item) => item.id === a.playerId) - activePlayers().findIndex((item) => item.id === b.playerId));
  const order = eliminated.findIndex((item) => item.playerId === player.playerId);
  if (order < 0) return null;
  return activePlayers().length - order;
}

function ticketPlayers() {
  return activePlayers();
}

function renderLibrary() {
  const playerQuery = document.querySelector("#playerLibrarySearch")?.value.trim().toLowerCase() || "";
  const cardQuery = document.querySelector("#cardLibrarySearch")?.value.trim().toLowerCase() || "";
  const visiblePlayers = state.players
    .map((player, index) => ({ player, index }))
    .filter(({ player }) => [player.nickname, player.douyinName, player.wechatName, player.gameName, player.note].join(" ").toLowerCase().includes(playerQuery));
  const visibleCards = state.cards
    .map((card, index) => ({ card, index }))
    .filter(({ card }) => [card.name, card.alias, card.category, card.tags.join(" "), card.note].join(" ").toLowerCase().includes(cardQuery));
  const playerPage = pagedRows("players", visiblePlayers);
  const cardPage = pagedRows("cards", visibleCards);

  document.querySelector("#playerSettings").innerHTML = `
    <div class="player-library-head">
      <span>编号</span>
      <span>昵称</span>
      <span>抖音名</span>
      <span>微信名</span>
      <span>游戏名</span>
      <span>备注</span>
    </div>
    ${playerPage.map(({ player, index }) => playerLibraryRow(player, index)).join("")}
  `;
  document.querySelector("#playerLibraryPager").innerHTML = paginationHtml("players", visiblePlayers.length);

  document.querySelector("#cardLibrary").innerHTML = `
    <div class="card-library-head">
      <span>编号</span>
      <span>名称</span>
      <span>外号</span>
      <span>分类</span>
      <span>标签</span>
      <span>备注</span>
      <span>操作</span>
    </div>
    ${cardPage.map(({ card, index }) => cardLibraryRow(card, index)).join("")}
  `;
  document.querySelector("#cardLibraryPager").innerHTML = paginationHtml("cards", visibleCards.length);

  renderMatchConfig();
}

function pagedRows(type, rows) {
  const pagination = libraryPagination[type];
  const totalPages = Math.max(1, Math.ceil(rows.length / pagination.pageSize));
  pagination.page = Math.min(Math.max(1, pagination.page), totalPages);
  const start = (pagination.page - 1) * pagination.pageSize;
  return rows.slice(start, start + pagination.pageSize);
}

function paginationHtml(type, total) {
  const pagination = libraryPagination[type];
  const totalPages = Math.max(1, Math.ceil(total / pagination.pageSize));
  return `
    <span>第 ${pagination.page} / ${totalPages} 页 · 共 ${total} 条</span>
    <label>
      每页
      <select data-library-page-size="${type}">
        ${[5, 10, 15, 20, 30].map((size) => `<option value="${size}" ${pagination.pageSize === size ? "selected" : ""}>${size}</option>`).join("")}
      </select>
    </label>
    <button data-library-page="${type}" data-page-step="-1" type="button" ${pagination.page <= 1 ? "disabled" : ""}>上一页</button>
    <button data-library-page="${type}" data-page-step="1" type="button" ${pagination.page >= totalPages ? "disabled" : ""}>下一页</button>
  `;
}

function playerLibraryRow(player, index) {
  return `
    <div class="player-library-row">
      <span>${index + 1}</span>
      <input data-player-nickname data-index="${index}" value="${escapeHtml(player.nickname)}" placeholder="昵称">
      <input data-player-douyin data-index="${index}" value="${escapeHtml(player.douyinName || "")}" placeholder="抖音名">
      <input data-player-wechat data-index="${index}" value="${escapeHtml(player.wechatName || "")}" placeholder="微信名">
      <input data-player-game data-index="${index}" value="${escapeHtml(player.gameName || "")}" placeholder="游戏名">
      <input data-player-note data-index="${index}" value="${escapeHtml(player.note || "")}" placeholder="备注">
    </div>
  `;
}

function cardLibraryRow(card, index) {
  return `
    <div class="card-library-row">
      <span>${index + 1}</span>
      <input data-card-name data-index="${index}" value="${escapeHtml(card.name)}" placeholder="五费名称">
      <input data-card-alias data-index="${index}" value="${escapeHtml(card.alias || "")}" placeholder="外号">
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

function renderMatchConfig() {
  document.querySelector("#matchConfigSummary").textContent = `${activePlayers().length} 名玩家 · ${activeCards().length} 张五费`;
  renderActiveMatchPlayers();
  renderActiveMatchCards();
  renderMatchPlayerCandidates();
  renderMatchCardCandidates();
}

function renderActiveMatchPlayers() {
  const players = activePlayers();
  const missingSlots = Array.from({ length: Math.max(0, 8 - players.length) }, (_, index) => `
    <span class="match-token missing-token">缺少玩家 ${index + 1}</span>
  `).join("");
  document.querySelector("#matchPlayerList").innerHTML = `
    ${players.map((player) => `
      <span class="match-token">
        ${escapeHtml(player.nickname)}
        <button data-remove-match-player="${escapeHtml(player.id)}" type="button" aria-label="移除${escapeHtml(player.nickname)}">×</button>
      </span>
    `).join("")}
    ${missingSlots}
  `;
}

function renderActiveMatchCards() {
  const groups = Object.keys(cardCategories).map((category) => ({
    category,
    cards: activeCards().filter((card) => card.category === category),
  }));
  document.querySelector("#matchCardList").innerHTML = groups
    .filter((group) => group.cards.length)
    .map((group) => `
      <details class="match-card-group" ${group.category === "optional" ? "open" : ""}>
        <summary>${matchCardGroupTitle(group)}</summary>
        <div class="match-selected-list">
          ${group.cards.map((card) => `
            <span class="match-token tag ${categoryClass(card.category)}" title="${escapeHtml(cardTitle(card.id))}">
              ${escapeHtml(cardLabel(card.id))}
              <button data-remove-match-card="${escapeHtml(card.id)}" type="button" aria-label="移除${escapeHtml(card.name)}">×</button>
            </span>
          `).join("")}
        </div>
      </details>
    `).join("") || `<span class="meta">暂无本场五费</span>`;
}

function matchCardGroupTitle(group) {
  if (group.category === "optional") return `${cardCategories[group.category]} · 已选 ${group.cards.length} / 2`;
  return `${cardCategories[group.category]} · ${group.cards.length} 张`;
}

function renderMatchPlayerCandidates() {
  const query = document.querySelector("#matchPlayerSearch")?.value.trim().toLowerCase() || "";
  if (activePlayers().length >= 8) {
    document.querySelector("#matchPlayerPicker").innerHTML = `<div class="empty">本场玩家已满 8 人。</div>`;
    return;
  }
  const candidates = state.players
    .map((player, index) => ({ player, index }))
    .filter(({ player }) => !player.active)
    .filter(({ player }) => [player.nickname, player.douyinName, player.wechatName, player.gameName, player.note].join(" ").toLowerCase().includes(query));
  document.querySelector("#matchPlayerPicker").innerHTML = candidates.length
    ? candidates.map(({ player, index }, candidateIndex) => `
      <button class="candidate-row" data-add-match-player="${index}" type="button">
        <span>${candidateIndex + 1}. ${escapeHtml(player.nickname)}</span>
        <strong>添加</strong>
      </button>
    `).join("")
    : `<div class="empty">没有可添加玩家。</div>`;
}

function renderMatchCardCandidates() {
  renderMatchCardTagOptions();
  const candidates = matchCardCandidates();
  document.querySelector("#matchCardPicker").innerHTML = candidates.length
    ? candidates.map(({ card, index }, candidateIndex) => `
      <button class="candidate-row" data-add-match-card="${index}" type="button">
        <span class="tag compact-tag ${categoryClass(card.category)}" title="${escapeHtml(cardTitle(card.id))}">${candidateIndex + 1}. ${escapeHtml(cardLabel(card.id))}</span>
        <strong>添加</strong>
      </button>
    `).join("")
    : `<div class="empty">没有可添加五费。</div>`;
}

function renderMatchCardTagOptions() {
  const select = document.querySelector("#matchCardTagFilter");
  const currentValue = select.value || "all";
  const tags = [...new Set(state.cards.flatMap((card) => card.tags || []))];
  select.innerHTML = `<option value="all">全部赛季/标签</option>${tags.map((tag) => `<option value="${escapeHtml(tag)}">${escapeHtml(tag)}</option>`).join("")}`;
  select.value = tags.includes(currentValue) ? currentValue : "all";
}

function matchCardCandidates() {
  const query = document.querySelector("#matchCardSearch")?.value.trim().toLowerCase() || "";
  const category = document.querySelector("#matchCardCategoryFilter")?.value || "all";
  const tag = document.querySelector("#matchCardTagFilter")?.value || "all";
  return state.cards
    .map((card, index) => ({ card, index }))
    .filter(({ card }) => !card.active)
    .filter(({ card }) => category === "all" || card.category === category)
    .filter(({ card }) => tag === "all" || (card.tags || []).includes(tag))
    .filter(({ card }) => [card.name, card.alias, card.category, card.tags.join(" "), card.note].join(" ").toLowerCase().includes(query));
}

function updatePlayerActive(index, active) {
  if (active && activePlayers().length >= 8) return;
  const nextPlayers = readPlayersFromInputs();
  nextPlayers[index].active = active;
  saveLibrary(nextPlayers, readCardsFromInputs());
}

function updateCardActive(index, active) {
  const nextCards = readCardsFromInputs();
  nextCards[index].active = active;
  saveLibrary(readPlayersFromInputs(), nextCards);
}

function currentMatchSnapshot(name) {
  ensureLockSlots();
  const playerIds = activePlayers().map((player) => player.id);
  const cardIds = activeCardIds();
  const lockPlayerIds = new Set(playerIds);
  return {
    id: uid(),
    name: name || `对局 ${formatTime(Date.now())}`,
    createdAt: Date.now(),
    note: "",
    playerIds,
    cardIds,
    locks: state.locks
      .filter((lock) => lockPlayerIds.has(lock.playerId))
      .map((lock) => ({
        playerId: lock.playerId,
        status: lock.status,
        eliminatedAt: lock.eliminatedAt,
        cardIds: sortCardIds((lock.cardIds || []).filter((cardId) => cardIds.includes(cardId))),
        note: lock.note || "",
      })),
  };
}

function renderMatchHistory() {
  const list = document.querySelector("#matchHistoryList");
  if (!state.matchHistory.length) {
    list.innerHTML = `<div class="empty">暂无历史对局。</div>`;
    return;
  }
  list.innerHTML = state.matchHistory
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((record) => matchHistoryRowHtml(record))
    .join("");
}

function matchHistoryRowHtml(record) {
  return `
    <div class="match-history-row">
      <div>
        <strong>${escapeHtml(record.name)}</strong>
        <small>${formatTime(record.createdAt)} · ${record.playerIds.length} 名玩家 · ${record.cardIds.length} 张五费</small>
      </div>
      <div class="history-row-actions">
        <button data-restore-match="${escapeHtml(record.id)}" type="button">恢复</button>
        <button class="danger" data-delete-match="${escapeHtml(record.id)}" type="button">删除</button>
      </div>
    </div>
  `;
}

function restoreMatchSnapshot(recordId) {
  const record = state.matchHistory.find((item) => item.id === recordId);
  if (!record) return;
  if (!confirm(`确认恢复「${record.name}」？当前本场配置和锁牌状态会被替换。`)) return;
  const playerIds = new Set(record.playerIds);
  const cardIds = new Set(record.cardIds);
  state.players = state.players.map((player) => ({ ...player, active: playerIds.has(player.id) }));
  state.cards = state.cards.map((card) => ({ ...card, active: cardIds.has(card.id) }));
  state.locks = record.locks.map((lock) => ({
    playerId: lock.playerId,
    status: lock.status === "eliminated" ? "eliminated" : "alive",
    eliminatedAt: Number.isFinite(lock.eliminatedAt) ? lock.eliminatedAt : null,
    cardIds: sortCardIds(lock.cardIds || []),
    note: lock.note || "",
  }));
  ensureLockSlots();
  saveState();
  renderAll();
}

function quickConfigureCardsByTag() {
  const tag = document.querySelector("#matchCardTagFilter").value;
  if (tag === "all") {
    alert("请先选择一个赛季/标签。");
    return;
  }
  const nextCards = readCardsFromInputs().map((card) => ({ ...card, active: false }));
  const matchedCards = nextCards.filter((card) => (card.tags || []).includes(tag));
  matchedCards
    .filter((card) => card.category === "normal" || card.category === "unlocked")
    .forEach((card) => {
      card.active = true;
    });
  matchedCards
    .filter((card) => card.category === "optional")
    .slice(0, 2)
    .forEach((card) => {
      card.active = true;
    });
  saveLibrary(readPlayersFromInputs(), nextCards);
}

function applyLibrarySettings(nextPlayers, nextCards) {
  const previousPlayers = playerNames();
  const previousCards = cardNames();

  state.players = nextPlayers.map((player, index) => ({
    ...(state.players[index] || {}),
    id: state.players[index]?.id || `player-${index + 1}`,
    nickname: player.nickname || defaultPlayers[index] || `玩家${index + 1}`,
    douyinName: player.douyinName || "",
    wechatName: player.wechatName || "",
    gameName: player.gameName || "",
    active: Boolean(player.active),
    note: player.note || "",
  }));

  state.locks.forEach((player) => {
    player.cardIds = (player.cardIds || player.cards || [])
      .map((card) => {
        if (nextCards.some((item) => item.id === card)) return card;
        const cardIndex = previousCards.indexOf(card);
        return cardIndex >= 0 ? nextCards[cardIndex]?.id : cardIdByName(card, nextCards);
      })
      .filter((cardId, index, cardIds) => nextCards.some((card) => card.id === cardId) && cardIds.indexOf(cardId) === index);
    delete player.cards;
  });

  state.cards = nextCards;
  state.ticketRecords = state.ticketRecords.map((record) => {
    const playerIndex = previousPlayers.indexOf(record.player);
    if (record.playerId) return record;
    return playerIndex >= 0 && nextPlayers[playerIndex] ? { ...record, playerId: nextPlayers[playerIndex].id, player: nextPlayers[playerIndex].nickname } : record;
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
  return text
    .split(/\r?\n/)
    .flatMap((line) => {
      const trimmed = line.trim();
      if (!trimmed) return [];
      if (!trimmed.includes("|")) return splitBatchText(trimmed).map((name) => ({ nickname: name }));
      const [nickname, douyinName = "", wechatName = "", gameName = ""] = trimmed.split("|").map((item) => item.trim());
      return [{ nickname, douyinName, wechatName, gameName }];
    })
    .filter((player) => player.nickname)
    .filter((player, index, players) => players.findIndex((item) => item.nickname === player.nickname) === index)
    .map((player, index) => ({
      id: `player-${Date.now()}-${index}`,
      nickname: player.nickname,
      douyinName: player.douyinName || "",
      wechatName: player.wechatName || "",
      gameName: player.gameName || "",
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
      const [rawName, alias = ""] = parts[0]?.split("|").map((item) => item.trim()) || [];
      const categoryIndex = parts.findIndex((part) => ["正常五费", "解锁五费", "可选五费"].includes(part));
      const name = rawName || `五费${index + 1}`;
      const category = categoryIndex >= 0 ? normalizeCardCategory(parts[categoryIndex]) : "normal";
      const tags = parts.filter((part, partIndex) => partIndex !== 0 && partIndex !== categoryIndex);
      return {
        id: `card-${Date.now()}-${index}`,
        name,
        alias,
        category,
        active: true,
        tags,
        note: "",
      };
    });
}

function readPlayersFromInputs() {
  return state.players.map((player, index) => {
    const nicknameInput = document.querySelector(`[data-player-nickname][data-index="${index}"]`);
    if (!nicknameInput) return player;
    return {
      id: player.id,
      nickname: nicknameInput.value.trim() || defaultPlayers[index] || `玩家${index + 1}`,
      douyinName: document.querySelector(`[data-player-douyin][data-index="${index}"]`).value.trim(),
      wechatName: document.querySelector(`[data-player-wechat][data-index="${index}"]`).value.trim(),
      gameName: document.querySelector(`[data-player-game][data-index="${index}"]`).value.trim(),
      active: player.active,
      note: document.querySelector(`[data-player-note][data-index="${index}"]`).value.trim(),
    };
  });
}

function readCardsFromInputs() {
  return state.cards.map((card, index) => {
    const nameInput = document.querySelector(`[data-card-name][data-index="${index}"]`);
    if (!nameInput) return card;
    return {
      id: card.id,
      name: nameInput.value.trim() || defaultCards[index] || `五费${index + 1}`,
      alias: document.querySelector(`[data-card-alias][data-index="${index}"]`).value.trim(),
      active: card.active,
      category: document.querySelector(`[data-card-category][data-index="${index}"]`).value,
      tags: parseTags(document.querySelector(`[data-card-tags][data-index="${index}"]`).value),
      note: document.querySelector(`[data-card-note][data-index="${index}"]`).value.trim(),
    };
  });
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
  if (hasDuplicate(nextPlayers.map((player) => player.nickname)) || hasDuplicate(cardNamesFrom(nextCards))) {
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
  const balances = Object.fromEntries(ticketPlayers().map((player) => [player.id, 0]));
  state.ticketRecords.forEach((record) => {
    const playerId = record.playerId || playerIdByName(record.player);
    if (!(playerId in balances)) balances[playerId] = 0;
    balances[playerId] += record.type === "deposit" ? record.amount : -record.amount;
  });
  return balances;
}

function renderTicketOptions() {
  document.querySelector("#ticketPlayer").innerHTML = ticketPlayers()
    .map((player, index) => `<option value="${escapeHtml(player.id)}">${escapeHtml(playerDisplayName(player, index))}</option>`)
    .join("");
}

function renderTickets() {
  const balances = ticketBalances();
  const rank = Object.entries(balances).sort((a, b) => b[1] - a[1]);
  document.querySelector("#ticketRank").innerHTML = rank
    .map(([playerId, balance], index) => `
      <div class="rank-row">
        <span>${index + 1}. ${escapeHtml(playerDisplayName(playerById(playerId) || { nickname: "未知玩家" }, index))}</span>
        <span class="balance">${balance}</span>
      </div>
    `)
    .join("");

  const history = state.ticketRecords.slice().sort((a, b) => b.createdAt - a.createdAt);
  document.querySelector("#ticketHistory").innerHTML = history.length
    ? history.map((record) => `
      <div class="history-row">
        <div>
          <strong>${escapeHtml(ticketRecordPlayerName(record))}</strong>
          <small>${formatTime(record.createdAt)} · ${record.note ? escapeHtml(record.note) : "无备注"}</small>
        </div>
        <span class="balance">${record.type === "deposit" ? "+" : "-"}${record.amount}</span>
      </div>
    `).join("")
    : `<div class="empty">暂无存票记录。</div>`;
}

function ticketRecordPlayerName(record) {
  const player = playerById(record.playerId) || playerById(playerIdByName(record.player));
  return player ? playerDisplayName(player) : record.player || "未知玩家";
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

document.querySelector("#playerNameMode").addEventListener("click", (event) => {
  const button = event.target.closest("[data-player-mode]");
  if (!button) return;
  state.displaySettings.playerNameMode = button.dataset.playerMode;
  saveState();
  renderLocks();
  renderTicketOptions();
  renderTickets();
});

document.querySelector("#cardNameMode").addEventListener("click", (event) => {
  const button = event.target.closest("[data-card-mode]");
  if (!button) return;
  state.displaySettings.cardNameMode = button.dataset.cardMode;
  saveState();
  renderLocks();
});

document.querySelector("#matchPlayerList").addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-match-player]");
  if (!button) return;
  const index = state.players.findIndex((player) => player.id === button.dataset.removeMatchPlayer);
  if (index >= 0) updatePlayerActive(index, false);
});

document.querySelector("#matchPlayerPicker").addEventListener("click", (event) => {
  const button = event.target.closest("[data-add-match-player]");
  if (!button) return;
  updatePlayerActive(Number(button.dataset.addMatchPlayer), true);
});

document.querySelector("#matchPlayerSearch").addEventListener("input", renderMatchPlayerCandidates);

document.querySelector("#matchCardList").addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-match-card]");
  if (!button) return;
  const index = state.cards.findIndex((card) => card.id === button.dataset.removeMatchCard);
  if (index >= 0) updateCardActive(index, false);
});

document.querySelector("#matchCardPicker").addEventListener("click", (event) => {
  const button = event.target.closest("[data-add-match-card]");
  if (!button) return;
  updateCardActive(Number(button.dataset.addMatchCard), true);
});

document.querySelector("#matchCardSearch").addEventListener("input", renderMatchCardCandidates);
document.querySelector("#matchCardCategoryFilter").addEventListener("change", renderMatchCardCandidates);
document.querySelector("#matchCardTagFilter").addEventListener("change", renderMatchCardCandidates);

document.querySelector("#quickSeasonConfig").addEventListener("click", quickConfigureCardsByTag);

document.querySelector("#addFilteredCards").addEventListener("click", () => {
  const candidates = matchCardCandidates();
  if (!candidates.length) return;
  const nextCards = readCardsFromInputs();
  candidates.forEach(({ index }) => {
    nextCards[index].active = true;
  });
  saveLibrary(readPlayersFromInputs(), nextCards);
});

document.querySelector("#playerLibrarySearch").addEventListener("input", () => {
  libraryPagination.players.page = 1;
  renderLibrary();
});
document.querySelector("#cardLibrarySearch").addEventListener("input", () => {
  libraryPagination.cards.page = 1;
  renderLibrary();
});

document.querySelectorAll(".pager").forEach((pager) => {
  pager.addEventListener("click", (event) => {
    const button = event.target.closest("[data-library-page]");
    if (!button) return;
    const type = button.dataset.libraryPage;
    libraryPagination[type].page += Number(button.dataset.pageStep);
    renderLibrary();
  });
  pager.addEventListener("change", (event) => {
    const select = event.target.closest("[data-library-page-size]");
    if (!select) return;
    const type = select.dataset.libraryPageSize;
    libraryPagination[type].pageSize = Number(select.value);
    libraryPagination[type].page = 1;
    renderLibrary();
  });
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
    playerId: document.querySelector("#ticketPlayer").value,
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
    const cards = normalizeCards(imported.cards);
    state = {
      screenshots: Array.isArray(imported.screenshots) ? imported.screenshots : [],
      players,
      cards,
      displaySettings: normalizeDisplaySettings(imported.displaySettings),
      locks: normalizeLocks(imported.locks, players, cards),
      ticketRecords: normalizeTicketRecords(imported.ticketRecords, players),
      matchHistory: normalizeMatchHistory(imported.matchHistory, players, cards),
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
  state.locks = activePlayers().map((player) => ({ playerId: player.id, status: "alive", eliminatedAt: null, cardIds: [], note: "" }));
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

document.querySelector("#saveMatchSnapshot").addEventListener("click", () => {
  const nameInput = document.querySelector("#matchSnapshotName");
  const snapshot = currentMatchSnapshot(nameInput.value.trim());
  state.matchHistory.push(snapshot);
  saveState();
  nameInput.value = "";
  renderMatchHistory();
});

document.querySelector("#matchHistoryList").addEventListener("click", (event) => {
  const restoreButton = event.target.closest("[data-restore-match]");
  if (restoreButton) {
    restoreMatchSnapshot(restoreButton.dataset.restoreMatch);
    return;
  }
  const deleteButton = event.target.closest("[data-delete-match]");
  if (!deleteButton) return;
  const record = state.matchHistory.find((item) => item.id === deleteButton.dataset.deleteMatch);
  if (!record || !confirm(`确认删除「${record.name}」？`)) return;
  state.matchHistory = state.matchHistory.filter((item) => item.id !== record.id);
  saveState();
  renderMatchHistory();
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
    alias: "",
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
  const card = state.cards[index];
  if (!confirm(`确认删除「${card.name}」？已有锁牌中的这张卡也会被移除。`)) return;
  state.cards.splice(index, 1);
  state.locks.forEach((player) => {
    player.cardIds = (player.cardIds || []).filter((cardId) => cardId !== card.id);
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
  renderMatchHistory();
}

renderAll();
