const STYLE_PAGE_SIZE = 20;
const EVENT_PAGE_SIZE = 50;
const THEME_STORAGE_KEY = "ass-subtitle-studio-theme";
const LAYOUT_STORAGE_KEY = "ass-subtitle-studio-left-width";
const LEFT_TOP_LAYOUT_STORAGE_KEY = "ass-subtitle-studio-left-top-height";
const RIGHT_TOP_LAYOUT_STORAGE_KEY = "ass-subtitle-studio-right-top-height";
const DROPZONE_HINT_KEY = "ass-subtitle-studio-dropzone-hint-seen";
const EVENT_TYPES = ["Dialogue", "Comment", "Picture", "Sound", "Movie", "Command"];
const EDITABLE_EVENT_TYPES = ["Dialogue", "Comment"];
const COMPACT_COLUMN_KEYS = new Set([
  "fontsize",
  "spacing",
  "angle",
  "outline",
  "shadow",
  "marginl",
  "marginr",
  "marginv",
  "layer",
  "encoding",
  "alignment",
  "bold",
  "italic",
  "underline",
  "strikeout",
  "scalex",
  "scaley",
  "borderstyle",
]);
const MEDIUM_COLUMN_KEYS = new Set(["effect", "actor", "marked"]);

let activeToast = null;

const state = {
  files: [],
  activeFileId: null,
  decodeEncoding: "utf-8",
  previewMode: "visual",
  previewPages: {
    styles: new Map(),
    events: new Map(),
  },
};

const els = {
  fileInput: getElement("#file-input"),
  dropzone: getElement("#dropzone"),
  encodingSelect: getElement("#encoding-select"),
  reloadEncoding: getElement("#reload-encoding"),
  removeSelectedFiles: getElement("#remove-selected-files"),
  clearFiles: getElement("#clear-files"),
  loadSamples: getElement("#load-samples"),
  fileList: getElement("#file-list"),
  activeFileSelect: getElement("#active-file-select"),
  previewContent: getElement("#preview-content"),
  rawEditor: getElement("#raw-editor"),
  previewVisualMode: getElement("#preview-visual-mode"),
  previewRawMode: getElement("#preview-raw-mode"),
  saveRawEditor: getElement("#save-raw-editor"),
  copySummary: getElement("#copy-summary"),
  resultList: getElement("#result-list"),
  downloadSelected: getElement("#download-selected"),
  downloadZip: getElement("#download-zip"),
  themeToggle: getElement("#theme-toggle"),
  workspaceGrid: getElement("#workspace-grid"),
  workspaceDivider: getElement("#workspace-divider"),
  workspaceDividerLeft: getElement("#workspace-divider-left"),
  workspaceDividerRight: getElement("#workspace-divider-right"),
  workspaceLeft: document.querySelector(".workspace-left"),
  workspaceRight: document.querySelector(".workspace-right"),
  fileRowTemplate: getElement("#file-row-template"),
};

bindEvents();
initializeTheme();
initializeLayout();
initDropzone();
initializeDropzoneHint();
renderApp();

function getElement(selector) {
  const element = document.querySelector(selector);
  if (!element) {
    throw new Error(`缺少必要元素: ${selector}`);
  }
  return element;
}

function renderApp() {
  renderFiles();
  renderPreview();
  renderResults();
}

function bindEvents() {
  els.fileInput.addEventListener("change", (event) => handleFileList(event.target.files));
  els.encodingSelect.addEventListener("change", (event) => {
    state.decodeEncoding = event.target.value;
  });
  els.reloadEncoding.addEventListener("click", reloadAllFilesWithEncoding);
  els.removeSelectedFiles.addEventListener("click", removeSelectedFiles);
  els.clearFiles.addEventListener("click", clearAllFiles);
  els.loadSamples.addEventListener("click", () => {
    showToast("把当前目录里的 .ass 文件拖进来，或点击上传区域选择文件。");
  });
  els.activeFileSelect.addEventListener("change", (event) => {
    state.activeFileId = event.target.value;
    renderPreview();
  });
  els.previewVisualMode.addEventListener("click", () => {
    state.previewMode = "visual";
    renderPreview();
  });
  els.previewRawMode.addEventListener("click", () => {
    state.previewMode = "raw";
    renderPreview();
  });
  els.saveRawEditor.addEventListener("click", saveRawEditorChanges);
  els.copySummary.addEventListener("click", copyActiveFileSummary);
  els.downloadSelected.addEventListener("click", downloadSelectedFiles);
  els.downloadZip.addEventListener("click", downloadZipForSelected);
  els.themeToggle.addEventListener("click", toggleTheme);
  bindLayoutResize();
}

function initializeTheme() {
  const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  const fallbackTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  applyTheme(storedTheme || fallbackTheme);
}

function copyActiveFileSummary() {
  const file = getActiveFile();
  if (!file) {
    showToast("请先选一个活动文件。");
    return;
  }
  copyText(JSON.stringify(buildFileSummary(file), null, 2), "结构摘要已复制。", "结构摘要复制失败。");
}

function toggleTheme() {
  const nextTheme = document.body.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(nextTheme);
}

