(function () {
  "use strict";

  const LS_CUSTOM_WORD = "imposter_custom_packs";
  const LS_CUSTOM_QUESTION = "imposter_custom_question_packs";
  const LS_WORD_OVERRIDES = "imposter_word_overrides";
  const LS_QUESTION_OVERRIDES = "imposter_question_overrides";
  const LS_SETUP = "imposter_setup_v2";

  const main = document.getElementById("main");
  const tabBar = document.getElementById("tabBar");
  const headerSubtitle = document.getElementById("headerSubtitle");
  const appScroll = document.getElementById("appScroll") || document.querySelector(".app-scroll");
  const headerPlayMode = document.getElementById("headerPlayMode");
  const headerSetupMode = document.getElementById("headerSetupMode");
  const setupBack = document.getElementById("setupBack");
  const setupTitle = document.getElementById("setupTitle");
  const setupGear = document.getElementById("setupGear");

  /** @type {{ category: string, words: string[] }[]} */
  let wordPacksEffective = [];
  /** @type {{ category: string, pairs: { crewQuestion: string, imposterQuestion: string }[] }[]} */
  let questionPacksEffective = [];

  /** @type {{ category: string, words: string[] }[]} Custom categories; words may be empty until you add some. */
  let customWordCategories = [];
  /** @type {{ category: string, pairs: { crewQuestion: string, imposterQuestion: string }[] }[]} */
  let customQuestionCategories = [];

  let uiTab = "play";
  /** @type {'word' | 'question'} */
  let uiPacksKind = "word";
  /** @type {null | { kind: 'effective', index: number } | { kind: 'customDraft', customIndex: number }} */
  let packsWordEditTarget = null;
  /** @type {null | { kind: 'effective', index: number } | { kind: 'customDraft', customIndex: number }} */
  let packsQuestionEditTarget = null;

  /** Count of built-in / file word packs in `wordPacksEffective` (before your in-game custom categories). */
  let wordBasePackCount = 0;
  /** Same for question packs. */
  let questionBasePackCount = 0;

  /** @type {Record<string, { words: string[] }>} Edits to default/file word categories by category name. */
  let wordPackOverrides = {};
  /** @type {Record<string, { pairs: { crewQuestion: string, imposterQuestion: string }[] }>} */
  let questionPackOverrides = {};
  let bootstrapping = true;

  /** @type {((e: KeyboardEvent) => void) | null} */
  let revealFaceDownEscHandler = null;

  function clearRevealFaceDownEsc() {
    if (revealFaceDownEscHandler) {
      document.removeEventListener("keydown", revealFaceDownEscHandler);
      revealFaceDownEscHandler = null;
    }
  }

  /** @type {{ setupView: 'main'|'categories'|'players', gameMode: 'word'|'question', players: string[], imposterCount: number, wordPoolIndices: number[], questionPoolIndices: number[], showCategoryToImposter: boolean, impostersKnowEachOther: boolean, word: string, category: string, crewQuestion: string, imposterQuestion: string, answers: Record<number, string>, imposters: Set<number>, phase: string, revealSeen: Set<number>, revealViewingIndex: number | null, revealFaceDown: boolean, starterIndex: number }} */
  let state = {
    setupView: "main",
    gameMode: "word",
    players: [],
    imposterCount: 1,
    wordPoolIndices: [],
    questionPoolIndices: [],
    showCategoryToImposter: true,
    impostersKnowEachOther: false,
    word: "",
    category: "",
    crewQuestion: "",
    imposterQuestion: "",
    answers: {},
    imposters: new Set(),
    phase: "setup",
    revealSeen: new Set(),
    revealViewingIndex: null,
    revealFaceDown: true,
    starterIndex: 0,
  };

  function saveSetupPrefs() {
    try {
      localStorage.setItem(
        LS_SETUP,
        JSON.stringify({
          wordPoolIndices: state.wordPoolIndices,
          questionPoolIndices: state.questionPoolIndices,
          showCategoryToImposter: state.showCategoryToImposter,
          impostersKnowEachOther: state.impostersKnowEachOther,
          gameMode: state.gameMode,
        })
      );
    } catch {
      /* ignore */
    }
  }

  function loadSetupPrefs() {
    try {
      const raw = localStorage.getItem(LS_SETUP);
      if (!raw) return;
      const o = JSON.parse(raw);
      if (Array.isArray(o.wordPoolIndices)) state.wordPoolIndices = o.wordPoolIndices.map(Number).filter((n) => Number.isInteger(n));
      if (Array.isArray(o.questionPoolIndices))
        state.questionPoolIndices = o.questionPoolIndices.map(Number).filter((n) => Number.isInteger(n));
      if (typeof o.showCategoryToImposter === "boolean") state.showCategoryToImposter = o.showCategoryToImposter;
      if (typeof o.impostersKnowEachOther === "boolean") state.impostersKnowEachOther = o.impostersKnowEachOther;
      if (o.gameMode === "question" || o.gameMode === "word") state.gameMode = o.gameMode;
    } catch {
      /* ignore */
    }
  }

  function clampPoolsToLengths() {
    const wl = wordPacksEffective.length;
    state.wordPoolIndices = [...new Set(state.wordPoolIndices.filter((i) => i >= 0 && i < wl))].sort(
      (a, b) => a - b
    );
    if (state.wordPoolIndices.length === 0) {
      state.wordPoolIndices = Array.from({ length: wl }, (_, i) => i);
    }

    const ql = questionPacksEffective.length;
    state.questionPoolIndices = [...new Set(state.questionPoolIndices.filter((i) => i >= 0 && i < ql))].sort(
      (a, b) => a - b
    );
    if (state.questionPoolIndices.length === 0) {
      state.questionPoolIndices = Array.from({ length: ql }, (_, i) => i);
    }
  }

  function togglePoolIndex(kind, index) {
    const key = kind === "word" ? "wordPoolIndices" : "questionPoolIndices";
    let arr = [...state[key]];
    const pos = arr.indexOf(index);
    if (pos >= 0) {
      if (arr.length <= 1) return;
      arr.splice(pos, 1);
    } else {
      arr.push(index);
      arr.sort((a, b) => a - b);
    }
    state[key] = arr;
    saveSetupPrefs();
  }

  function buildWordPoolEntries() {
    const entries = [];
    for (const i of state.wordPoolIndices) {
      const p = wordPacksEffective[i];
      if (!p) continue;
      for (const w of p.words) entries.push({ word: w, category: p.category });
    }
    return entries;
  }

  function buildQuestionPoolEntries() {
    const entries = [];
    for (const i of state.questionPoolIndices) {
      const p = questionPacksEffective[i];
      if (!p) continue;
      for (const pair of p.pairs) {
        entries.push({
          crewQuestion: pair.crewQuestion,
          imposterQuestion: pair.imposterQuestion,
          category: p.category,
        });
      }
    }
    return entries;
  }

  function poolEntryCount() {
    return state.gameMode === "word" ? buildWordPoolEntries().length : buildQuestionPoolEntries().length;
  }

  function normalizeWordPack(raw) {
    if (!raw || typeof raw.category !== "string") return null;
    const category = raw.category.trim();
    if (!category) return null;
    let words = raw.words;
    if (typeof words === "string") {
      words = words
        .split(/[\n,]+/)
        .map((w) => w.trim())
        .filter(Boolean);
    }
    if (!Array.isArray(words) || words.length === 0) return null;
    const clean = [
      ...new Set(
        words
          .map((w) => String(w).trim())
          .filter(Boolean)
          .map((w) => w.slice(0, 64))
      ),
    ];
    if (clean.length === 0) return null;
    return { category, words: clean };
  }

  function normalizeQuestionPack(raw) {
    if (!raw || typeof raw.category !== "string") return null;
    const category = raw.category.trim();
    if (!category) return null;
    let pairs = raw.pairs;
    if (!Array.isArray(pairs) || pairs.length === 0) return null;
    const out = [];
    for (const p of pairs) {
      if (!p) continue;
      const cq = String(p.crewQuestion ?? "").trim();
      const iq = String(p.imposterQuestion ?? "").trim();
      if (!cq || !iq) continue;
      out.push({
        crewQuestion: cq.slice(0, 500),
        imposterQuestion: iq.slice(0, 500),
      });
    }
    if (out.length === 0) return null;
    return { category, pairs: out };
  }

  function parsePairsFromLines(text) {
    return text
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const idx = line.indexOf("|||");
        if (idx === -1) return null;
        const crewQuestion = line.slice(0, idx).trim();
        const imposterQuestion = line.slice(idx + 3).trim();
        if (!crewQuestion || !imposterQuestion) return null;
        return {
          crewQuestion: crewQuestion.slice(0, 500),
          imposterQuestion: imposterQuestion.slice(0, 500),
        };
      })
      .filter(Boolean);
  }

  /** Category entry for editor; words can be empty. */
  function normalizeWordWords(words) {
    const arr = Array.isArray(words) ? words : [];
    return [
      ...new Set(
        arr
          .map((w) => String(w).trim())
          .filter(Boolean)
          .map((w) => w.slice(0, 64))
      ),
    ];
  }

  function normalizeQuestionPairsInline(pairs) {
    const out = [];
    for (const p of pairs || []) {
      if (!p) continue;
      const cq = String(p.crewQuestion ?? "").trim();
      const iq = String(p.imposterQuestion ?? "").trim();
      if (!cq || !iq) continue;
      out.push({
        crewQuestion: cq.slice(0, 500),
        imposterQuestion: iq.slice(0, 500),
      });
    }
    return out;
  }

  function loadWordOverrides() {
    try {
      const raw = localStorage.getItem(LS_WORD_OVERRIDES);
      if (!raw) return {};
      const o = JSON.parse(raw);
      if (!o || typeof o !== "object" || Array.isArray(o)) return {};
      /** @type {Record<string, { words: string[] }>} */
      const out = {};
      for (const [k, v] of Object.entries(o)) {
        const cat = String(k).trim();
        if (!cat) continue;
        if (!v || !Array.isArray(v.words)) continue;
        out[cat] = { words: normalizeWordWords(v.words) };
      }
      return out;
    } catch {
      return {};
    }
  }

  function loadQuestionOverrides() {
    try {
      const raw = localStorage.getItem(LS_QUESTION_OVERRIDES);
      if (!raw) return {};
      const o = JSON.parse(raw);
      if (!o || typeof o !== "object" || Array.isArray(o)) return {};
      /** @type {Record<string, { pairs: { crewQuestion: string, imposterQuestion: string }[] }>} */
      const out = {};
      for (const [k, v] of Object.entries(o)) {
        const cat = String(k).trim();
        if (!cat) continue;
        if (!v || !Array.isArray(v.pairs)) continue;
        out[cat] = { pairs: normalizeQuestionPairsInline(v.pairs) };
      }
      return out;
    } catch {
      return {};
    }
  }

  function saveWordOverridesToStorage() {
    try {
      localStorage.setItem(LS_WORD_OVERRIDES, JSON.stringify(wordPackOverrides));
    } catch {
      /* ignore */
    }
    rebuildWordPacks();
    clampPoolsToLengths();
    saveSetupPrefs();
  }

  function saveQuestionOverridesToStorage() {
    try {
      localStorage.setItem(LS_QUESTION_OVERRIDES, JSON.stringify(questionPackOverrides));
    } catch {
      /* ignore */
    }
    rebuildQuestionPacks();
    clampPoolsToLengths();
    saveSetupPrefs();
  }

  function sanitizeWordCategory(raw) {
    if (!raw || typeof raw.category !== "string") return null;
    const category = raw.category.trim().slice(0, 48);
    if (!category) return null;
    let words = raw.words;
    if (typeof words === "string") {
      words = words
        .split(/[\n,]+/)
        .map((w) => w.trim())
        .filter(Boolean);
    }
    if (!Array.isArray(words)) words = [];
    const clean = normalizeWordWords(words);
    return { category, words: clean };
  }

  function sanitizeQuestionCategory(raw) {
    if (!raw || typeof raw.category !== "string") return null;
    const category = raw.category.trim().slice(0, 48);
    if (!category) return null;
    let pairs = raw.pairs;
    if (!Array.isArray(pairs)) pairs = [];
    const out = normalizeQuestionPairsInline(pairs);
    return { category, pairs: out };
  }

  function loadWordCategoriesFromStorage() {
    try {
      const raw = localStorage.getItem(LS_CUSTOM_WORD);
      if (!raw) return [];
      const data = JSON.parse(raw);
      if (!Array.isArray(data)) return [];
      return data.map(sanitizeWordCategory).filter(Boolean);
    } catch {
      return [];
    }
  }

  function loadQuestionCategoriesFromStorage() {
    try {
      const raw = localStorage.getItem(LS_CUSTOM_QUESTION);
      if (!raw) return [];
      const data = JSON.parse(raw);
      if (!Array.isArray(data)) return [];
      return data.map(sanitizeQuestionCategory).filter(Boolean);
    } catch {
      return [];
    }
  }

  function persistWordCategories() {
    localStorage.setItem(LS_CUSTOM_WORD, JSON.stringify(customWordCategories));
    rebuildWordPacks();
    clampPoolsToLengths();
    saveSetupPrefs();
  }

  function persistQuestionCategories() {
    localStorage.setItem(LS_CUSTOM_QUESTION, JSON.stringify(customQuestionCategories));
    rebuildQuestionPacks();
    clampPoolsToLengths();
    saveSetupPrefs();
  }

  function rebuildWordPacks() {
    const builtin = (window.WORD_PACKS_BUILTIN || [])
      .map(normalizeWordPack)
      .filter(Boolean);
    let fromFile = [];
    if (window.__WORD_PACKS_FILE__ && Array.isArray(window.__WORD_PACKS_FILE__)) {
      fromFile = window.__WORD_PACKS_FILE__.map(normalizeWordPack).filter(Boolean);
    }
    const baseWords = fromFile.length > 0 ? fromFile : builtin;
    wordBasePackCount = baseWords.length;
    const baseMapped = baseWords.map((p) => {
      const o = wordPackOverrides[p.category];
      const raw = o && Array.isArray(o.words) ? o.words : p.words;
      return { category: p.category, words: normalizeWordWords(raw) };
    });
    const customInGame = customWordCategories
      .filter((c) => c.words.length > 0)
      .map((c) => ({
        category: c.category,
        words: normalizeWordWords(c.words),
      }));
    wordPacksEffective = [...baseMapped, ...customInGame];
    if (wordPacksEffective.length === 0) {
      wordPacksEffective = [{ category: "Default", words: ["mystery"] }];
      wordBasePackCount = 1;
    }
  }

  function rebuildQuestionPacks() {
    const builtin = (window.QUESTION_PACKS_BUILTIN || [])
      .map(normalizeQuestionPack)
      .filter(Boolean);
    let fromFile = [];
    if (window.__QUESTION_PACKS_FILE__ && Array.isArray(window.__QUESTION_PACKS_FILE__)) {
      fromFile = window.__QUESTION_PACKS_FILE__.map(normalizeQuestionPack).filter(Boolean);
    }
    const baseQ = fromFile.length > 0 ? fromFile : builtin;
    questionBasePackCount = baseQ.length;
    const baseMapped = baseQ.map((p) => {
      const o = questionPackOverrides[p.category];
      const raw = o && Array.isArray(o.pairs) ? o.pairs : p.pairs;
      return { category: p.category, pairs: normalizeQuestionPairsInline(raw) };
    });
    const customInGame = customQuestionCategories
      .filter((c) => c.pairs.length > 0)
      .map((c) => ({
        category: c.category,
        pairs: normalizeQuestionPairsInline(c.pairs),
      }));
    questionPacksEffective = [...baseMapped, ...customInGame];
    if (questionPacksEffective.length === 0) {
      questionPacksEffective = [
        {
          category: "Default",
          pairs: [
            {
              crewQuestion: "Pick a number from 1 to 10 for how your day went.",
              imposterQuestion: "Pick a number from 1 to 10 for your energy level right now.",
            },
          ],
        },
      ];
      questionBasePackCount = 1;
    }
  }

  function customWordCategoryNameTaken(name, excludeIndex) {
    const n = name.trim().toLowerCase();
    return customWordCategories.some(
      (c, i) => i !== excludeIndex && c.category.trim().toLowerCase() === n
    );
  }

  function customQuestionCategoryNameTaken(name, excludeIndex) {
    const n = name.trim().toLowerCase();
    return customQuestionCategories.some(
      (c, i) => i !== excludeIndex && c.category.trim().toLowerCase() === n
    );
  }

  async function fetchWordPacksFile() {
    try {
      const res = await fetch("word-packs.json");
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) window.__WORD_PACKS_FILE__ = data;
    } catch {
      /* optional */
    }
  }

  async function fetchQuestionPacksFile() {
    try {
      const res = await fetch("question-packs.json");
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) window.__QUESTION_PACKS_FILE__ = data;
    } catch {
      /* optional */
    }
  }

  function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function shuffleInPlace(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function assignImposters(playerCount, count) {
    const idx = shuffleInPlace(
      Array.from({ length: playerCount }, (_, i) => i)
    ).slice(0, Math.min(count, playerCount - 1));
    return new Set(idx);
  }

  function pickStarter() {
    if (state.players.length === 0) return 0;
    return Math.floor(Math.random() * state.players.length);
  }

  function fellowImposterLine(selfIndex) {
    const names = [...state.imposters]
      .filter((i) => i !== selfIndex)
      .map((i) => state.players[i])
      .filter(Boolean);
    if (names.length === 0) return "";
    return `<p class="hint" style="margin-top:12px">Fellow imposters: <strong>${names
      .map(escapeHtml)
      .join(", ")}</strong></p>`;
  }

  /** Category shown above the face-down card; mirrors post-flip visibility rules. */
  function categoryPreviewAboveCard(i) {
    const isImposter = state.imposters.has(i);
    const cat = escapeHtml(state.category);

    if (state.gameMode === "word") {
      if (!isImposter || state.showCategoryToImposter) {
        return `<div class="reveal-category-band">
          <p class="reveal-category-band__label">Category</p>
          <span class="category-pill">${cat}</span>
        </div>`;
      }
      return `<p class="hint reveal-category-band reveal-category-band--muted">Category is hidden for you this round — flip the card to see your role.</p>`;
    }

    if (!isImposter || state.showCategoryToImposter) {
      return `<div class="reveal-category-band">
        <p class="reveal-category-band__label">${!isImposter ? "This round’s theme" : "Category"}</p>
        <span class="category-pill">${cat}</span>
      </div>`;
    }
    return `<p class="hint reveal-category-band reveal-category-band--muted">Category is hidden for you — flip the card for your question.</p>`;
  }

  function updateChrome() {
    const inGame = state.phase !== "setup";
    if (tabBar) tabBar.hidden = inGame || bootstrapping;
    if (appScroll) appScroll.classList.toggle("app-scroll--no-tab", inGame || bootstrapping);
    if (main) main.classList.toggle("game-active", inGame);

    const showPlayHeader = inGame || bootstrapping || uiTab === "library";
    if (headerPlayMode) headerPlayMode.classList.toggle("hidden", !showPlayHeader);
    if (headerSetupMode) headerSetupMode.classList.toggle("hidden", showPlayHeader);

    if (headerSubtitle) {
      if (inGame) headerSubtitle.textContent = "Round in progress";
      else if (uiTab === "library") headerSubtitle.textContent = "Library";
      else headerSubtitle.textContent = "Pass & play";
    }

    if (setupBack && setupTitle && !showPlayHeader) {
      const atMain = state.setupView === "main";
      setupBack.style.visibility = atMain ? "hidden" : "visible";
      setupBack.style.pointerEvents = atMain ? "none" : "auto";
      setupBack.setAttribute("aria-hidden", atMain ? "true" : "false");
      if (state.setupView === "categories") setupTitle.textContent = "Categories in pool";
      else if (state.setupView === "players") setupTitle.textContent = "Players";
      else setupTitle.textContent = "Game Settings";
    }

    if (tabBar) {
      tabBar.querySelectorAll(".tab-bar-btn").forEach((btn) => {
        const tab = btn.getAttribute("data-tab");
        btn.classList.toggle("is-active", !inGame && tab === uiTab);
        if (!inGame && tab === uiTab) btn.setAttribute("aria-current", "page");
        else btn.removeAttribute("aria-current");
      });
    }
  }

  function wireTabs() {
    if (!tabBar) return;
    tabBar.querySelectorAll(".tab-bar-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (state.phase !== "setup") return;
        uiTab = btn.getAttribute("data-tab") || "play";
        if (uiTab === "play") state.setupView = "main";
        render();
      });
    });
  }

  function wireSetupHeader() {
    setupBack?.addEventListener("click", () => {
      if (state.phase !== "setup" || bootstrapping) return;
      if (state.setupView === "main") return;
      state.setupView = "main";
      render();
    });
    setupGear?.addEventListener("click", () => {
      if (state.phase !== "setup" || bootstrapping) return;
      uiTab = "library";
      render();
    });
  }

  function startGame() {
    const n = state.players.length;
    if (n < 3) return;

    const entries =
      state.gameMode === "word" ? buildWordPoolEntries() : buildQuestionPoolEntries();
    if (entries.length === 0) {
      alert("Turn on at least one category that has content for this game mode, or add items in the Library tab.");
      return;
    }

    state.imposters = assignImposters(n, state.imposterCount);
    state.revealSeen = new Set();
    state.revealViewingIndex = null;
    state.revealFaceDown = true;
    state.answers = {};

    if (state.gameMode === "word") {
      const pick = pickRandom(entries);
      state.word = pick.word;
      state.category = pick.category;
      state.crewQuestion = "";
      state.imposterQuestion = "";
    } else {
      const pick = pickRandom(entries);
      state.category = pick.category;
      state.crewQuestion = pick.crewQuestion;
      state.imposterQuestion = pick.imposterQuestion;
      state.word = "";
    }

    state.phase = "reveal_pass";
    render();
  }

  function escapeHtml(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function resetRoundToMenu() {
    if (!confirm("Quit this round and go back to the menu? This round’s progress will be lost.")) return;
    clearRevealFaceDownEsc();
    state.phase = "setup";
    state.setupView = "main";
    state.word = "";
    state.crewQuestion = "";
    state.imposterQuestion = "";
    state.answers = {};
    state.imposters = new Set();
    state.revealSeen = new Set();
    state.revealViewingIndex = null;
    state.revealFaceDown = true;
    render();
  }

  function wireQuitRoundButton() {
    document.getElementById("quitRoundBtn")?.addEventListener("click", () => resetRoundToMenu());
  }

  function libraryBackupCardHtml() {
    return `<div class="card card--calm library-backup-card">
      <p class="sheet-label">Backup &amp; restore</p>
      <p class="hint hint--spaced">Save or load your <strong>custom</strong> categories and on-device edits to built-in lists (one JSON file).</p>
      <div class="row library-backup-row">
        <button type="button" class="btn btn-secondary" id="exportLibraryBtn">Export library</button>
        <label class="btn btn-secondary library-backup-import-label">
          Import…
          <input type="file" id="importLibraryInput" accept="application/json,.json" hidden />
        </label>
      </div>
    </div>`;
  }

  function exportLibraryJson() {
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      customWordCategories,
      customQuestionCategories,
      wordPackOverrides,
      questionPackOverrides,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = "imposter-library.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function applyImportedLibrary(jsonText) {
    const data = JSON.parse(jsonText);
    if (!data || typeof data !== "object") throw new Error("Invalid file.");

    if (Array.isArray(data.customWordCategories)) {
      customWordCategories = data.customWordCategories.map(sanitizeWordCategory).filter(Boolean);
    }
    if (Array.isArray(data.customQuestionCategories)) {
      customQuestionCategories = data.customQuestionCategories.map(sanitizeQuestionCategory).filter(Boolean);
    }

    if (data.wordPackOverrides && typeof data.wordPackOverrides === "object" && !Array.isArray(data.wordPackOverrides)) {
      const next = {};
      for (const [k, v] of Object.entries(data.wordPackOverrides)) {
        const cat = String(k).trim();
        if (!cat || !v || !Array.isArray(v.words)) continue;
        next[cat] = { words: normalizeWordWords(v.words) };
      }
      wordPackOverrides = next;
    }

    if (data.questionPackOverrides && typeof data.questionPackOverrides === "object" && !Array.isArray(data.questionPackOverrides)) {
      const next = {};
      for (const [k, v] of Object.entries(data.questionPackOverrides)) {
        const cat = String(k).trim();
        if (!cat || !v || !Array.isArray(v.pairs)) continue;
        next[cat] = { pairs: normalizeQuestionPairsInline(v.pairs) };
      }
      questionPackOverrides = next;
    }

    try {
      localStorage.setItem(LS_CUSTOM_WORD, JSON.stringify(customWordCategories));
      localStorage.setItem(LS_CUSTOM_QUESTION, JSON.stringify(customQuestionCategories));
      localStorage.setItem(LS_WORD_OVERRIDES, JSON.stringify(wordPackOverrides));
      localStorage.setItem(LS_QUESTION_OVERRIDES, JSON.stringify(questionPackOverrides));
    } catch {
      throw new Error("Could not save to this device’s storage.");
    }

    rebuildWordPacks();
    rebuildQuestionPacks();
    clampPoolsToLengths();
    saveSetupPrefs();
    packsWordEditTarget = null;
    packsQuestionEditTarget = null;
  }

  function wireLibraryBackup() {
    document.getElementById("exportLibraryBtn")?.addEventListener("click", () => {
      try {
        exportLibraryJson();
      } catch (e) {
        alert(String(e?.message || e));
      }
    });
    const inp = document.getElementById("importLibraryInput");
    if (inp) {
      inp.addEventListener("change", () => {
        const file = inp.files && inp.files[0];
        inp.value = "";
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          try {
            if (
              !confirm(
                "Replace this device’s custom categories and built-in list overrides with the file? This cannot be undone."
              )
            ) {
              return;
            }
            applyImportedLibrary(String(reader.result));
            render();
            alert("Library imported.");
          } catch (err) {
            alert(err?.message || "Import failed.");
          }
        };
        reader.onerror = () => alert("Could not read file.");
        reader.readAsText(file, "utf-8");
      });
    }
  }

  function renderSetupMain() {
    const n = state.players.length;
    const maxImp = Math.max(1, n - 1);
    if (state.imposterCount > maxImp) state.imposterCount = maxImp;
    if (state.imposterCount < 1) state.imposterCount = 1;

    const canStart = n >= 3 && poolEntryCount() > 0;

    main.innerHTML = `
      <div class="settings-page">
        <div class="stat-grid">
          <button type="button" class="stat-card" id="openPlayers" aria-label="Edit players">
            <div class="stat-card__icon" aria-hidden="true">👥</div>
            <p class="stat-card__label">How many players?</p>
            <p class="stat-card__value">${n}</p>
          </button>
          <div class="stat-card" style="cursor:default">
            <div class="stat-card__icon" aria-hidden="true">🔎</div>
            <p class="stat-card__label">How many imposters?</p>
            <p class="stat-card__value">${state.imposterCount}</p>
            <div class="imp-stepper">
              <button type="button" id="impMinus" aria-label="Fewer imposters">−</button>
              <button type="button" id="impPlus" aria-label="More imposters">+</button>
            </div>
          </div>
        </div>

        <div>
          <div class="section-head"><span class="section-icon" aria-hidden="true">✦</span> Game mode</div>
          <div class="mode-row">
            <button type="button" class="mode-card ${state.gameMode === "word" ? "is-selected" : ""}" data-mode="word">
              <div class="mode-card__icon" aria-hidden="true">Tt</div>
              <p class="mode-card__title">Word game</p>
              <p class="mode-card__desc">Find who doesn’t know the secret word.</p>
            </button>
            <button type="button" class="mode-card ${state.gameMode === "question" ? "is-selected" : ""}" data-mode="question">
              <div class="mode-card__icon" aria-hidden="true">?</div>
              <p class="mode-card__title">Question game</p>
              <p class="mode-card__desc">Find who got a different question.</p>
            </button>
          </div>
        </div>

        <div>
          <div class="section-head"><span class="section-icon" aria-hidden="true">◇</span> Categories</div>
          <div class="panel-card">
            <button type="button" class="categories-row-btn" id="openCategories">
              <span class="categories-row-btn__label">Categories for this round</span>
              <span class="chevron" aria-hidden="true">›</span>
            </button>
            <div class="panel-divider"></div>
            <div class="toggle-row">
              <div class="toggle-row__text">
                <span class="toggle-row__icon" aria-hidden="true">👁</span>
                <div>
                  <p class="toggle-row__label">Show category to imposter</p>
                  <p class="toggle-row__hint">If off, imposters won’t see the category name on their card.</p>
                </div>
              </div>
              <button type="button" class="switch" id="toggleShowCat" role="switch" aria-checked="${state.showCategoryToImposter}"></button>
            </div>
            <div class="panel-divider"></div>
            <div class="toggle-row">
              <div class="toggle-row__text">
                <span class="toggle-row__icon" aria-hidden="true">👥</span>
                <div>
                  <p class="toggle-row__label">Imposters know each other</p>
                  <p class="toggle-row__hint">Imposter cards show the other imposters’ names when there are multiple.</p>
                </div>
              </div>
              <button type="button" class="switch" id="toggleKnow" role="switch" aria-checked="${state.impostersKnowEachOther}"></button>
            </div>
          </div>
        </div>

        <div class="screen-actions" style="margin-top:8px">
          <button type="button" class="btn btn-start-game btn-block" id="startBtn" ${canStart ? "" : "disabled"}>Start game</button>
        </div>
      </div>
    `;

    document.getElementById("openPlayers").addEventListener("click", () => {
      state.setupView = "players";
      render();
    });

    document.getElementById("openCategories").addEventListener("click", () => {
      state.setupView = "categories";
      render();
    });

    document.getElementById("impMinus").addEventListener("click", () => {
      if (state.imposterCount > 1) {
        state.imposterCount -= 1;
        render();
      }
    });
    document.getElementById("impPlus").addEventListener("click", () => {
      if (state.imposterCount < maxImp) {
        state.imposterCount += 1;
        render();
      }
    });
    document.getElementById("impMinus").disabled = state.imposterCount <= 1;
    document.getElementById("impPlus").disabled = state.imposterCount >= maxImp;

    main.querySelectorAll(".mode-card[data-mode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.gameMode = btn.getAttribute("data-mode") === "question" ? "question" : "word";
        saveSetupPrefs();
        render();
      });
    });

    const swCat = document.getElementById("toggleShowCat");
    swCat.addEventListener("click", () => {
      state.showCategoryToImposter = !state.showCategoryToImposter;
      swCat.setAttribute("aria-checked", String(state.showCategoryToImposter));
      saveSetupPrefs();
    });

    const swKnow = document.getElementById("toggleKnow");
    swKnow.addEventListener("click", () => {
      state.impostersKnowEachOther = !state.impostersKnowEachOther;
      swKnow.setAttribute("aria-checked", String(state.impostersKnowEachOther));
      saveSetupPrefs();
    });

    document.getElementById("startBtn").addEventListener("click", startGame);
  }

  function renderSetupCategories() {
    const isWord = state.gameMode === "word";
    const packs = isWord ? wordPacksEffective : questionPacksEffective;
    const selected = new Set(isWord ? state.wordPoolIndices : state.questionPoolIndices);
    const kind = isWord ? "word" : "question";

    const rows = packs
      .map((p, i) => {
        const on = selected.has(i);
        return `
        <div class="category-pool-item ${on ? "is-on" : ""}">
          <span class="category-pool-item__title">${escapeHtml(p.category)}</span>
          <button type="button" class="switch pool-toggle" data-pool-i="${i}" role="switch" aria-checked="${on}" aria-label="Include ${escapeHtml(
          p.category
        )} in pool"></button>
        </div>`;
      })
      .join("");

    main.innerHTML = `
      <div class="settings-page">
        <p class="pool-hint pool-hint--soft">
          Turn on the themes that may appear this round. The game draws <strong>one</strong> random prompt from anything you include. Leave at least one on.
        </p>
        <div class="panel-card panel-card--flush category-pool-list">${rows}</div>
      </div>
    `;

    main.querySelectorAll(".pool-toggle").forEach((btn) => {
      btn.addEventListener("click", () => {
        const i = Number(btn.getAttribute("data-pool-i"));
        const arr = [...(kind === "word" ? state.wordPoolIndices : state.questionPoolIndices)];
        if (arr.includes(i) && arr.length <= 1) return;
        togglePoolIndex(kind, i);
        render();
      });
    });
  }

  function renderSetupPlayers() {
    main.innerHTML = `
      <div class="settings-page">
        <p class="hint hint--spaced">Add at least 3 players. Pass order follows this list.</p>
        <div class="card card--calm">
          <div class="row">
            <input type="text" id="nameInput" placeholder="Name" maxlength="24" autocomplete="off" />
            <button type="button" class="btn btn-secondary" id="addPlayer">Add</button>
          </div>
          <ul class="player-list" id="playerList"></ul>
        </div>
      </div>
    `;

    const nameInput = document.getElementById("nameInput");
    const addBtn = document.getElementById("addPlayer");
    const list = document.getElementById("playerList");

    function refreshList() {
      list.innerHTML = state.players
        .map(
          (name, i) => `
        <li>
          <span>${escapeHtml(name)}</span>
          <button type="button" data-i="${i}">Remove</button>
        </li>`
        )
        .join("");
      list.querySelectorAll("button[data-i]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const idx = Number(btn.getAttribute("data-i"));
          state.players.splice(idx, 1);
          refreshList();
        });
      });
    }

    function addPlayer() {
      const raw = nameInput.value.trim();
      if (!raw) return;
      state.players.push(raw.slice(0, 24));
      nameInput.value = "";
      nameInput.focus();
      refreshList();
    }

    addBtn.addEventListener("click", addPlayer);
    nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addPlayer();
      }
    });
    refreshList();
    nameInput.focus();
  }

  function validatePacksWordEditTarget() {
    if (!packsWordEditTarget) return;
    if (packsWordEditTarget.kind === "effective") {
      const ix = packsWordEditTarget.index;
      if (!Number.isInteger(ix) || ix < 0 || ix >= wordPacksEffective.length) packsWordEditTarget = null;
    } else {
      const ci = packsWordEditTarget.customIndex;
      if (!Number.isInteger(ci) || ci < 0 || ci >= customWordCategories.length) packsWordEditTarget = null;
    }
  }

  function validatePacksQuestionEditTarget() {
    if (!packsQuestionEditTarget) return;
    if (packsQuestionEditTarget.kind === "effective") {
      const ix = packsQuestionEditTarget.index;
      if (!Number.isInteger(ix) || ix < 0 || ix >= questionPacksEffective.length) packsQuestionEditTarget = null;
    } else {
      const ci = packsQuestionEditTarget.customIndex;
      if (!Number.isInteger(ci) || ci < 0 || ci >= customQuestionCategories.length) packsQuestionEditTarget = null;
    }
  }

  function wordEditIsBasePack(target) {
    return target.kind === "effective" && target.index < wordBasePackCount;
  }

  function wordEditCustomRowIndex(target) {
    if (target.kind === "customDraft") return target.customIndex;
    if (target.kind === "effective" && target.index >= wordBasePackCount) {
      const inGame = customWordCategories.filter((c) => c.words.length > 0);
      const row = inGame[target.index - wordBasePackCount];
      return row ? customWordCategories.indexOf(row) : -1;
    }
    return -1;
  }

  function questionEditIsBasePack(target) {
    return target.kind === "effective" && target.index < questionBasePackCount;
  }

  function questionEditCustomRowIndex(target) {
    if (target.kind === "customDraft") return target.customIndex;
    if (target.kind === "effective" && target.index >= questionBasePackCount) {
      const inGame = customQuestionCategories.filter((c) => c.pairs.length > 0);
      const row = inGame[target.index - questionBasePackCount];
      return row ? customQuestionCategories.indexOf(row) : -1;
    }
    return -1;
  }

  function renderPacksEditor() {
    const segWord = uiPacksKind === "word" ? "is-active" : "";
    const segQ = uiPacksKind === "question" ? "is-active" : "";

    validatePacksWordEditTarget();
    validatePacksQuestionEditTarget();

    if (uiPacksKind === "word") {
      if (packsWordEditTarget !== null) {
        renderPacksEditorWordDetail(packsWordEditTarget, segWord, segQ);
        return;
      }
      renderPacksEditorWordList(segWord, segQ);
      return;
    }

    if (packsQuestionEditTarget !== null) {
      renderPacksEditorQuestionDetail(packsQuestionEditTarget, segWord, segQ);
      return;
    }
    renderPacksEditorQuestionList(segWord, segQ);
  }

  function packsEditorSegmented(segWord, segQ) {
    return `
        <div class="segmented" role="group" aria-label="Library section">
          <button type="button" class="${segWord}" data-pack-kind="word">Words</button>
          <button type="button" class="${segQ}" data-pack-kind="question">Questions</button>
        </div>`;
  }

  function renderPacksEditorWordList(segWord, segQ) {
    const effectiveHtml = wordPacksEffective
      .map((p, i) => {
        const badge = i < wordBasePackCount ? "Default" : "Yours";
        return `
      <div class="pack-cat-card">
        <div class="pack-cat-card__head">
          <span class="pack-cat-card__title">${escapeHtml(p.category)}</span>
          <span class="pack-cat-card__badge">${badge}</span>
        </div>
        <div class="pack-cat-card__actions">
          <button type="button" class="btn btn-primary btn-sm pack-cat-card__btn-main" data-edit-word-effective="${i}">Edit</button>
        </div>
      </div>`;
      })
      .join("");

    const emptyCustom = customWordCategories
      .map((c, i) => ({ c, i }))
      .filter((x) => x.c.words.length === 0);

    const emptyHtml = emptyCustom
      .map(
        ({ c, i }) => `
      <div class="pack-cat-card">
        <div class="pack-cat-card__head">
          <span class="pack-cat-card__title">${escapeHtml(c.category)}</span>
          <span class="pack-cat-card__badge">Empty</span>
        </div>
        <div class="pack-cat-card__actions">
          <button type="button" class="btn btn-primary btn-sm pack-cat-card__btn-main" data-edit-word-draft="${i}">Edit</button>
          <button type="button" class="btn btn-ghost btn-sm" data-del-word-draft="${i}">Delete</button>
        </div>
      </div>`
      )
      .join("");

    main.innerHTML = `
      ${libraryBackupCardHtml()}
      <div class="card card--calm">
        <p class="sheet-label">Library</p>
        ${packsEditorSegmented(segWord, segQ)}
        <p class="hint hint--spaced">Edit words by category. Built-in lists are saved on this device only (use <strong>Reset to default</strong> on a built-in category to undo). <strong>word-packs.json</strong> is still the starting point.</p>
        <label for="newWordCatName">New category name</label>
        <div class="row" style="margin-top:6px">
          <input type="text" id="newWordCatName" placeholder="e.g. Office" maxlength="48" autocomplete="off" />
          <button type="button" class="btn btn-secondary" id="addWordCatBtn">Add</button>
        </div>
      </div>
      <div class="card card--calm">
        <p class="sheet-label">Categories in the game</p>
        <div class="pack-cat-list">
          ${effectiveHtml || '<p class="hint empty-hint">No categories.</p>'}
        </div>
      </div>
      ${
        emptyCustom.length
          ? `<div class="card card--calm">
        <p class="sheet-label">Your categories (no words yet)</p>
        <div class="pack-cat-list">${emptyHtml}</div>
      </div>`
          : ""
      }
    `;

    wirePackKindSwitch();
    wireLibraryBackup();

    document.getElementById("addWordCatBtn").addEventListener("click", () => {
      const name = document.getElementById("newWordCatName").value.trim();
      if (!name) {
        alert("Enter a category name.");
        return;
      }
      if (customWordCategoryNameTaken(name, -1)) {
        alert("You already have a category with that name.");
        return;
      }
      customWordCategories.push({ category: name.slice(0, 48), words: [] });
      document.getElementById("newWordCatName").value = "";
      persistWordCategories();
      packsWordEditTarget = { kind: "customDraft", customIndex: customWordCategories.length - 1 };
      render();
    });

    main.querySelectorAll("[data-edit-word-effective]").forEach((btn) => {
      btn.addEventListener("click", () => {
        packsWordEditTarget = { kind: "effective", index: Number(btn.getAttribute("data-edit-word-effective")) };
        render();
      });
    });

    main.querySelectorAll("[data-edit-word-draft]").forEach((btn) => {
      btn.addEventListener("click", () => {
        packsWordEditTarget = { kind: "customDraft", customIndex: Number(btn.getAttribute("data-edit-word-draft")) };
        render();
      });
    });

    main.querySelectorAll("[data-del-word-draft]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const i = Number(btn.getAttribute("data-del-word-draft"));
        if (!confirm(`Delete category “${customWordCategories[i].category}”?`)) return;
        customWordCategories.splice(i, 1);
        persistWordCategories();
        render();
      });
    });
  }

  function renderPacksEditorWordDetail(target, segWord, segQ) {
    const isBase = wordEditIsBasePack(target);
    const customIdx = wordEditCustomRowIndex(target);
    const pack =
      target.kind === "effective"
        ? wordPacksEffective[target.index]
        : customWordCategories[target.customIndex];
    const cat = pack.category;
    const words = target.kind === "effective" ? [...wordPacksEffective[target.index].words] : [...pack.words];
    const hasOverride = isBase && Object.prototype.hasOwnProperty.call(wordPackOverrides, cat);

    const wordsHtml = words
      .map(
        (w, wi) => `
      <div class="pack-editor-line">
        <span class="pack-editor-line__text">${escapeHtml(w)}</span>
        <button type="button" class="btn btn-ghost btn-sm" data-rm-word="${wi}">Remove</button>
      </div>`
      )
      .join("");

    const renameBlock =
      customIdx >= 0
        ? `
        <label for="renameWordCat">Category name</label>
        <div class="row" style="margin-top:6px;margin-bottom:12px">
          <input type="text" id="renameWordCat" value="${escapeHtml(cat)}" maxlength="48" autocomplete="off" />
          <button type="button" class="btn btn-secondary" id="saveWordCatRename">Save</button>
        </div>`
        : `
        <p class="hint hint--tight" style="margin-bottom:12px">Category: <strong>${escapeHtml(cat)}</strong> (built-in / file — name can’t be changed here)</p>`;

    const resetBtn =
      isBase && hasOverride
        ? `<button type="button" class="btn btn-secondary btn-block" id="resetWordPackDefault" style="margin-top:12px">Reset to default</button>`
        : "";

    const deleteBtn =
      customIdx >= 0
        ? `<div class="screen-actions" style="margin-top:16px">
          <button type="button" class="btn btn-danger btn-block" id="delWordCatFromDetail">Delete this category</button>
        </div>`
        : "";

    main.innerHTML = `
      <div class="card card--calm">
        <p class="sheet-label">Words</p>
        ${packsEditorSegmented(segWord, segQ)}
        <button type="button" class="btn btn-secondary btn-sm btn-block back-sheet" id="backWordCats">← Categories</button>
        ${renameBlock}
        <p class="hint hint--tight">Entries in this category</p>
        <div id="wordLines">${wordsHtml || '<p class="hint">No words yet.</p>'}</div>
        <label for="newSingleWord" style="margin-top:14px">Add one word</label>
        <div class="row" style="margin-top:6px">
          <input type="text" id="newSingleWord" placeholder="Type a word" maxlength="64" autocomplete="off" />
          <button type="button" class="btn btn-primary" id="addSingleWordBtn">Add</button>
        </div>
        <label for="bulkWords" style="margin-top:14px">Add many (one per line or commas)</label>
        <textarea id="bulkWords" placeholder="pencil&#10;stapler&#10;whiteboard" style="margin-top:6px;min-height:88px"></textarea>
        <button type="button" class="btn btn-secondary btn-block" id="addBulkWordsBtn" style="margin-top:8px">Add all</button>
        ${resetBtn}
        ${deleteBtn}
      </div>
    `;

    wirePackKindSwitch();

    function persistWords(nextWords) {
      const clean = normalizeWordWords(nextWords);
      if (isBase) {
        wordPackOverrides[cat] = { words: clean };
        saveWordOverridesToStorage();
      } else if (customIdx >= 0) {
        customWordCategories[customIdx].words = clean;
        persistWordCategories();
      }
      render();
    }

    document.getElementById("backWordCats").addEventListener("click", () => {
      packsWordEditTarget = null;
      render();
    });

    const renameEl = document.getElementById("saveWordCatRename");
    if (renameEl && customIdx >= 0) {
      renameEl.addEventListener("click", () => {
        const name = document.getElementById("renameWordCat").value.trim();
        if (!name) {
          alert("Category name can’t be empty.");
          return;
        }
        if (customWordCategoryNameTaken(name, customIdx)) {
          alert("Another category already uses that name.");
          return;
        }
        const prev = customWordCategories[customIdx].category;
        customWordCategories[customIdx].category = name.slice(0, 48);
        delete wordPackOverrides[prev];
        persistWordCategories();
        render();
      });
    }

    document.getElementById("addSingleWordBtn").addEventListener("click", () => {
      const w = document.getElementById("newSingleWord").value.trim().slice(0, 64);
      if (!w) return;
      const next = [...words];
      if (!next.includes(w)) next.push(w);
      document.getElementById("newSingleWord").value = "";
      persistWords(next);
    });

    document.getElementById("addBulkWordsBtn").addEventListener("click", () => {
      const raw = document.getElementById("bulkWords").value;
      const parts = raw
        .split(/[\n,]+/)
        .map((x) => x.trim())
        .filter(Boolean)
        .map((x) => x.slice(0, 64));
      const set = new Set(words);
      parts.forEach((p) => set.add(p));
      document.getElementById("bulkWords").value = "";
      persistWords([...set]);
    });

    main.querySelectorAll("[data-rm-word]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const wi = Number(btn.getAttribute("data-rm-word"));
        const next = words.filter((_, j) => j !== wi);
        persistWords(next);
      });
    });

    const resetBtnEl = document.getElementById("resetWordPackDefault");
    if (resetBtnEl) {
      resetBtnEl.addEventListener("click", () => {
        if (!confirm(`Reset “${cat}” to the original list from the app / JSON file?`)) return;
        delete wordPackOverrides[cat];
        saveWordOverridesToStorage();
        render();
      });
    }

    const delBtn = document.getElementById("delWordCatFromDetail");
    if (delBtn && customIdx >= 0) {
      delBtn.addEventListener("click", () => {
        if (!confirm(`Delete “${customWordCategories[customIdx].category}” and all words?`)) return;
        customWordCategories.splice(customIdx, 1);
        packsWordEditTarget = null;
        persistWordCategories();
        render();
      });
    }
  }

  function renderPacksEditorQuestionList(segWord, segQ) {
    const effectiveHtml = questionPacksEffective
      .map((p, i) => {
        const badge = i < questionBasePackCount ? "Default" : "Yours";
        return `
      <div class="pack-cat-card">
        <div class="pack-cat-card__head">
          <span class="pack-cat-card__title">${escapeHtml(p.category)}</span>
          <span class="pack-cat-card__badge">${badge}</span>
        </div>
        <div class="pack-cat-card__actions">
          <button type="button" class="btn btn-primary btn-sm pack-cat-card__btn-main" data-edit-q-effective="${i}">Edit</button>
        </div>
      </div>`;
      })
      .join("");

    const emptyCustom = customQuestionCategories
      .map((c, i) => ({ c, i }))
      .filter((x) => x.c.pairs.length === 0);

    const emptyHtml = emptyCustom
      .map(
        ({ c, i }) => `
      <div class="pack-cat-card">
        <div class="pack-cat-card__head">
          <span class="pack-cat-card__title">${escapeHtml(c.category)}</span>
          <span class="pack-cat-card__badge">Empty</span>
        </div>
        <div class="pack-cat-card__actions">
          <button type="button" class="btn btn-primary btn-sm pack-cat-card__btn-main" data-edit-q-draft="${i}">Edit</button>
          <button type="button" class="btn btn-ghost btn-sm" data-del-q-draft="${i}">Delete</button>
        </div>
      </div>`
      )
      .join("");

    main.innerHTML = `
      ${libraryBackupCardHtml()}
      <div class="card card--calm">
        <p class="sheet-label">Library</p>
        ${packsEditorSegmented(segWord, segQ)}
        <p class="hint hint--spaced">Edit question pairs by category. Built-in lists are saved on this device only. <strong>question-packs.json</strong> is still the starting point.</p>
        <label for="newQCatName">New category name</label>
        <div class="row" style="margin-top:6px">
          <input type="text" id="newQCatName" placeholder="e.g. Hot takes" maxlength="48" autocomplete="off" />
          <button type="button" class="btn btn-secondary" id="addQCatBtn">Add</button>
        </div>
      </div>
      <div class="card card--calm">
        <p class="sheet-label">Categories in the game</p>
        <div class="pack-cat-list">
          ${effectiveHtml || '<p class="hint empty-hint">No categories.</p>'}
        </div>
      </div>
      ${
        emptyCustom.length
          ? `<div class="card card--calm">
        <p class="sheet-label">Your categories (no pairs yet)</p>
        <div class="pack-cat-list">${emptyHtml}</div>
      </div>`
          : ""
      }
    `;

    wirePackKindSwitch();
    wireLibraryBackup();

    document.getElementById("addQCatBtn").addEventListener("click", () => {
      const name = document.getElementById("newQCatName").value.trim();
      if (!name) {
        alert("Enter a category name.");
        return;
      }
      if (customQuestionCategoryNameTaken(name, -1)) {
        alert("You already have a category with that name.");
        return;
      }
      customQuestionCategories.push({ category: name.slice(0, 48), pairs: [] });
      document.getElementById("newQCatName").value = "";
      persistQuestionCategories();
      packsQuestionEditTarget = { kind: "customDraft", customIndex: customQuestionCategories.length - 1 };
      render();
    });

    main.querySelectorAll("[data-edit-q-effective]").forEach((btn) => {
      btn.addEventListener("click", () => {
        packsQuestionEditTarget = { kind: "effective", index: Number(btn.getAttribute("data-edit-q-effective")) };
        render();
      });
    });

    main.querySelectorAll("[data-edit-q-draft]").forEach((btn) => {
      btn.addEventListener("click", () => {
        packsQuestionEditTarget = { kind: "customDraft", customIndex: Number(btn.getAttribute("data-edit-q-draft")) };
        render();
      });
    });

    main.querySelectorAll("[data-del-q-draft]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.getAttribute("data-del-q-draft"));
        if (!confirm(`Delete category “${customQuestionCategories[idx].category}”?`)) return;
        customQuestionCategories.splice(idx, 1);
        persistQuestionCategories();
        render();
      });
    });
  }

  function renderPacksEditorQuestionDetail(target, segWord, segQ) {
    const isBase = questionEditIsBasePack(target);
    const customIdx = questionEditCustomRowIndex(target);
    const pack =
      target.kind === "effective"
        ? questionPacksEffective[target.index]
        : customQuestionCategories[target.customIndex];
    const cat = pack.category;
    const pairs =
      target.kind === "effective"
        ? questionPacksEffective[target.index].pairs.map((p) => ({ ...p }))
        : pack.pairs.map((p) => ({ ...p }));
    const hasOverride = isBase && Object.prototype.hasOwnProperty.call(questionPackOverrides, cat);

    const pairsHtml = pairs
      .map(
        (p, pi) => `
      <div class="pair-editor-block">
        <p class="pair-editor-block__q"><strong>Crew</strong> ${escapeHtml(p.crewQuestion)}</p>
        <p class="pair-editor-block__q"><strong>Imposter</strong> ${escapeHtml(p.imposterQuestion)}</p>
        <button type="button" class="btn btn-ghost btn-sm" data-rm-pair="${pi}">Remove pair</button>
      </div>`
      )
      .join("");

    const renameBlock =
      customIdx >= 0
        ? `
        <label for="renameQCat">Category name</label>
        <div class="row" style="margin-top:6px;margin-bottom:12px">
          <input type="text" id="renameQCat" value="${escapeHtml(cat)}" maxlength="48" autocomplete="off" />
          <button type="button" class="btn btn-secondary" id="saveQCatRename">Save</button>
        </div>`
        : `
        <p class="hint hint--tight" style="margin-bottom:12px">Category: <strong>${escapeHtml(cat)}</strong> (built-in / file — name can’t be changed here)</p>`;

    const resetBtn =
      isBase && hasOverride
        ? `<button type="button" class="btn btn-secondary btn-block" id="resetQuestionPackDefault" style="margin-top:12px">Reset to default</button>`
        : "";

    const deleteBtn =
      customIdx >= 0
        ? `<div class="screen-actions" style="margin-top:16px">
          <button type="button" class="btn btn-danger btn-block" id="delQCatFromDetail">Delete this category</button>
        </div>`
        : "";

    main.innerHTML = `
      <div class="card card--calm">
        <p class="sheet-label">Question pairs</p>
        ${packsEditorSegmented(segWord, segQ)}
        <button type="button" class="btn btn-secondary btn-sm btn-block back-sheet" id="backQCats">← Categories</button>
        ${renameBlock}
        <p class="hint hint--tight">Saved pairs</p>
        <div id="pairBlocks">${pairsHtml || '<p class="hint">No pairs yet.</p>'}</div>
        <label for="crewNew" style="margin-top:14px">Crew question</label>
        <textarea id="crewNew" placeholder="Question everyone else gets" style="margin-top:6px;min-height:64px"></textarea>
        <label for="impNew" style="margin-top:12px">Imposter question</label>
        <textarea id="impNew" placeholder="Different question; similar kind of answer" style="margin-top:6px;min-height:64px"></textarea>
        <button type="button" class="btn btn-primary btn-block" id="addPairBtn" style="margin-top:10px">Add pair</button>
        <label for="bulkPairs" style="margin-top:14px">Add many (one pair per line: crew <code>|||</code> imposter)</label>
        <textarea id="bulkPairs" placeholder="How many…?|||How many…?" style="margin-top:6px;min-height:88px"></textarea>
        <button type="button" class="btn btn-secondary btn-block" id="addBulkPairsBtn" style="margin-top:8px">Add all lines</button>
        ${resetBtn}
        ${deleteBtn}
      </div>
    `;

    wirePackKindSwitch();

    function persistPairs(nextPairs) {
      const clean = normalizeQuestionPairsInline(nextPairs);
      if (isBase) {
        questionPackOverrides[cat] = { pairs: clean };
        saveQuestionOverridesToStorage();
      } else if (customIdx >= 0) {
        customQuestionCategories[customIdx].pairs = clean;
        persistQuestionCategories();
      }
      render();
    }

    document.getElementById("backQCats").addEventListener("click", () => {
      packsQuestionEditTarget = null;
      render();
    });

    const renameEl = document.getElementById("saveQCatRename");
    if (renameEl && customIdx >= 0) {
      renameEl.addEventListener("click", () => {
        const name = document.getElementById("renameQCat").value.trim();
        if (!name) {
          alert("Category name can’t be empty.");
          return;
        }
        if (customQuestionCategoryNameTaken(name, customIdx)) {
          alert("Another category already uses that name.");
          return;
        }
        const prev = customQuestionCategories[customIdx].category;
        customQuestionCategories[customIdx].category = name.slice(0, 48);
        delete questionPackOverrides[prev];
        persistQuestionCategories();
        render();
      });
    }

    document.getElementById("addPairBtn").addEventListener("click", () => {
      const cq = document.getElementById("crewNew").value.trim();
      const iq = document.getElementById("impNew").value.trim();
      if (!cq || !iq) {
        alert("Enter both the crew question and the imposter question.");
        return;
      }
      const next = [
        ...pairs,
        { crewQuestion: cq.slice(0, 500), imposterQuestion: iq.slice(0, 500) },
      ];
      document.getElementById("crewNew").value = "";
      document.getElementById("impNew").value = "";
      persistPairs(next);
    });

    document.getElementById("addBulkPairsBtn").addEventListener("click", () => {
      const parsed = parsePairsFromLines(document.getElementById("bulkPairs").value);
      if (parsed.length === 0) {
        alert("No valid lines. Use: crew question|||imposter question");
        return;
      }
      document.getElementById("bulkPairs").value = "";
      persistPairs([...pairs, ...parsed]);
    });

    main.querySelectorAll("[data-rm-pair]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const pi = Number(btn.getAttribute("data-rm-pair"));
        const next = pairs.filter((_, j) => j !== pi);
        persistPairs(next);
      });
    });

    const resetBtnEl = document.getElementById("resetQuestionPackDefault");
    if (resetBtnEl) {
      resetBtnEl.addEventListener("click", () => {
        if (!confirm(`Reset “${cat}” to the original pairs from the app / JSON file?`)) return;
        delete questionPackOverrides[cat];
        saveQuestionOverridesToStorage();
        render();
      });
    }

    const delBtn = document.getElementById("delQCatFromDetail");
    if (delBtn && customIdx >= 0) {
      delBtn.addEventListener("click", () => {
        if (!confirm(`Delete “${customQuestionCategories[customIdx].category}” and all pairs?`)) return;
        customQuestionCategories.splice(customIdx, 1);
        packsQuestionEditTarget = null;
        persistQuestionCategories();
        render();
      });
    }
  }

  function wirePackKindSwitch() {
    main.querySelectorAll("[data-pack-kind]").forEach((btn) => {
      btn.addEventListener("click", () => {
        uiPacksKind = btn.getAttribute("data-pack-kind") === "question" ? "question" : "word";
        packsWordEditTarget = null;
        packsQuestionEditTarget = null;
        render();
      });
    });
  }

  function renderRevealPass() {
    if (state.revealViewingIndex !== null) {
      renderRevealModal(state.revealViewingIndex);
      return;
    }
    renderRevealLobby();
  }

  function renderRevealLobby() {
    const n = state.players.length;
    if (state.revealSeen.size >= n) {
      state.phase = "reveal_ready";
      state.revealViewingIndex = null;
      state.revealFaceDown = true;
      render();
      return;
    }

    const tiles = state.players
      .map((name, i) => {
        const done = state.revealSeen.has(i);
        return `
      <button type="button" class="stat-card reveal-name-card${done ? " is-done" : ""}" data-open-player="${i}" ${
          done ? "disabled" : ""
        }>
        <div class="stat-card__icon" aria-hidden="true">${done ? "✓" : "👤"}</div>
        <p class="stat-card__label">${done ? "Done" : "Open your card"}</p>
        <p class="stat-card__value reveal-name-card__name">${escapeHtml(name)}</p>
      </button>`;
      })
      .join("");

    main.innerHTML = `
      <div class="settings-page reveal-lobby-page">
        <div class="card reveal-screen">
          <p class="who">Pick your name</p>
          <p class="hint" style="margin-top:4px">Tap <strong>only your own</strong> tile, then tap the card to reveal. Opening someone else’s card is cheating — the honor system keeps the game fair.</p>
        </div>
        <div class="stat-grid reveal-player-grid">${tiles}</div>
        <p class="hint quit-round-hint" style="text-align:center;margin-top:18px">
          <button type="button" class="btn btn-ghost btn-sm" id="quitRoundBtn">Quit to menu</button>
        </p>
      </div>
    `;

    wireQuitRoundButton();

    main.querySelectorAll("[data-open-player]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const i = Number(btn.getAttribute("data-open-player"));
        if (state.revealSeen.has(i)) return;
        state.revealViewingIndex = i;
        state.revealFaceDown = true;
        render();
      });
    });
  }

  function finishRevealForPlayer(i) {
    state.revealSeen.add(i);
    state.revealViewingIndex = null;
    state.revealFaceDown = true;
    render();
  }

  function renderRevealModal(i) {
    const name = state.players[i];
    const isImposter = state.imposters.has(i);

    if (!state.revealFaceDown) clearRevealFaceDownEsc();

    const backRow = state.revealFaceDown
      ? `<p class="hint reveal-modal__back-wrap"><button type="button" class="btn btn-ghost btn-sm" id="revealModalBack">← Back to names</button></p>`
      : "";

    if (state.revealFaceDown) {
      main.innerHTML = `
      <div class="reveal-modal-root">
        <div class="reveal-modal-panel card reveal-screen">
          ${backRow}
          <p class="who" style="margin-bottom:10px">${escapeHtml(name)}</p>
          ${categoryPreviewAboveCard(i)}
          <button type="button" class="secret-card-flip" id="flipSecretCard" aria-label="Tap to reveal your card">
            <span class="secret-card-flip__mark" aria-hidden="true">?</span>
            <span class="secret-card-flip__hint">Tap the card for your role &amp; secret</span>
          </button>
          <p class="hint reveal-modal__esc-hint" style="margin-top:14px"><kbd class="kbd-hint">Esc</kbd> or <strong>Back to names</strong> above if this isn’t you.</p>
        </div>
        <p class="hint quit-round-hint" style="text-align:center">
          <button type="button" class="btn btn-ghost btn-sm" id="quitRoundBtn">Quit to menu</button>
        </p>
      </div>`;
      document.getElementById("flipSecretCard").addEventListener("click", () => {
        clearRevealFaceDownEsc();
        state.revealFaceDown = false;
        render();
      });
      document.getElementById("revealModalBack").addEventListener("click", () => {
        clearRevealFaceDownEsc();
        state.revealViewingIndex = null;
        state.revealFaceDown = true;
        render();
      });
      wireQuitRoundButton();
      clearRevealFaceDownEsc();
      revealFaceDownEscHandler = (e) => {
        if (e.key !== "Escape") return;
        clearRevealFaceDownEsc();
        state.revealViewingIndex = null;
        state.revealFaceDown = true;
        render();
      };
      document.addEventListener("keydown", revealFaceDownEscHandler);
      return;
    }

    if (state.gameMode === "word") {
      const fellows =
        isImposter && state.impostersKnowEachOther && state.imposters.size > 1
          ? fellowImposterLine(i)
          : "";

      let imposterBlock = "";
      if (isImposter) {
        const cat =
          state.showCategoryToImposter
            ? `<span class="category-pill">${escapeHtml(state.category)}</span>`
            : `<p class="hint">Category is hidden for this round.</p>`;
        imposterBlock = `<div class="secret imposter">You are the IMPOSTER</div>
         <p class="hint">You do not know the word. Blend in.</p>
         ${cat}
         ${fellows}`;
      } else {
        imposterBlock = `<div class="secret">${escapeHtml(state.word)}</div>
         <p class="hint">Do not say the word out loud.</p>
         <span class="category-pill">${escapeHtml(state.category)}</span>`;
      }

      main.innerHTML = `
      <div class="reveal-modal-root">
        <div class="reveal-modal-panel card reveal-screen">
          <p class="who">${escapeHtml(name)}</p>
          ${imposterBlock}
        </div>
        <div class="screen-actions reveal-modal-actions">
          <button type="button" class="btn btn-primary btn-block" id="doneReveal">Done — back to names</button>
          <button type="button" class="btn btn-ghost btn-block" id="quitRoundBtn" style="margin-top:10px">Quit to menu</button>
        </div>
      </div>`;
      document.getElementById("doneReveal").addEventListener("click", () => finishRevealForPlayer(i));
      wireQuitRoundButton();
      return;
    }

    const qText = isImposter ? state.imposterQuestion : state.crewQuestion;
    const qLabel = isImposter ? "Your question (imposter)" : "Your question";
    const fellowsQ =
      isImposter && state.impostersKnowEachOther && state.imposters.size > 1 ? fellowImposterLine(i) : "";

    const catQ =
      isImposter && state.showCategoryToImposter
        ? `<p class="category-pill" style="display:block;margin-top:12px;text-align:center">Category: ${escapeHtml(
            state.category
          )}</p>`
        : isImposter
          ? `<p class="hint" style="margin-top:12px;text-align:center">Category is hidden for this round.</p>`
          : "";

    const badge = isImposter
      ? `<div class="secret imposter" style="margin-bottom:12px">You are the IMPOSTER</div>
         <p class="hint" style="margin-bottom:12px">Your question is different from the crew’s; answer so it still fits the chat.</p>`
      : "";

    main.innerHTML = `
      <div class="reveal-modal-root">
        <div class="reveal-modal-panel card reveal-screen" style="text-align:left">
          <p class="who" style="text-align:center">${escapeHtml(name)}</p>
          ${badge}
          <div class="question-block">
            <p class="q-label">${qLabel}</p>
            <p class="q-text">${escapeHtml(qText)}</p>
          </div>
          ${catQ}
          ${fellowsQ}
          <div class="answer-input-wrap">
            <label for="playerAnswer">Your answer</label>
            <input type="text" id="playerAnswer" placeholder="Type your answer" maxlength="120" autocomplete="off" />
          </div>
          <p class="hint" style="margin-top:12px">Keep this private until everyone has locked an answer—the crew question will be shown to the group when discussion starts.</p>
        </div>
        <div class="screen-actions reveal-modal-actions">
          <button type="button" class="btn btn-primary btn-block" id="doneReveal">Lock answer — back to names</button>
          <button type="button" class="btn btn-ghost btn-block" id="quitRoundBtn" style="margin-top:10px">Quit to menu</button>
        </div>
      </div>`;

    const input = document.getElementById("playerAnswer");
    input.focus();

    document.getElementById("doneReveal").addEventListener("click", () => {
      const ans = input.value.trim();
      if (!ans) {
        alert("Type an answer before continuing.");
        return;
      }
      state.answers[i] = ans.slice(0, 120);
      finishRevealForPlayer(i);
    });
    wireQuitRoundButton();
  }

  function renderRevealReady() {
    main.innerHTML = `
      <div class="card reveal-screen">
        <p class="who">Everyone ready?</p>
        <p class="name" style="font-size:1.2rem;font-weight:700">Start discussion</p>
        <p class="hint">Continue when every player has opened <strong>their own</strong> card and finished (Done / lock answer).</p>
      </div>
      <div class="screen-actions">
        <button type="button" class="btn btn-primary btn-block" id="startDiscussBtn">Start discussion</button>
        <button type="button" class="btn btn-ghost btn-block" id="quitRoundBtn" style="margin-top:10px">Quit to menu</button>
      </div>`;
    document.getElementById("startDiscussBtn").addEventListener("click", () => {
      state.starterIndex = pickStarter();
      state.phase = "discuss";
      render();
    });
    wireQuitRoundButton();
  }

  function renderDiscuss() {
    const starterName = state.players[state.starterIndex];
    const isWord = state.gameMode === "word";
    const hint = isWord
      ? "Ask about the word without naming it. Imposters: stay hidden."
      : "You all see the crew question below. Imposters answered a different one—argue for your answer anyway.";

    const questionPublicBlock = !isWord
      ? `
      <div class="crew-question-public">
        <p class="crew-question-public__label">The question everyone else got</p>
        <p class="crew-question-public__text">${escapeHtml(state.crewQuestion)}</p>
        <p class="hint crew-question-public__hint">At least one player had a <strong>different</strong> question. Discussion is about fitting your answer to <em>this</em> one.</p>
      </div>`
      : "";

    main.innerHTML = `
      <div class="card card--calm">
        ${questionPublicBlock}
        <div class="starter-card">
          <p class="starter-label">Goes first</p>
          <p class="starter-name">${escapeHtml(starterName)}</p>
          <button type="button" class="btn btn-secondary btn-sm" id="shuffleStarter">Pick someone else</button>
        </div>
        <h2>Discussion</h2>
        <p class="hint">${hint}</p>
      </div>
      <div class="screen-actions">
        <button type="button" class="btn btn-primary btn-block" id="endRound">End discussion — reveal</button>
        <button type="button" class="btn btn-ghost btn-block" id="quitRoundBtn" style="margin-top:10px">Quit to menu</button>
      </div>
    `;

    document.getElementById("shuffleStarter").addEventListener("click", () => {
      state.starterIndex = pickStarter();
      render();
    });

    document.getElementById("endRound").addEventListener("click", () => {
      state.phase = "reveal_gate";
      render();
    });
    wireQuitRoundButton();
  }

  function renderRevealGate() {
    const isWord = state.gameMode === "word";
    const hint = isWord
      ? "When everyone agrees, show the word and imposters."
      : "When everyone agrees, show both questions, answers, and imposters.";

    main.innerHTML = `
      <div class="card reveal-screen">
        <p class="who">Ready?</p>
        <p class="name">Reveal</p>
        <p class="hint">${hint}</p>
      </div>
      <div class="screen-actions">
        <button type="button" class="btn btn-primary btn-block" id="doReveal">${isWord ? "Show word & imposters" : "Show full reveal"}</button>
        <button type="button" class="btn btn-ghost btn-block" id="quitRoundBtn" style="margin-top:10px">Quit to menu</button>
      </div>
    `;
    document.getElementById("doReveal").addEventListener("click", () => {
      state.phase = "reveal_answer";
      render();
    });
    wireQuitRoundButton();
  }

  function renderRevealAnswer() {
    const imposterNames = [...state.imposters]
      .sort((a, b) => a - b)
      .map((i) => state.players[i])
      .map(escapeHtml)
      .join(", ");

    if (state.gameMode === "word") {
      main.innerHTML = `
      <div class="card">
        <h2>Word</h2>
        <div class="reveal-answer-block">
          <p>${escapeHtml(state.word)}</p>
          <p class="hint" style="margin-top:8px">Category: ${escapeHtml(state.category)}</p>
        </div>
        <h2>Imposters</h2>
        <div class="reveal-answer-block imposters">
          <p>${imposterNames}</p>
        </div>
      </div>
      <div class="screen-actions">
        <button type="button" class="btn btn-primary btn-block" id="again">New round</button>
        <button type="button" class="btn btn-ghost btn-block" id="quitRoundBtn" style="margin-top:10px">Quit to menu</button>
      </div>
    `;
    } else {
      const answersHtml = state.players
        .map((p, idx) => {
          const tag = state.imposters.has(idx) ? ' <span class="pill">imposter</span>' : "";
          const a = state.answers[idx] != null ? escapeHtml(state.answers[idx]) : "—";
          return `<li style="margin-bottom:10px"><strong>${escapeHtml(p)}</strong>${tag}: ${a}</li>`;
        })
        .join("");

      main.innerHTML = `
      <div class="card">
        <h2>Crew question</h2>
        <div class="reveal-answer-block">
          <p>${escapeHtml(state.crewQuestion)}</p>
        </div>
        <h2>Imposter question</h2>
        <div class="reveal-answer-block imposters">
          <p>${escapeHtml(state.imposterQuestion)}</p>
        </div>
        <p class="hint" style="margin-top:8px">Category drawn: ${escapeHtml(state.category)}</p>
      </div>
      <div class="card">
        <h2>Answers</h2>
        <ul style="list-style:none;padding-left:0;margin:0">${answersHtml}</ul>
      </div>
      <div class="card">
        <h2>Imposters</h2>
        <div class="reveal-answer-block imposters">
          <p>${imposterNames}</p>
        </div>
      </div>
      <div class="screen-actions">
        <button type="button" class="btn btn-primary btn-block" id="again">New round</button>
        <button type="button" class="btn btn-ghost btn-block" id="quitRoundBtn" style="margin-top:10px">Quit to menu</button>
      </div>
    `;
    }

    document.getElementById("again").addEventListener("click", () => {
      state.phase = "setup";
      state.setupView = "main";
      state.word = "";
      state.crewQuestion = "";
      state.imposterQuestion = "";
      state.answers = {};
      state.imposters = new Set();
      state.revealSeen = new Set();
      state.revealViewingIndex = null;
      state.revealFaceDown = true;
      render();
    });
    wireQuitRoundButton();
  }

  function renderLoading() {
    updateChrome();
    main.innerHTML = `<div class="loading-banner">Loading library…</div>`;
  }

  function render() {
    updateChrome();
    if (state.phase === "setup") {
      if (uiTab === "library") renderPacksEditor();
      else if (state.setupView === "categories") renderSetupCategories();
      else if (state.setupView === "players") renderSetupPlayers();
      else renderSetupMain();
      return;
    }

    switch (state.phase) {
      case "reveal_pass":
        renderRevealPass();
        break;
      case "reveal_ready":
        renderRevealReady();
        break;
      case "discuss":
        renderDiscuss();
        break;
      case "reveal_gate":
        renderRevealGate();
        break;
      case "reveal_answer":
        renderRevealAnswer();
        break;
      default:
        state.phase = "setup";
        render();
    }
  }

  async function init() {
    wireTabs();
    wireSetupHeader();
    renderLoading();
    await Promise.all([fetchWordPacksFile(), fetchQuestionPacksFile()]);
    wordPackOverrides = loadWordOverrides();
    questionPackOverrides = loadQuestionOverrides();
    customWordCategories = loadWordCategoriesFromStorage();
    customQuestionCategories = loadQuestionCategoriesFromStorage();
    rebuildWordPacks();
    rebuildQuestionPacks();
    loadSetupPrefs();
    clampPoolsToLengths();
    bootstrapping = false;
    render();
  }

  init();
})();