function applyTheme(theme) {
  document.body.dataset.theme = theme;
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  els.themeToggle.textContent = theme === "dark" ? "切换浅色模式" : "切换夜间模式";
}

function initializeLayout() {
  const storedWidth = Number(localStorage.getItem(LAYOUT_STORAGE_KEY));
  const storedLeftTopHeight = Number(localStorage.getItem(LEFT_TOP_LAYOUT_STORAGE_KEY));
  const storedRightTopHeight = Number(localStorage.getItem(RIGHT_TOP_LAYOUT_STORAGE_KEY));

  if (Number.isFinite(storedWidth)) {
    applyLeftPanelWidth(storedWidth);
  }
  if (Number.isFinite(storedLeftTopHeight)) {
    applyColumnTopHeight("--left-top-height", storedLeftTopHeight, els.workspaceLeft, 180, 300, LEFT_TOP_LAYOUT_STORAGE_KEY);
  }
  if (Number.isFinite(storedRightTopHeight)) {
    applyColumnTopHeight("--right-top-height", storedRightTopHeight, els.workspaceRight, 150, 320, RIGHT_TOP_LAYOUT_STORAGE_KEY);
  }
}

function bindLayoutResize() {
  bindSplitResize({
    divider: els.workspaceDivider,
    onMove(event) {
      const gridRect = els.workspaceGrid.getBoundingClientRect();
      applyLeftPanelWidth(event.clientX - gridRect.left, gridRect.width);
    },
  });

  bindSplitResize({
    divider: els.workspaceDividerLeft,
    onMove(event) {
      const columnRect = els.workspaceLeft.getBoundingClientRect();
      applyColumnTopHeight("--left-top-height", event.clientY - columnRect.top, els.workspaceLeft, 180, 320, LEFT_TOP_LAYOUT_STORAGE_KEY);
    },
  });

  bindSplitResize({
    divider: els.workspaceDividerRight,
    onMove(event) {
      const columnRect = els.workspaceRight.getBoundingClientRect();
      applyColumnTopHeight("--right-top-height", event.clientY - columnRect.top, els.workspaceRight, 150, 320, RIGHT_TOP_LAYOUT_STORAGE_KEY);
    },
  });
}

function bindSplitResize({ divider, onMove }) {
  if (!divider) return;

  let dragging = false;

  const handleMove = (event) => {
    if (!dragging) return;
    onMove(event);
  };

  const stopDragging = () => {
    if (!dragging) return;
    dragging = false;
    divider.classList.remove("is-dragging");
  };

  divider.addEventListener("pointerdown", (event) => {
    dragging = true;
    divider.classList.add("is-dragging");
    divider.setPointerCapture(event.pointerId);
  });

  window.addEventListener("pointermove", handleMove);
  window.addEventListener("pointerup", stopDragging);
  window.addEventListener("pointercancel", stopDragging);
}

function applyLeftPanelWidth(rawWidth, gridWidth = els.workspaceGrid.getBoundingClientRect().width) {
  const minWidth = 220;
  const maxWidth = Math.max(minWidth, Math.min(760, Math.round(gridWidth - 380)));
  const clampedWidth = Math.max(minWidth, Math.min(maxWidth, Math.round(rawWidth)));
  document.documentElement.style.setProperty("--left-panel-width", `${clampedWidth}px`);
  localStorage.setItem(LAYOUT_STORAGE_KEY, String(clampedWidth));
}

function applyColumnTopHeight(variableName, rawHeight, columnElement, minHeight, minBottomHeight, storageKey) {
  if (!columnElement) return;

  const availableHeight = columnElement.getBoundingClientRect().height;
  const maxHeight = Math.max(minHeight, Math.round(availableHeight - minBottomHeight));
  const clampedHeight = Math.max(minHeight, Math.min(maxHeight, Math.round(rawHeight)));
  document.documentElement.style.setProperty(variableName, `${clampedHeight}px`);
  localStorage.setItem(storageKey, String(clampedHeight));
}

function initDropzone() {
  ["dragenter", "dragover"].forEach((type) => {
    els.dropzone.addEventListener(type, (event) => {
      event.preventDefault();
      els.dropzone.classList.add("dragging");
    });
  });
  ["dragleave", "drop"].forEach((type) => {
    els.dropzone.addEventListener(type, (event) => {
      event.preventDefault();
      els.dropzone.classList.remove("dragging");
    });
  });
  els.dropzone.addEventListener("drop", (event) => {
    handleFileList(event.dataTransfer.files);
  });
}

function initializeDropzoneHint() {
  if (!els.dropzone) return;

  const hasSeenHint = sessionStorage.getItem(DROPZONE_HINT_KEY) === "1";
  if (hasSeenHint) return;

  els.dropzone.classList.add("intro-glow");
  const clearHint = () => {
    els.dropzone.classList.remove("intro-glow");
    sessionStorage.setItem(DROPZONE_HINT_KEY, "1");
    els.dropzone.removeEventListener("animationend", clearHint);
  };

  els.dropzone.addEventListener("animationend", clearHint);
}

async function handleFileList(fileList) {
  const incoming = Array.from(fileList || []).filter((file) => file.name.toLowerCase().endsWith(".ass"));
  if (!incoming.length) {
    showToast("没有检测到 .ass 文件。");
    return;
  }

  try {
    const loadedFiles = await Promise.all(incoming.map((file) => loadAssFile(file, state.decodeEncoding)));

    loadedFiles.forEach((parsedFile) => {
      const existingIndex = state.files.findIndex((item) => item.name === parsedFile.name);
      if (existingIndex >= 0) {
        state.files[existingIndex] = parsedFile;
      } else {
        state.files.push(parsedFile);
      }
    });

    normalizeActiveFile();
    renderApp();
    showToast(`已导入 ${incoming.length} 个字幕文件。`);
  } catch (error) {
    showToast(`导入失败: ${error.message}`);
  }
}

async function reloadAllFilesWithEncoding() {
  if (!state.files.length) {
    showToast("当前没有已导入文件。");
    return;
  }

  try {
    state.files = await Promise.all(state.files.map((item) => loadAssFile(item.originalFile, state.decodeEncoding, item)));
    normalizeActiveFile();
    renderApp();
    showToast(`已使用 ${state.decodeEncoding} 重新解码。`);
  } catch (error) {
    showToast(`重新解码失败: ${error.message}`);
  }
}

function removeSelectedFiles() {
  if (!state.files.some((file) => file.selected)) {
    showToast("没有勾选要删除的文件。");
    return;
  }
  state.files = state.files.filter((file) => !file.selected);
  normalizeActiveFile();
  renderApp();
}

function clearAllFiles() {
  state.files = [];
  state.activeFileId = null;
  state.previewPages.styles.clear();
  state.previewPages.events.clear();
  renderApp();
}

function normalizeActiveFile() {
  if (!state.files.length) {
    state.activeFileId = null;
    return;
  }
  if (!state.files.some((file) => file.id === state.activeFileId)) {
    state.activeFileId = state.files[0].id;
  }
}

async function loadAssFile(file, encoding, previous = null) {
  const buffer = await file.arrayBuffer();
  const decoder = new TextDecoder(encoding, { fatal: false });
  const text = decoder.decode(buffer);
  const parsed = parseAss(text);
  const outputName = previous?.outputName ?? file.name;
  return {
    id: previous?.id ?? crypto.randomUUID(),
    name: file.name,
    outputName: normalizeAssFileName(outputName, file.name),
    encoding,
    originalFile: file,
    originalText: text,
    parsed,
    outputText: text,
    selected: previous?.selected ?? true,
    stats: summarizeParsedAss(parsed, text),
  };
}

function parseAss(text) {
  const normalized = text.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const sections = [];
  let current = { name: "__root__", lines: [] };
  sections.push(current);

  for (const line of lines) {
    const headerMatch = line.match(/^\[(.+)]$/);
    if (headerMatch) {
      current = { name: headerMatch[1], lines: [] };
      sections.push(current);
    } else {
      current.lines.push(line);
    }
  }

  const sectionMap = new Map(sections.map((section) => [section.name, section]));
  return {
    lineCount: lines.length,
    sections,
    scriptInfo: parseKeyValueSection(sectionMap.get("Script Info")),
    aegisubGarbage: parseKeyValueSection(sectionMap.get("Aegisub Project Garbage")),
    styles: parseStylesSection(sectionMap.get("V4+ Styles")),
    events: parseEventsSection(sectionMap.get("Events")),
  };
}

function parseKeyValueSection(section) {
  if (!section) return null;
  return {
    entries: section.lines.map((line) => {
      if (!line.trim()) return { type: "blank", raw: line };
      if (line.trim().startsWith(";")) return { type: "comment", raw: line };
      const idx = line.indexOf(":");
      if (idx === -1) return { type: "raw", raw: line };
      return {
        type: "kv",
        key: line.slice(0, idx).trim(),
        value: line.slice(idx + 1).trim(),
      };
    }),
  };
}

function parseStylesSection(section) {
  if (!section) return null;
  let format = [];
  const rows = [];
  const extras = [];

  for (const line of section.lines) {
    if (!line.trim()) {
      extras.push({ type: "blank", raw: line });
    } else if (line.trim().startsWith(";")) {
      extras.push({ type: "comment", raw: line });
    } else if (line.startsWith("Format:")) {
      format = line.slice(7).split(",").map((item) => item.trim());
    } else if (line.startsWith("Style:")) {
      const values = splitAssFields(line.slice(6).trim(), format.length);
      rows.push({ data: Object.fromEntries(format.map((field, index) => [field, values[index] ?? ""])) });
    } else {
      extras.push({ type: "raw", raw: line });
    }
  }

  return { format, rows, extras };
}

function parseEventsSection(section) {
  if (!section) return null;
  let format = [];
  const rows = [];
  const extras = [];

  for (const line of section.lines) {
    if (!line.trim()) {
      extras.push({ type: "blank", raw: line });
      continue;
    }
    if (line.trim().startsWith(";")) {
      extras.push({ type: "comment", raw: line });
      continue;
    }
    if (line.startsWith("Format:")) {
      format = line.slice(7).split(",").map((item) => item.trim());
      continue;
    }

    const match = line.match(/^([A-Za-z]+):\s*(.*)$/);
    if (!match) {
      extras.push({ type: "raw", raw: line });
      continue;
    }

    const [, eventType, payload] = match;
    if (!EVENT_TYPES.includes(eventType)) {
      extras.push({ type: "raw", raw: line });
      continue;
    }
    const values = splitAssFields(payload, format.length);
    rows.push({
      eventType,
      data: Object.fromEntries(format.map((field, index) => [field, values[index] ?? ""])),
    });
  }

  return { format, rows, extras };
}

function splitAssFields(text, count) {
  if (!count) return [text];
  const parts = [];
  let buffer = "";
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === "," && parts.length < count - 1) {
      parts.push(buffer);
      buffer = "";
    } else {
      buffer += char;
    }
  }
  parts.push(buffer);
  while (parts.length < count) parts.push("");
  return parts.map((item) => item.trim());
}

function summarizeParsedAss(parsed, text) {
  return {
    bytes: new Blob([text]).size,
    lineCount: parsed.lineCount,
    sections: parsed.sections.filter((section) => section.name !== "__root__").map((section) => section.name),
    infoKeys: parsed.scriptInfo?.entries.filter((entry) => entry.type === "kv").length ?? 0,
    garbageKeys: parsed.aegisubGarbage?.entries.filter((entry) => entry.type === "kv").length ?? 0,
    styleCount: parsed.styles?.rows.length ?? 0,
    eventCount: parsed.events?.rows.length ?? 0,
  };
}

function renderFiles() {
  els.fileList.innerHTML = "";
  els.activeFileSelect.innerHTML = "";

  if (!state.files.length) {
    els.fileList.className = "file-list empty-state";
    els.fileList.innerHTML = "<p>还没有导入文件。</p>";
    return;
  }

  els.fileList.className = "file-list";
  for (const file of state.files) {
    const node = els.fileRowTemplate.content.firstElementChild.cloneNode(true);
    const checkbox = node.querySelector(".file-checkbox");
    const nameInput = node.querySelector(".file-name-input");
    const metaEl = node.querySelector(".file-meta");
    const activateBtn = node.querySelector(".file-activate");
    const removeBtn = node.querySelector(".file-remove");

    checkbox.checked = file.selected;
    checkbox.addEventListener("change", () => {
      file.selected = checkbox.checked;
      renderResults();
    });

    nameInput.value = file.outputName;
    nameInput.addEventListener("input", () => {
      file.outputName = normalizeAssFileName(nameInput.value, file.name);
      option.textContent = file.outputName;
      if (state.activeFileId === file.id && state.previewMode === "visual") {
        updatePreviewSummary(file);
      }
      renderResults();
    });

    metaEl.textContent = `${formatBytes(file.stats.bytes)} · ${file.stats.lineCount} 行 · ${file.encoding}`;
    activateBtn.addEventListener("click", () => {
      state.activeFileId = file.id;
      renderPreview();
      syncActiveFileSelect();
    });
    removeBtn.addEventListener("click", () => {
      state.files = state.files.filter((item) => item.id !== file.id);
      state.previewPages.styles.delete(file.id);
      state.previewPages.events.delete(file.id);
      normalizeActiveFile();
      renderApp();
    });

    els.fileList.appendChild(node);

    const option = document.createElement("option");
    option.value = file.id;
    option.textContent = file.outputName;
    els.activeFileSelect.appendChild(option);
  }

  syncActiveFileSelect();
}

function syncActiveFileSelect() {
  els.activeFileSelect.value = state.activeFileId ?? "";
}

function renderPreview() {
  const file = getActiveFile();
  if (!file) {
    els.rawEditor.classList.add("hidden");
    els.previewContent.className = "preview-content empty-state";
    els.previewContent.innerHTML = "<p>导入文件后会显示这里。</p>";
    return;
  }

  els.previewVisualMode.classList.toggle("active", state.previewMode === "visual");
  els.previewRawMode.classList.toggle("active", state.previewMode === "raw");

  if (state.previewMode === "raw") {
    els.rawEditor.classList.remove("hidden");
    els.rawEditor.value = file.outputText;
    els.previewContent.className = "preview-content hidden";
    els.previewContent.innerHTML = "";
    return;
  }

  els.rawEditor.classList.add("hidden");
  els.previewContent.className = "preview-content";
  els.previewContent.innerHTML = "";

  const summaryCard = document.createElement("article");
  summaryCard.className = "preview-card";
  summaryCard.dataset.role = "preview-summary";
  summaryCard.innerHTML = `
    <header>
      <strong>${escapeHtml(file.outputName)}</strong>
      <span class="pill">${formatBytes(file.stats.bytes)} / ${file.stats.lineCount} 行</span>
    </header>
    <div class="preview-meta">源文件: ${escapeHtml(file.name)} · Section: ${file.stats.sections.join(" / ") || "无"}</div>
  `;
  els.previewContent.appendChild(summaryCard);

  [
    buildEditableKeyValuePreview(file, "Script Info", file.parsed.scriptInfo),
    buildEditableKeyValuePreview(file, "Aegisub Project Garbage", file.parsed.aegisubGarbage),
    buildEditableStylesPreview(file),
    buildEditableEventsPreview(file),
  ]
    .filter(Boolean)
    .forEach((card) => els.previewContent.appendChild(card));

  initializeScrollableTables();
}

function updatePreviewSummary(file) {
  const summaryCard = els.previewContent.querySelector('[data-role="preview-summary"]');
  if (!summaryCard) return;

  summaryCard.innerHTML = `
    <header>
      <strong>${escapeHtml(file.outputName)}</strong>
      <span class="pill">${formatBytes(file.stats.bytes)} / ${file.stats.lineCount} 行</span>
    </header>
    <div class="preview-meta">源文件: ${escapeHtml(file.name)} · Section: ${file.stats.sections.join(" / ") || "无"}</div>
  `;
}

function buildEditableKeyValuePreview(file, title, section) {
  if (!section) return null;
  const card = document.createElement("article");
  card.className = "preview-card";
  const entries = section.entries.filter((entry) => entry.type === "kv");
  const header = document.createElement("header");
  header.innerHTML = `<strong>${escapeHtml(title)}</strong><span class="pill">${entries.length} 项</span>`;

  const actions = document.createElement("div");
  actions.className = "section-actions";
  const addBtn = document.createElement("button");
  addBtn.className = "ghost small";
  addBtn.textContent = "新增条目";
  addBtn.addEventListener("click", () => {
    section.entries.push({ type: "kv", key: "NewKey", value: "" });
    syncFileOutput(file);
    renderPreview();
  });
  actions.appendChild(addBtn);

  const wrap = document.createElement("div");
  wrap.className = "editor-table-wrap";
  const table = document.createElement("table");
  table.className = "editor-table";
  table.innerHTML = "<thead><tr><th>键</th><th>值</th><th>操作</th></tr></thead>";
  applyDynamicTableLayout(table, ["key", "value", "action"], "kv");
  const tbody = document.createElement("tbody");

  entries.forEach((entry) => {
    const tr = document.createElement("tr");
    const keyInput = document.createElement("input");
    keyInput.value = entry.key;
    keyInput.addEventListener("input", () => {
      entry.key = keyInput.value;
      syncFileOutput(file);
    });

    const valueInput = document.createElement("input");
    valueInput.value = entry.value;
    valueInput.addEventListener("input", () => {
      entry.value = valueInput.value;
      syncFileOutput(file);
    });

    const removeBtn = document.createElement("button");
    removeBtn.className = "ghost small";
    removeBtn.textContent = "删除";
    removeBtn.addEventListener("click", () => {
      section.entries = section.entries.filter((item) => item !== entry);
      syncFileOutput(file);
      renderPreview();
    });

    tr.append(createCell(keyInput, "key", "kv"), createCell(valueInput, "value", "kv"), createCell(removeBtn, "action", "kv"));
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  wrap.appendChild(table);
  card.append(header, actions, wrap);
  return card;
}

function buildEditableStylesPreview(file) {
  const section = file.parsed.styles;
  const rows = section?.rows ?? [];
  if (!rows.length) return null;

  const page = getCurrentPage("styles", file.id);
  const totalPages = Math.max(1, Math.ceil(rows.length / STYLE_PAGE_SIZE));
  const visibleRows = rows.slice(page * STYLE_PAGE_SIZE, page * STYLE_PAGE_SIZE + STYLE_PAGE_SIZE);
  const shownColumns = (section.format.length ? section.format : ["Name", "Fontname", "Fontsize"]).slice(0, 10);

  const card = document.createElement("article");
  card.className = "preview-card";
  card.innerHTML = `
    <header>
      <strong>V4+ Styles</strong>
      <span class="pill">${rows.length} 条，第 ${page + 1}/${totalPages} 页</span>
    </header>
  `;

  const wrap = document.createElement("div");
  wrap.className = "editor-table-wrap";
  const table = document.createElement("table");
  table.className = "editor-table";
  table.innerHTML = `<thead><tr>${shownColumns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr></thead>`;
  applyDynamicTableLayout(table, shownColumns, "styles");
  const tbody = document.createElement("tbody");

  visibleRows.forEach((row) => {
    const tr = document.createElement("tr");
    shownColumns.forEach((column) => {
      const input = document.createElement("input");
      input.value = row.data[column] ?? "";
      input.addEventListener("input", () => {
        row.data[column] = input.value;
        syncFileOutput(file);
      });
      tr.appendChild(createCell(input, column, "styles"));
    });
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  wrap.appendChild(table);
  card.append(buildPager(page, totalPages, (nextPage) => setCurrentPage("styles", file.id, nextPage)), wrap, buildPager(page, totalPages, (nextPage) => setCurrentPage("styles", file.id, nextPage)));
  return card;
}

function buildEditableEventsPreview(file) {
  const section = file.parsed.events;
  const rows = section?.rows ?? [];
  if (!rows.length) return null;

  const page = getCurrentPage("events", file.id);
  const totalPages = Math.max(1, Math.ceil(rows.length / EVENT_PAGE_SIZE));
  const visibleRows = rows.slice(page * EVENT_PAGE_SIZE, page * EVENT_PAGE_SIZE + EVENT_PAGE_SIZE);
  const columns = ["eventType", "Start", "End", "Style", "Name", "Text"];

  const card = document.createElement("article");
  card.className = "preview-card";
  card.innerHTML = `
    <header>
      <strong>Events</strong>
      <span class="pill">${rows.length} 条，第 ${page + 1}/${totalPages} 页</span>
    </header>
  `;

  const wrap = document.createElement("div");
  wrap.className = "editor-table-wrap";
  const table = document.createElement("table");
  table.className = "editor-table";
  table.innerHTML = `<thead><tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr></thead>`;
  applyDynamicTableLayout(table, columns, "events");
  const tbody = document.createElement("tbody");

  visibleRows.forEach((row) => {
    const tr = document.createElement("tr");
    columns.forEach((column) => {
      if (column === "eventType") {
        const select = document.createElement("select");
        EDITABLE_EVENT_TYPES.forEach((type) => {
          const option = document.createElement("option");
          option.value = type;
          option.textContent = type;
          option.selected = row.eventType === type;
          select.appendChild(option);
        });
        select.addEventListener("change", () => {
          row.eventType = select.value;
          syncFileOutput(file);
        });
        tr.appendChild(createCell(select, column, "events"));
      } else {
        const input = document.createElement(column === "Text" ? "textarea" : "input");
        input.value = row.data[column] ?? "";
        if (column === "Text") input.rows = 2;
        input.addEventListener("input", () => {
          row.data[column] = input.value;
          syncFileOutput(file);
        });
        tr.appendChild(createCell(input, column, "events"));
      }
    });
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  wrap.appendChild(table);
  card.append(buildPager(page, totalPages, (nextPage) => setCurrentPage("events", file.id, nextPage)), wrap, buildPager(page, totalPages, (nextPage) => setCurrentPage("events", file.id, nextPage)));
  return card;
}

function createCell(node, columnName = "", sectionType = "") {
  const td = document.createElement("td");
  const metrics = getColumnMetrics(columnName, sectionType);
  td.dataset.columnKind = metrics.kind;
  td.dataset.columnName = columnName;
  td.appendChild(node);
  return td;
}

function applyDynamicTableLayout(table, columns, sectionType) {
  const normalizedColumns = columns.map((columnName) => getColumnMetrics(columnName, sectionType));
  const totalWidth = normalizedColumns.reduce((sum, column) => sum + column.width, 0);
  const colgroup = document.createElement("colgroup");

  normalizedColumns.forEach((column) => {
    const col = document.createElement("col");
    col.style.width = `${column.width}px`;
    col.dataset.columnKind = column.kind;
    colgroup.appendChild(col);
  });

  table.prepend(colgroup);
  table.dataset.sectionType = sectionType;
  table.style.minWidth = `${Math.max(totalWidth, 640)}px`;
}

function getColumnMetrics(columnName, sectionType) {
  const normalizedName = String(columnName || "").trim().toLowerCase();
  const key = normalizedName.replace(/\s+/g, "");

  if (sectionType === "kv") {
    if (key === "action") return { width: 96, kind: "action" };
    if (key === "value") return { width: 360, kind: "long" };
    return { width: 180, kind: "name" };
  }

  if (key === "text") return { width: 420, kind: "text" };
  if (key === "name") return { width: 180, kind: "name" };
  if (key === "fontname") return { width: 220, kind: "font" };
  if (key === "style") return { width: 150, kind: "name" };
  if (key === "start" || key === "end") return { width: 124, kind: "time" };
  if (key === "eventtype") return { width: 124, kind: "type" };
  if (key.includes("colour") || key.includes("color")) return { width: 168, kind: "color" };
  if (COMPACT_COLUMN_KEYS.has(key)) return { width: 104, kind: "compact" };
  if (MEDIUM_COLUMN_KEYS.has(key)) return { width: 140, kind: "compact" };
  return { width: 140, kind: "default" };
}

function initializeScrollableTables() {
  const wraps = els.previewContent.querySelectorAll(".editor-table-wrap");
  wraps.forEach((wrap) => enhanceScrollableTable(wrap));
}

function enhanceScrollableTable(wrap) {
  if (wrap.dataset.enhanced === "1") {
    updateScrollableTableState(wrap);
    return;
  }

  wrap.dataset.enhanced = "1";
  updateScrollableTableState(wrap);

  wrap.addEventListener(
    "wheel",
    (event) => {
      if (!hasHorizontalOverflow(wrap)) return;
      if (event.target.closest("input, textarea, select, button")) return;

      const horizontalDelta = Math.abs(event.deltaX) > 0 ? event.deltaX : event.deltaY;
      if (Math.abs(horizontalDelta) < 1) return;

      event.preventDefault();
      wrap.scrollLeft += horizontalDelta;
      updateScrollableTableState(wrap);
    },
    { passive: false }
  );

  let pointerState = null;

  wrap.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    if (event.target.closest("input, textarea, select, button")) return;
    if (!hasHorizontalOverflow(wrap) && wrap.scrollHeight <= wrap.clientHeight) return;

    pointerState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startLeft: wrap.scrollLeft,
      startTop: wrap.scrollTop,
    };
    wrap.classList.add("is-panning");
    wrap.setPointerCapture(event.pointerId);
  });

  wrap.addEventListener("pointermove", (event) => {
    if (!pointerState || event.pointerId !== pointerState.pointerId) return;
    wrap.scrollLeft = pointerState.startLeft - (event.clientX - pointerState.startX);
    wrap.scrollTop = pointerState.startTop - (event.clientY - pointerState.startY);
    updateScrollableTableState(wrap);
  });

  const stopPanning = (event) => {
    if (!pointerState || event.pointerId !== pointerState.pointerId) return;
    pointerState = null;
    wrap.classList.remove("is-panning");
    updateScrollableTableState(wrap);
  };

  wrap.addEventListener("pointerup", stopPanning);
  wrap.addEventListener("pointercancel", stopPanning);
  wrap.addEventListener("scroll", () => updateScrollableTableState(wrap), { passive: true });

  if ("ResizeObserver" in window) {
    const observer = new ResizeObserver(() => updateScrollableTableState(wrap));
    observer.observe(wrap);
    const table = wrap.querySelector("table");
    if (table) observer.observe(table);
  }
}

function hasHorizontalOverflow(wrap) {
  return wrap.scrollWidth - wrap.clientWidth > 4;
}

function updateScrollableTableState(wrap) {
  const hasHorizontal = hasHorizontalOverflow(wrap);
  wrap.classList.toggle("has-horizontal-overflow", hasHorizontal);
  wrap.classList.toggle("has-overflow-left", hasHorizontal && wrap.scrollLeft > 6);
  wrap.classList.toggle("has-overflow-right", hasHorizontal && wrap.scrollLeft + wrap.clientWidth < wrap.scrollWidth - 6);
}

function buildPager(page, totalPages, onPageChange) {
  if (totalPages <= 1) {
    return document.createDocumentFragment();
  }
  const wrap = document.createElement("div");
  wrap.className = "pager";
  const left = document.createElement("div");
  left.className = "file-actions";
  const prev = document.createElement("button");
  prev.className = "ghost small";
  prev.textContent = "上一页";
  prev.disabled = page <= 0;
  prev.addEventListener("click", () => onPageChange(page - 1));
  const next = document.createElement("button");
  next.className = "ghost small";
  next.textContent = "下一页";
  next.disabled = page >= totalPages - 1;
  next.addEventListener("click", () => onPageChange(page + 1));
  left.append(prev, next);
  const label = document.createElement("span");
  label.className = "preview-meta";
  label.textContent = `第 ${page + 1} 页，共 ${totalPages} 页`;
  wrap.append(left, label);
  return wrap;
}

function getCurrentPage(kind, fileId) {
  return state.previewPages[kind].get(fileId) ?? 0;
}

function setCurrentPage(kind, fileId, page) {
  state.previewPages[kind].set(fileId, Math.max(0, page));
  renderPreview();
}

function syncFileOutput(file) {
  file.outputText = stringifyAss(file.parsed);
  file.stats = summarizeParsedAss(file.parsed, file.outputText);
  if (state.previewMode === "raw" && file.id === state.activeFileId) {
    els.rawEditor.value = file.outputText;
  }
  renderResults();
}

function saveRawEditorChanges() {
  const file = getActiveFile();
  if (!file) {
    showToast("请先选一个活动文件。");
    return;
  }
  try {
    file.parsed = parseAss(els.rawEditor.value);
    file.outputText = els.rawEditor.value;
    file.stats = summarizeParsedAss(file.parsed, file.outputText);
    renderPreview();
    renderResults();
    showToast("原文改动已保存。");
  } catch (error) {
    showToast(`原文解析失败: ${error.message}`);
  }
}

function stringifyAss(parsed) {
  const lines = [];
  const root = parsed.sections.find((section) => section.name === "__root__");
  if (root?.lines.length) lines.push(...root.lines);

  parsed.sections
    .filter((section) => section.name !== "__root__")
    .forEach((section) => {
      lines.push(`[${section.name}]`);
      if (section.name === "Script Info") {
        lines.push(...stringifyKeyValueEntries(parsed.scriptInfo?.entries ?? []));
      } else if (section.name === "Aegisub Project Garbage") {
        lines.push(...stringifyKeyValueEntries(parsed.aegisubGarbage?.entries ?? []));
      } else if (section.name === "V4+ Styles") {
        lines.push(...stringifyStylesSection(parsed.styles));
      } else if (section.name === "Events") {
        lines.push(...stringifyEventsSection(parsed.events));
      } else {
        lines.push(...section.lines);
      }
    });

  if (!parsed.sections.some((section) => section.name === "Aegisub Project Garbage") && parsed.aegisubGarbage?.entries?.length) {
    lines.push("[Aegisub Project Garbage]", ...stringifyKeyValueEntries(parsed.aegisubGarbage.entries));
  }

  return lines.join("\r\n");
}

function stringifyKeyValueEntries(entries) {
  return entries.map((entry) => {
    if (entry.type === "blank") return "";
    if (entry.type === "comment" || entry.type === "raw") return entry.raw ?? "";
    return `${entry.key}: ${entry.value}`;
  });
}

function stringifyStylesSection(section) {
  if (!section) return [];
  const lines = [];
  if (section.format.length) lines.push(`Format: ${section.format.join(", ")}`);
  section.rows.forEach((row) => {
    lines.push(`Style: ${section.format.map((field) => row.data[field] ?? "").join(",")}`);
  });
  section.extras.forEach((item) => lines.push(item.raw ?? ""));
  return lines;
}

function stringifyEventsSection(section) {
  if (!section) return [];
  const lines = [];
  if (section.format.length) lines.push(`Format: ${section.format.join(", ")}`);
  section.rows.forEach((row) => {
    lines.push(`${row.eventType}: ${section.format.map((field) => row.data[field] ?? "").join(",")}`);
  });
  section.extras.forEach((item) => lines.push(item.raw ?? ""));
  return lines;
}

function buildFileSummary(file) {
  return {
    fileName: file.name,
    outputName: file.outputName,
    encoding: file.encoding,
    stats: file.stats,
    scriptInfo: Object.fromEntries((file.parsed.scriptInfo?.entries ?? []).filter((entry) => entry.type === "kv").map((entry) => [entry.key, entry.value])),
    aegisubProjectGarbage: Object.fromEntries((file.parsed.aegisubGarbage?.entries ?? []).filter((entry) => entry.type === "kv").map((entry) => [entry.key, entry.value])),
    styleFormat: file.parsed.styles?.format ?? [],
    eventFormat: file.parsed.events?.format ?? [],
  };
}

function renderResults() {
  els.resultList.innerHTML = "";
  const selected = state.files.filter((file) => file.selected);
  if (!selected.length) {
    els.resultList.className = "result-list empty-state";
    els.resultList.innerHTML = "<p>勾选文件后，这里会列出下载项。</p>";
    return;
  }

  els.resultList.className = "result-list";
  selected.forEach((file) => {
    const card = document.createElement("article");
    card.className = "result-card";
    const header = document.createElement("header");
    const title = document.createElement("strong");
    title.textContent = file.outputName;
    const button = document.createElement("button");
    button.className = "small";
    button.textContent = "下载";
    button.addEventListener("click", () => downloadFile(file));
    header.append(title, button);

    const meta = document.createElement("div");
    meta.className = "result-meta";
    meta.textContent = `${formatBytes(new Blob([file.outputText]).size)} · ${file.stats.styleCount} styles · ${file.stats.eventCount} events`;
    card.append(header, meta);
    els.resultList.appendChild(card);
  });
}

function downloadSelectedFiles() {
  const files = state.files.filter((file) => file.selected);
  if (!files.length) {
    showToast("请先勾选文件。");
    return;
  }
  files.forEach((file, index) => {
    setTimeout(() => downloadFile(file), index * 100);
  });
}

function downloadFile(file) {
  const blob = new Blob([file.outputText], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.outputName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadZipForSelected() {
  const files = state.files.filter((file) => file.selected);
  if (!files.length) {
    showToast("请先勾选文件。");
    return;
  }

  const zipBlob = createZipBlob(files.map((file) => ({
    name: file.outputName,
    data: new TextEncoder().encode(file.outputText),
  })));
  const url = URL.createObjectURL(zipBlob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `ass-subtitle-studio-${Date.now()}.zip`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function createZipBlob(entries) {
  const encoder = new TextEncoder();
  const localFiles = [];
  const centralDirectory = [];
  let offset = 0;
  const utf8Flag = 0x0800;

  entries.forEach((entry) => {
    const nameBytes = encoder.encode(entry.name);
    const data = entry.data;
    const crc = crc32(data);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, utf8Flag, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localHeader.set(nameBytes, 30);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, utf8Flag, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);

    localFiles.push(localHeader, data);
    centralDirectory.push(centralHeader);
    offset += localHeader.length + data.length;
  });

  const centralSize = centralDirectory.reduce((sum, item) => sum + item.length, 0);
  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);

  return new Blob([...localFiles, ...centralDirectory, endRecord], { type: "application/zip" });
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc ^= bytes[i];
    for (let j = 0; j < 8; j += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function getActiveFile() {
  return state.files.find((file) => file.id === state.activeFileId) ?? null;
}

function normalizeAssFileName(value, fallbackName) {
  const raw = String(value || fallbackName || "subtitle.ass").trim();
  const safe = raw.replace(/[<>:"/\\|?*]/g, "_");
  return safe.toLowerCase().endsWith(".ass") ? safe : `${safe}.ass`;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function showToast(message) {
  activeToast?.remove();

  const toast = document.createElement("div");
  toast.textContent = message;
  toast.style.position = "fixed";
  toast.style.right = "16px";
  toast.style.bottom = "16px";
  toast.style.zIndex = "9999";
  toast.style.maxWidth = "320px";
  toast.style.padding = "12px 14px";
  toast.style.borderRadius = "14px";
  toast.style.background = "rgba(15, 23, 42, 0.92)";
  toast.style.color = "#eff6ff";
  toast.style.boxShadow = "0 18px 42px rgba(0,0,0,0.18)";
  document.body.appendChild(toast);
  activeToast = toast;
  setTimeout(() => {
    if (activeToast === toast) {
      activeToast = null;
    }
    toast.remove();
  }, 2400);
}

async function copyText(text, successMessage, failureMessage) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "true");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand("copy");
      textarea.remove();
      if (!copied) {
        throw new Error("copy command failed");
      }
    }
    showToast(successMessage);
  } catch {
    showToast(failureMessage);
  }
}
