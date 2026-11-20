const STYLE_PAGE_SIZE = 20;
const EVENT_PAGE_SIZE = 50;
const RESULT_PAGE_SIZE_DESKTOP = 4;
const RESULT_PAGE_SIZE_MOBILE = 3;
const UI_ANIMATION_DURATION = 240;
const SYNC_DEBOUNCE_MS = 220;
const MAX_HISTORY_STEPS = 30;
const THEME_STORAGE_KEY = "ass-subtitle-studio-theme";
const LAYOUT_STORAGE_KEY = "ass-subtitle-studio-left-width";
const LEFT_TOP_LAYOUT_STORAGE_KEY = "ass-subtitle-studio-left-top-height";
const RIGHT_TOP_LAYOUT_STORAGE_KEY = "ass-subtitle-studio-right-top-height";
const DROPZONE_HINT_KEY = "ass-subtitle-studio-dropzone-hint-seen";
const EVENT_TYPES = ["Dialogue", "Comment", "Picture", "Sound", "Movie", "Command"];
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
const DEFAULT_STYLE_FORMAT = [
  "Name",
  "Fontname",
  "Fontsize",
  "PrimaryColour",
  "SecondaryColour",
  "OutlineColour",
  "BackColour",
  "Bold",
  "Italic",
  "Underline",
  "StrikeOut",
  "ScaleX",
  "ScaleY",
  "Spacing",
  "Angle",
  "BorderStyle",
  "Outline",
  "Shadow",
  "Alignment",
  "MarginL",
  "MarginR",
  "MarginV",
  "Encoding",
];
const DEFAULT_EVENT_FORMAT = ["Layer", "Start", "End", "Style", "Name", "MarginL", "MarginR", "MarginV", "Effect", "Text"];

const utf8Encoder = new TextEncoder();
const CRC32_TABLE = buildCrc32Table();

let activeToast = null;
let scrollTopIdleTimer = 0;

// All runtime UI state stays here so visual editing, raw editing and export
// always operate on the same in-memory source of truth.
const state = {
  files: [],
  activeFileId: null,
  decodeEncoding: "utf-8",
  previewMode: "visual",
  rawDirty: false,
  previewPages: {
    styles: new Map(),
    events: new Map(),
  },
  expandedColumns: {
    styles: new Set(),
    events: new Set(),
  },
  timelineTools: new Map(),
  eventsToolboxTab: new Map(),
  eventFilters: new Map(),
  replaceTools: new Map(),
  undoStacks: new Map(),
  redoStacks: new Map(),
  pendingSyncTimers: new Map(),
  resultPage: 0,
};

const els = typeof document !== "undefined" ? collectElements() : null;

if (typeof document !== "undefined") {
  bindEvents();
  initializeTheme();
  initializeLayout();
  initDropzone();
  initializeDropzoneHint();
  renderApp();
  updateScrollTopButtonVisibility();
}

function collectElements() {
  return {
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
    rawDirtyBadge: getElement("#raw-dirty-badge"),
    previewVisualMode: getElement("#preview-visual-mode"),
    previewRawMode: getElement("#preview-raw-mode"),
    saveRawEditor: getElement("#save-raw-editor"),
    undoEdit: getElement("#undo-edit"),
    redoEdit: getElement("#redo-edit"),
    copySummary: getElement("#copy-summary"),
    resultList: getElement("#result-list"),
    downloadSelected: getElement("#download-selected"),
    downloadZip: getElement("#download-zip"),
    themeToggle: getElement("#theme-toggle"),
    scrollTopButton: getElement("#scroll-top-button"),
    workspaceGrid: getElement("#workspace-grid"),
    workspaceDivider: getElement("#workspace-divider"),
    workspaceDividerLeft: getElement("#workspace-divider-left"),
    workspaceDividerRight: getElement("#workspace-divider-right"),
    workspaceLeft: document.querySelector(".workspace-left"),
    workspaceRight: document.querySelector(".workspace-right"),
    fileRowTemplate: getElement("#file-row-template"),
  };
}

// DOM bootstrap helpers
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
  updateHistoryButtons();
}

// Global event wiring
function bindEvents() {
  let resizeFrameId = 0;

  els.fileInput.addEventListener("change", (event) => handleFileList(event.target.files));
  els.encodingSelect.addEventListener("change", (event) => {
    state.decodeEncoding = event.target.value;
  });
  els.reloadEncoding.addEventListener("click", reloadAllFilesWithEncoding);
  els.removeSelectedFiles.addEventListener("click", removeSelectedFiles);
  els.clearFiles.addEventListener("click", clearAllFiles);
  els.loadSamples.addEventListener("click", () => {
    showToast("把本地 .ass 文件拖入虚线框，或点击上传区域选择文件；编辑后可直接下载或打包为 ZIP。");
  });
  els.activeFileSelect.addEventListener("change", (event) => {
    const nextFileId = event.target.value;
    if (nextFileId === state.activeFileId) return;
    if (!confirmDiscardRawEdits()) {
      syncActiveFileSelect();
      return;
    }
    flushPendingSync(getActiveFile());
    state.activeFileId = nextFileId;
    setRawDirty(false);
    renderFiles();
    renderPreview();
    updateHistoryButtons();
  });
  els.previewVisualMode.addEventListener("click", () => {
    if (state.previewMode === "visual") return;
    if (!confirmDiscardRawEdits()) return;
    setRawDirty(false);
    state.previewMode = "visual";
    renderPreview();
  });
  els.previewRawMode.addEventListener("click", () => {
    if (state.previewMode === "raw") return;
    flushPendingSync(getActiveFile());
    state.previewMode = "raw";
    setRawDirty(false);
    renderPreview();
  });
  els.rawEditor.addEventListener("input", () => {
    const file = getActiveFile();
    setRawDirty(Boolean(file && els.rawEditor.value !== file.outputText));
  });
  els.rawEditor.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      saveRawEditorChanges();
    }
  });
  els.saveRawEditor.addEventListener("click", saveRawEditorChanges);
  els.undoEdit.addEventListener("click", handleUndo);
  els.redoEdit.addEventListener("click", handleRedo);
  els.copySummary.addEventListener("click", copyActiveFileSummary);
  els.downloadSelected.addEventListener("click", downloadSelectedFiles);
  els.downloadZip.addEventListener("click", downloadZipForSelected);
  els.themeToggle.addEventListener("click", toggleTheme);
  els.scrollTopButton.addEventListener("click", scrollToTop);
  els.scrollTopButton.addEventListener("pointerenter", () => {
    window.clearTimeout(scrollTopIdleTimer);
    els.scrollTopButton.classList.remove("is-idle");
  });
  document.addEventListener("keydown", handleGlobalShortcuts);
  window.addEventListener("resize", () => {
    cancelAnimationFrame(resizeFrameId);
    resizeFrameId = requestAnimationFrame(() => {
      clampStoredLayout();
      renderResults();
      updateAllScrollableTableStates();
      updateScrollTopButtonVisibility();
    });
  });
  window.addEventListener(
    "scroll",
    () => {
      updateScrollTopButtonVisibility(true);
    },
    { passive: true }
  );
  bindLayoutResize();
}

function handleGlobalShortcuts(event) {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
  const target = event.target;
  if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) {
    return;
  }
  const key = event.key.toLowerCase();
  if (key === "z" && !event.shiftKey) {
    event.preventDefault();
    handleUndo();
  } else if ((key === "z" && event.shiftKey) || key === "y") {
    event.preventDefault();
    handleRedo();
  }
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
  flushPendingSync(file);
  copyText(JSON.stringify(buildFileSummary(file), null, 2), "结构摘要已复制。", "结构摘要复制失败。");
}

function toggleTheme() {
  const nextTheme = document.body.dataset.theme === "dark" ? "light" : "dark";
  document.body.classList.add("theme-switching");
  applyTheme(nextTheme);
  window.setTimeout(() => {
    document.body.classList.remove("theme-switching");
  }, UI_ANIMATION_DURATION + 60);
}

function applyTheme(theme) {
  document.body.dataset.theme = theme;
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  els.themeToggle.textContent = theme === "dark" ? "切换浅色模式" : "切换夜间模式";
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function updateScrollTopButtonVisibility(fromScroll = false) {
  const scrollableHeight = document.documentElement.scrollHeight - window.innerHeight;
  const shouldShow = scrollableHeight > 240 && window.scrollY > 260;

  els.scrollTopButton.classList.toggle("is-visible", shouldShow);
  document.body.classList.toggle("has-scroll-top", shouldShow);

  if (!shouldShow) {
    window.clearTimeout(scrollTopIdleTimer);
    els.scrollTopButton.classList.remove("is-idle");
    return;
  }

  if (!fromScroll) {
    return;
  }

  els.scrollTopButton.classList.remove("is-idle");
  window.clearTimeout(scrollTopIdleTimer);
  scrollTopIdleTimer = window.setTimeout(() => {
    if (window.scrollY > 260) {
      els.scrollTopButton.classList.add("is-idle");
    }
  }, 1100);
}

function initializeLayout() {
  clampStoredLayout();
}

function clampStoredLayout() {
  const storedWidth = Number(localStorage.getItem(LAYOUT_STORAGE_KEY));
  const storedLeftTopHeight = Number(localStorage.getItem(LEFT_TOP_LAYOUT_STORAGE_KEY));
  const storedRightTopHeight = Number(localStorage.getItem(RIGHT_TOP_LAYOUT_STORAGE_KEY));

  if (Number.isFinite(storedWidth) && storedWidth > 0) {
    applyLeftPanelWidth(storedWidth);
  }
  if (Number.isFinite(storedLeftTopHeight) && storedLeftTopHeight > 0) {
    applyColumnTopHeight("--left-top-height", storedLeftTopHeight, els.workspaceLeft, 180, 320, LEFT_TOP_LAYOUT_STORAGE_KEY, els.workspaceDividerLeft);
  }
  if (Number.isFinite(storedRightTopHeight) && storedRightTopHeight > 0) {
    applyColumnTopHeight("--right-top-height", storedRightTopHeight, els.workspaceRight, 220, 320, RIGHT_TOP_LAYOUT_STORAGE_KEY, els.workspaceDividerRight);
  }
}

function bindLayoutResize() {
  bindSplitResize({
    divider: els.workspaceDivider,
    orientation: "vertical",
    onMove(event) {
      const gridRect = els.workspaceGrid.getBoundingClientRect();
      applyLeftPanelWidth(event.clientX - gridRect.left, gridRect.width);
    },
    onStep(delta) {
      const current = els.workspaceLeft.getBoundingClientRect().width;
      applyLeftPanelWidth(current + delta);
    },
  });

  bindSplitResize({
    divider: els.workspaceDividerLeft,
    orientation: "horizontal",
    onMove(event) {
      const columnRect = els.workspaceLeft.getBoundingClientRect();
      applyColumnTopHeight("--left-top-height", event.clientY - columnRect.top, els.workspaceLeft, 180, 320, LEFT_TOP_LAYOUT_STORAGE_KEY, els.workspaceDividerLeft);
    },
    onStep(delta) {
      const current = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--left-top-height")) || 360;
      applyColumnTopHeight("--left-top-height", current + delta, els.workspaceLeft, 180, 320, LEFT_TOP_LAYOUT_STORAGE_KEY, els.workspaceDividerLeft);
    },
  });

  bindSplitResize({
    divider: els.workspaceDividerRight,
    orientation: "horizontal",
    onMove(event) {
      const columnRect = els.workspaceRight.getBoundingClientRect();
      applyColumnTopHeight("--right-top-height", event.clientY - columnRect.top, els.workspaceRight, 220, 320, RIGHT_TOP_LAYOUT_STORAGE_KEY, els.workspaceDividerRight);
    },
    onStep(delta) {
      const current = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--right-top-height")) || 240;
      applyColumnTopHeight("--right-top-height", current + delta, els.workspaceRight, 220, 320, RIGHT_TOP_LAYOUT_STORAGE_KEY, els.workspaceDividerRight);
    },
  });
}

function bindSplitResize({ divider, orientation, onMove, onStep }) {
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
    renderResults();
    updateAllScrollableTableStates();
  };

  divider.addEventListener("pointerdown", (event) => {
    dragging = true;
    divider.classList.add("is-dragging");
    divider.setPointerCapture(event.pointerId);
  });

  divider.addEventListener("keydown", (event) => {
    const step = event.shiftKey ? 48 : 16;
    const isDec = orientation === "vertical" ? event.key === "ArrowLeft" : event.key === "ArrowUp";
    const isInc = orientation === "vertical" ? event.key === "ArrowRight" : event.key === "ArrowDown";
    if (!isDec && !isInc) return;

    event.preventDefault();
    onStep(isInc ? step : -step);
    renderResults();
    updateAllScrollableTableStates();
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
  els.workspaceDivider?.setAttribute("aria-valuenow", String(clampedWidth));
}

function applyColumnTopHeight(variableName, rawHeight, columnElement, minHeight, minBottomHeight, storageKey, dividerEl = null) {
  if (!columnElement) return;

  const availableHeight = columnElement.getBoundingClientRect().height;
  const maxHeight = Math.max(minHeight, Math.round(availableHeight - minBottomHeight));
  const clampedHeight = Math.max(minHeight, Math.min(maxHeight, Math.round(rawHeight)));
  document.documentElement.style.setProperty(variableName, `${clampedHeight}px`);
  localStorage.setItem(storageKey, String(clampedHeight));
  dividerEl?.setAttribute("aria-valuenow", String(clampedHeight));
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
  els.fileInput.value = "";
  if (!incoming.length) {
    showToast("没有检测到 .ass 文件。");
    return;
  }

  try {
    const loadedFiles = await Promise.all(
      incoming.map((file) => {
        const existing = state.files.find((item) => item.name === file.name) ?? null;
        return loadAssFile(file, state.decodeEncoding, existing, { respectBom: true });
      })
    );

    loadedFiles.forEach((parsedFile) => {
      const existingIndex = state.files.findIndex((item) => item.name === parsedFile.name);
      if (existingIndex >= 0) {
        clearFileDerivedState(parsedFile.id, { preserveId: false });
        state.files[existingIndex] = parsedFile;
      } else {
        state.files.push(parsedFile);
      }
    });

    normalizeActiveFile();
    setRawDirty(false);
    renderApp();

    const warnedCount = loadedFiles.filter((file) => file.hasDecodeWarning).length;
    if (warnedCount > 0) {
      showToast(`已导入 ${incoming.length} 个文件；其中 ${warnedCount} 个存在疑似乱码字符，可尝试切换编码后重新解码。`);
    } else {
      showToast(`已导入 ${incoming.length} 个字幕文件。`);
    }
  } catch (error) {
    showToast(`导入失败: ${error.message}`);
  }
}

async function reloadAllFilesWithEncoding() {
  if (!state.files.length) {
    showToast("当前没有已导入文件。");
    return;
  }

  if (state.rawDirty && !confirmDiscardRawEdits()) {
    return;
  }

  flushPendingSync();
  const hasEdits = state.files.some((file) => file.isDirty);
  if (hasEdits && !window.confirm("已有文件存在未导出的编辑内容，按新编码重新解码会从原文件重新解析并覆盖这些改动，是否继续？")) {
    return;
  }

  try {
    state.files = await Promise.all(
      state.files.map((item) => loadAssFile(item.originalFile, state.decodeEncoding, item, { respectBom: false }))
    );
    state.files.forEach((item) => clearFileDerivedState(item.id, { preserveLayoutPrefs: true }));
    setRawDirty(false);
    normalizeActiveFile();
    renderApp();

    const warnedCount = state.files.filter((file) => file.hasDecodeWarning).length;
    showToast(
      warnedCount > 0
        ? `已使用 ${state.decodeEncoding} 重新解码，仍有 ${warnedCount} 个文件含替换字符，可换用其他编码。`
        : `已使用 ${state.decodeEncoding} 重新解码。`
    );
  } catch (error) {
    showToast(`重新解码失败: ${error.message}`);
  }
}

function removeSelectedFiles() {
  const removed = state.files.filter((file) => file.selected);
  if (!removed.length) {
    showToast("没有勾选要删除的文件。");
    return;
  }
  if (removed.some((file) => file.id === state.activeFileId) && state.rawDirty && !confirmDiscardRawEdits()) {
    return;
  }

  removed.forEach((file) => clearFileDerivedState(file.id));
  state.files = state.files.filter((file) => !file.selected);
  if (!state.files.some((file) => file.id === state.activeFileId)) {
    setRawDirty(false);
  }
  normalizeActiveFile();
  renderApp();
}

function clearAllFiles() {
  if (state.rawDirty && !confirmDiscardRawEdits()) {
    return;
  }
  state.files.forEach((file) => clearFileDerivedState(file.id));
  state.files = [];
  state.activeFileId = null;
  setRawDirty(false);
  renderApp();
}

function clearFileDerivedState(fileId, { preserveLayoutPrefs = false } = {}) {
  const timer = state.pendingSyncTimers.get(fileId);
  if (timer) {
    clearTimeout(timer);
    state.pendingSyncTimers.delete(fileId);
  }
  state.undoStacks.delete(fileId);
  state.redoStacks.delete(fileId);
  state.previewPages.styles.delete(fileId);
  state.previewPages.events.delete(fileId);
  if (!preserveLayoutPrefs) {
    state.expandedColumns.styles.delete(fileId);
    state.expandedColumns.events.delete(fileId);
    state.timelineTools.delete(fileId);
    state.eventsToolboxTab.delete(fileId);
    state.eventFilters.delete(fileId);
    state.replaceTools.delete(fileId);
  }
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

async function loadAssFile(file, encoding, previous = null, { respectBom = true } = {}) {
  const buffer = await file.arrayBuffer();
  const decoded = decodeAssBuffer(buffer, encoding, { respectBom });
  const parsed = parseAss(decoded.text);
  const outputName = previous?.outputName ?? file.name;
  return {
    id: previous?.id ?? generateId(),
    name: file.name,
    outputName: normalizeAssFileName(outputName, file.name),
    encoding: decoded.encoding,
    hasDecodeWarning: decoded.hasDecodeWarning,
    isDirty: false,
    originalFile: file,
    originalText: decoded.text,
    parsed,
    outputText: decoded.text,
    selected: previous?.selected ?? true,
    stats: summarizeParsedAss(parsed, decoded.text),
  };
}

function detectBomEncoding(bytes) {
  if (!bytes || bytes.length < 2) return null;
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return "utf-8";
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return "utf-16le";
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return "utf-16be";
  }
  return null;
}

function decodeAssBuffer(buffer, requestedEncoding = "utf-8", { respectBom = true } = {}) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const bomEncoding = detectBomEncoding(bytes);
  const effectiveEncoding =
    respectBom && bomEncoding && (requestedEncoding === "utf-8" || bomEncoding !== "utf-8")
      ? bomEncoding
      : requestedEncoding;

  const decoder = new TextDecoder(effectiveEncoding, { fatal: false });
  const text = decoder.decode(bytes);
  return {
    text,
    encoding: effectiveEncoding,
    hasDecodeWarning: text.includes("\uFFFD"),
  };
}

// ASS parsing & serialization
function parseAss(text) {
  const cleanText = String(text ?? "").replace(/^\uFEFF/, "");
  const normalized = cleanText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  const sections = [];
  const sectionMap = new Map();
  let current = { name: "__root__", lines: [] };
  sections.push(current);

  for (const line of lines) {
    const headerMatch = line.match(/^\[(.+?)\]\s*$/);
    if (headerMatch) {
      const sectionName = headerMatch[1].trim();
      const existing = sectionMap.get(sectionName);
      if (existing) {
        current = existing;
      } else {
        current = { name: sectionName, lines: [] };
        sections.push(current);
        sectionMap.set(sectionName, current);
      }
    } else {
      current.lines.push(line);
    }
  }

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
  const items = [];

  for (const line of section.lines) {
    if (!line.trim()) {
      const extra = { type: "blank", raw: line };
      extras.push(extra);
      items.push({ kind: "blank", raw: line });
      continue;
    }
    if (line.trim().startsWith(";")) {
      const extra = { type: "comment", raw: line };
      extras.push(extra);
      items.push({ kind: "comment", raw: line });
      continue;
    }
    const formatMatch = line.match(/^Format:\s*(.*)$/i);
    if (formatMatch) {
      format = formatMatch[1]
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      continue;
    }
    const styleMatch = line.match(/^Style:\s*(.*)$/i);
    if (styleMatch) {
      const activeFormat = format.length ? format : DEFAULT_STYLE_FORMAT;
      if (!format.length) format = [...DEFAULT_STYLE_FORMAT];
      const values = splitAssFields(styleMatch[1].trim(), activeFormat.length);
      const row = { data: Object.fromEntries(activeFormat.map((field, index) => [field, values[index] ?? ""])) };
      rows.push(row);
      items.push({ kind: "row", row });
      continue;
    }
    const extra = { type: "raw", raw: line };
    extras.push(extra);
    items.push({ kind: "raw", raw: line });
  }

  return { format, rows, extras, items };
}

function parseEventsSection(section) {
  if (!section) return null;
  let format = [];
  const rows = [];
  const extras = [];
  const items = [];
  const canonicalEventTypeMap = new Map(EVENT_TYPES.map((type) => [type.toLowerCase(), type]));

  for (const line of section.lines) {
    if (!line.trim()) {
      const extra = { type: "blank", raw: line };
      extras.push(extra);
      items.push({ kind: "blank", raw: line });
      continue;
    }
    if (line.trim().startsWith(";")) {
      const extra = { type: "comment", raw: line };
      extras.push(extra);
      items.push({ kind: "comment", raw: line });
      continue;
    }
    const formatMatch = line.match(/^Format:\s*(.*)$/i);
    if (formatMatch) {
      format = formatMatch[1]
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      continue;
    }

    const match = line.match(/^([A-Za-z]+):\s*(.*)$/);
    if (!match) {
      const extra = { type: "raw", raw: line };
      extras.push(extra);
      items.push({ kind: "raw", raw: line });
      continue;
    }

    const canonicalType = canonicalEventTypeMap.get(match[1].toLowerCase());
    if (!canonicalType) {
      const extra = { type: "raw", raw: line };
      extras.push(extra);
      items.push({ kind: "raw", raw: line });
      continue;
    }

    const activeFormat = format.length ? format : DEFAULT_EVENT_FORMAT;
    if (!format.length) format = [...DEFAULT_EVENT_FORMAT];
    const values = splitAssFields(match[2], activeFormat.length);
    const row = {
      eventType: canonicalType,
      data: Object.fromEntries(activeFormat.map((field, index) => [field, values[index] ?? ""])),
    };
    rows.push(row);
    items.push({ kind: "row", row });
  }

  return { format, rows, extras, items };
}

function splitAssFields(text, count) {
  if (!count) return [text];
  const parts = [];
  let buffer = "";
  // ASS stores the last field as a free-form tail. We only split the first
  // count - 1 commas so dialogue text and similar payloads stay intact.
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

function sanitizeSingleLineField(value, { disallowComma = false } = {}) {
  let result = String(value ?? "").replace(/\r\n|\r|\n/g, " ");
  if (disallowComma) {
    result = result.replace(/,/g, ";");
  }
  return result;
}

function sanitizeEventLastField(value) {
  return String(value ?? "").replace(/\r\n|\r|\n/g, "\\N");
}

function insertSectionRow(section, newRow, afterRow = null) {
  if (!section) return;
  if (!Array.isArray(section.items)) {
    section.items = section.rows.map((row) => ({ kind: "row", row }));
  }
  if (!afterRow) {
    section.rows.push(newRow);
    section.items.push({ kind: "row", row: newRow });
    return;
  }

  const rowIndex = section.rows.indexOf(afterRow);
  if (rowIndex >= 0) {
    section.rows.splice(rowIndex + 1, 0, newRow);
  } else {
    section.rows.push(newRow);
  }

  const itemIndex = section.items.findIndex((item) => item.kind === "row" && item.row === afterRow);
  if (itemIndex >= 0) {
    section.items.splice(itemIndex + 1, 0, { kind: "row", row: newRow });
  } else {
    section.items.push({ kind: "row", row: newRow });
  }
}

function removeSectionRow(section, targetRow) {
  if (!section) return;
  section.rows = section.rows.filter((row) => row !== targetRow);
  if (Array.isArray(section.items)) {
    section.items = section.items.filter((item) => !(item.kind === "row" && item.row === targetRow));
  }
}

function createDefaultStyleRow(format, templateRow = null) {
  const fields = format?.length ? format : DEFAULT_STYLE_FORMAT;
  if (templateRow) {
    const clonedData = { ...templateRow.data };
    const baseName = String(clonedData.Name || "Style").trim();
    clonedData.Name = `${baseName} Copy`;
    return { data: clonedData };
  }

  const defaults = {
    Name: "Default",
    Fontname: "Arial",
    Fontsize: "20",
    PrimaryColour: "&H00FFFFFF",
    SecondaryColour: "&H000000FF",
    OutlineColour: "&H00000000",
    BackColour: "&H00000000",
    Bold: "0",
    Italic: "0",
    Underline: "0",
    StrikeOut: "0",
    ScaleX: "100",
    ScaleY: "100",
    Spacing: "0",
    Angle: "0",
    BorderStyle: "1",
    Outline: "2",
    Shadow: "2",
    Alignment: "2",
    MarginL: "10",
    MarginR: "10",
    MarginV: "10",
    Encoding: "1",
  };
  return {
    data: Object.fromEntries(fields.map((field) => [field, defaults[field] ?? ""])),
  };
}

function createDefaultEventRow(format, templateRow = null) {
  const fields = format?.length ? format : DEFAULT_EVENT_FORMAT;
  if (templateRow) {
    return {
      eventType: templateRow.eventType || "Dialogue",
      data: { ...templateRow.data },
    };
  }

  const defaults = {
    Layer: "0",
    Marked: "Marked=0",
    Start: "0:00:00.00",
    End: "0:00:05.00",
    Style: "Default",
    Name: "",
    Actor: "",
    MarginL: "0",
    MarginR: "0",
    MarginV: "0",
    Effect: "",
    Text: "",
  };
  return {
    eventType: "Dialogue",
    data: Object.fromEntries(fields.map((field) => [field, defaults[field] ?? ""])),
  };
}

// Timeline batch editing helpers
function getTimelineToolState(fileId) {
  if (!state.timelineTools.has(fileId)) {
    state.timelineTools.set(fileId, {
      rangeStart: "",
      rangeEnd: "",
      offsetSeconds: "0.30",
      direction: "later",
      matchMode: "start",
    });
  }
  return state.timelineTools.get(fileId);
}

function getEventFilterState(fileId) {
  if (!state.eventFilters.has(fileId)) {
    state.eventFilters.set(fileId, {
      query: "",
      style: "",
      eventType: "all",
    });
  }
  return state.eventFilters.get(fileId);
}

function getReplaceToolState(fileId) {
  if (!state.replaceTools.has(fileId)) {
    state.replaceTools.set(fileId, {
      search: "",
      replaceWith: "",
      field: "Text",
      caseSensitive: false,
      useRegex: false,
      filteredOnly: true,
    });
  }
  return state.replaceTools.get(fileId);
}

function parseFlexibleTimeToCentiseconds(value) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;

  if (/^-?\d+(?:\.\d+)?$/.test(normalized)) {
    return Math.round(Number(normalized) * 100);
  }

  const colonLike = normalized
    .replace(/，/g, ",")
    .replace(/：/g, ":")
    .replace(/,/g, ".")
    .replace(/\s+/g, "");

  const directMatch = colonLike.match(/^(-)?(\d+):(\d{1,2}):(\d{1,2})(?:\.(\d{1,2}))?$/);
  if (directMatch) {
    const [, sign = "", hours, minutes, seconds, centiseconds = "0"] = directMatch;
    return buildCentiseconds(sign === "-", Number(hours), Number(minutes), Number(seconds), Number(centiseconds.padEnd(2, "0").slice(0, 2)));
  }

  const dottedMatch = colonLike.match(/^(-)?(\d{1,2})\.(\d{1,2})\.(\d{1,2})$/);
  if (dottedMatch) {
    const [, sign = "", minutes, seconds, centiseconds] = dottedMatch;
    return buildCentiseconds(sign === "-", 0, Number(minutes), Number(seconds), Number(centiseconds));
  }

  return null;
}

function buildCentiseconds(isNegative, hours, minutes, seconds, centiseconds) {
  if ([hours, minutes, seconds, centiseconds].some((part) => !Number.isFinite(part))) {
    return null;
  }
  const total = (((hours * 60 + minutes) * 60 + seconds) * 100) + centiseconds;
  return isNegative ? -total : total;
}

function parseAssTimestamp(value) {
  const match = String(value ?? "").trim().match(/^(\d+):(\d{1,2}):(\d{1,2})\.(\d{1,2})$/);
  if (!match) return null;
  const [, hours, minutes, seconds, centiseconds] = match;
  return buildCentiseconds(false, Number(hours), Number(minutes), Number(seconds), Number(centiseconds));
}

function formatAssTimestamp(totalCentiseconds) {
  const safeValue = Math.max(0, Math.round(totalCentiseconds));
  const hours = Math.floor(safeValue / 360000);
  const minutes = Math.floor((safeValue % 360000) / 6000);
  const seconds = Math.floor((safeValue % 6000) / 100);
  const centiseconds = safeValue % 100;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}`;
}

function shiftEventsTimeline(eventsSection, { rangeStart, rangeEnd, offsetSeconds, direction = "later", matchMode = "start" }) {
  if (!eventsSection?.rows?.length) {
    return { ok: false, reason: "empty", affectedCount: 0, clampedCount: 0, skippedInvalidCount: 0 };
  }

  const parsedRangeStart = parseFlexibleTimeToCentiseconds(rangeStart);
  const parsedRangeEnd = parseFlexibleTimeToCentiseconds(rangeEnd);
  const offsetBase = parseFlexibleTimeToCentiseconds(offsetSeconds);

  if (parsedRangeStart === null || parsedRangeEnd === null) {
    return { ok: false, reason: "invalid-range", affectedCount: 0, clampedCount: 0, skippedInvalidCount: 0 };
  }

  if (offsetBase === null || offsetBase === 0) {
    return { ok: false, reason: "invalid-offset", affectedCount: 0, clampedCount: 0, skippedInvalidCount: 0 };
  }

  const normalizedStart = Math.min(parsedRangeStart, parsedRangeEnd);
  const normalizedEnd = Math.max(parsedRangeStart, parsedRangeEnd);
  const signedOffset = direction === "earlier" ? -Math.abs(offsetBase) : Math.abs(offsetBase);

  let affectedCount = 0;
  let clampedCount = 0;
  let skippedInvalidCount = 0;

  eventsSection.rows.forEach((row) => {
    const startTime = parseAssTimestamp(row.data.Start);
    const endTime = parseAssTimestamp(row.data.End);

    if (startTime === null || endTime === null || endTime < startTime) {
      skippedInvalidCount += 1;
      return;
    }

    const isMatched =
      matchMode === "overlap"
        ? endTime >= normalizedStart && startTime <= normalizedEnd
        : startTime >= normalizedStart && startTime <= normalizedEnd;

    if (!isMatched) {
      return;
    }

    const duration = endTime - startTime;
    const shiftedStart = startTime + signedOffset;
    // Negative timestamps are invalid in ASS. When a bulk shift crosses zero,
    // clamp the start and preserve duration so timing stays internally valid.
    const nextStart = Math.max(0, shiftedStart);
    const nextEnd = nextStart + duration;

    if (shiftedStart < 0) {
      clampedCount += 1;
    }

    if (nextStart === startTime && nextEnd === endTime) {
      return;
    }

    row.data.Start = formatAssTimestamp(nextStart);
    row.data.End = formatAssTimestamp(nextEnd);
    affectedCount += 1;
  });

  if (!affectedCount) {
    return {
      ok: false,
      reason: skippedInvalidCount > 0 ? "invalid-matched-rows" : "no-match",
      affectedCount: 0,
      clampedCount,
      skippedInvalidCount,
    };
  }

  return {
    ok: true,
    reason: null,
    affectedCount,
    clampedCount,
    skippedInvalidCount,
  };
}

function applyTimelineShift(file) {
  flushPendingSync(file);
  const eventsSection = file.parsed.events;
  const toolState = getTimelineToolState(file.id);
  const beforeText = file.outputText;
  const result = shiftEventsTimeline(eventsSection, toolState);

  if (!result.ok) {
    const messages = {
      empty: "当前文件没有可调整的事件时轴。",
      "invalid-range": "请输入有效的起止时间。可用 0:00:00.00 或 00.00.00。",
      "invalid-offset": "请输入有效的偏移量，且不能为 0。",
      "invalid-matched-rows": "没有完成调整：命中的事件里存在无法识别的时间格式。",
      "no-match": "没有命中可调整的事件。",
    };
    showToast(messages[result.reason] || "没有命中可调整的事件。");
    return;
  }

  pushUndoSnapshot(file.id, beforeText, "时轴快调");
  syncFileOutput(file);
  renderPreview();

  const detail = [];
  if (result.clampedCount > 0) detail.push(`${result.clampedCount} 条已贴齐 0 秒`);
  if (result.skippedInvalidCount > 0) detail.push(`${result.skippedInvalidCount} 条因时间格式异常被跳过`);

  showToast(detail.length ? `已调整 ${result.affectedCount} 条事件；${detail.join("，")}。` : `已调整 ${result.affectedCount} 条事件的时轴。`);
}

// Events filtering & batch replace helpers
function filterEventRows(rows, filter = {}) {
  const query = String(filter.query ?? "").trim().toLowerCase();
  const style = String(filter.style ?? "");
  const eventType = String(filter.eventType ?? "all");

  return (rows ?? []).filter((row) => {
    if (eventType !== "all" && row.eventType !== eventType) {
      return false;
    }
    if (style && (row.data.Style ?? "") !== style) {
      return false;
    }
    if (!query) {
      return true;
    }
    const haystack = [row.data.Text, row.data.Name, row.data.Actor, row.data.Style, row.data.Effect]
      .filter(Boolean)
      .join("\n")
      .toLowerCase();
    return haystack.includes(query);
  });
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function batchReplaceEvents(
  rows,
  { search, replaceWith = "", field = "Text", caseSensitive = false, useRegex = false, dryRun = false, isLastField = true }
) {
  const query = String(search ?? "");
  if (!query) {
    return { matchedRows: 0, replacementsCount: 0 };
  }

  const flags = caseSensitive ? "g" : "gi";
  const matcher = useRegex ? new RegExp(query, flags) : new RegExp(escapeRegExp(query), flags);
  let matchedRows = 0;
  let replacementsCount = 0;

  for (const row of rows ?? []) {
    const source = String(row.data?.[field] ?? "");
    const matches = source.match(matcher);
    if (!matches || !matches.length) continue;

    matchedRows += 1;
    replacementsCount += matches.length;

    if (!dryRun) {
      let nextValue = source.replace(matcher, String(replaceWith ?? ""));
      nextValue = isLastField ? sanitizeEventLastField(nextValue) : sanitizeSingleLineField(nextValue, { disallowComma: true });
      row.data[field] = nextValue;
    }
  }

  return { matchedRows, replacementsCount };
}

// Undo / Redo helpers
function pushUndoSnapshot(fileId, snapshotText, label = "编辑") {
  if (!fileId || typeof snapshotText !== "string") return;
  const stack = state.undoStacks.get(fileId) ?? [];
  if (stack.length && stack[stack.length - 1].text === snapshotText) {
    return;
  }
  stack.push({ text: snapshotText, label });
  if (stack.length > MAX_HISTORY_STEPS) {
    stack.shift();
  }
  state.undoStacks.set(fileId, stack);
  state.redoStacks.set(fileId, []);
  updateHistoryButtons();
}

function applySnapshotToFile(file, snapshotText) {
  file.parsed = parseAss(snapshotText);
  file.outputText = stringifyAss(file.parsed);
  file.isDirty = file.outputText !== file.originalText;
  file.stats = summarizeParsedAss(file.parsed, file.outputText);
  if (state.previewMode === "raw" && file.id === state.activeFileId) {
    els.rawEditor.value = file.outputText;
    setRawDirty(false);
  }
}

function handleUndo() {
  const file = getActiveFile();
  if (!file) return;
  flushPendingSync(file);

  const undoStack = state.undoStacks.get(file.id) ?? [];
  if (!undoStack.length) {
    showToast("没有可撤销的修改。");
    return;
  }

  const entry = undoStack.pop();
  const redoStack = state.redoStacks.get(file.id) ?? [];
  redoStack.push({ text: file.outputText, label: entry.label });
  if (redoStack.length > MAX_HISTORY_STEPS) {
    redoStack.shift();
  }
  state.redoStacks.set(file.id, redoStack);

  applySnapshotToFile(file, entry.text);
  renderApp();
  showToast(`已撤销：${entry.label}`);
}

function handleRedo() {
  const file = getActiveFile();
  if (!file) return;
  flushPendingSync(file);

  const redoStack = state.redoStacks.get(file.id) ?? [];
  if (!redoStack.length) {
    showToast("没有可重做的修改。");
    return;
  }

  const entry = redoStack.pop();
  const undoStack = state.undoStacks.get(file.id) ?? [];
  undoStack.push({ text: file.outputText, label: entry.label });
  if (undoStack.length > MAX_HISTORY_STEPS) {
    undoStack.shift();
  }
  state.undoStacks.set(file.id, undoStack);

  applySnapshotToFile(file, entry.text);
  renderApp();
  showToast(`已重做：${entry.label}`);
}

function updateHistoryButtons() {
  if (!els) return;
  const file = getActiveFile();
  const undoCount = file ? (state.undoStacks.get(file.id)?.length ?? 0) : 0;
  const redoCount = file ? (state.redoStacks.get(file.id)?.length ?? 0) : 0;
  els.undoEdit.disabled = undoCount === 0;
  els.redoEdit.disabled = redoCount === 0;
  els.undoEdit.textContent = undoCount ? `撤销 (${undoCount})` : "撤销";
  els.redoEdit.textContent = redoCount ? `重做 (${redoCount})` : "重做";
}

function setRawDirty(isDirty) {
  state.rawDirty = Boolean(isDirty);
  if (els?.rawDirtyBadge) {
    els.rawDirtyBadge.classList.toggle("hidden", !state.rawDirty);
  }
}

function confirmDiscardRawEdits() {
  if (!state.rawDirty) return true;
  return window.confirm("原文编辑区有未保存的改动，确定要放弃这些改动吗？\n点击「取消」可留在原文编辑先保存。");
}

// Derived metadata
function getUtf8ByteLength(text) {
  return utf8Encoder.encode(String(text ?? "")).length;
}

function summarizeParsedAss(parsed, text) {
  return {
    bytes: getUtf8ByteLength(text),
    lineCount: parsed.lineCount,
    sections: parsed.sections.filter((section) => section.name !== "__root__").map((section) => section.name),
    infoKeys: parsed.scriptInfo?.entries.filter((entry) => entry.type === "kv").length ?? 0,
    garbageKeys: parsed.aegisubGarbage?.entries.filter((entry) => entry.type === "kv").length ?? 0,
    styleCount: parsed.styles?.rows.length ?? 0,
    eventCount: parsed.events?.rows.length ?? 0,
  };
}

// File list and preview rendering
function renderFiles() {
  els.fileList.innerHTML = "";
  els.activeFileSelect.innerHTML = "";

  if (!state.files.length) {
    els.activeFileSelect.disabled = true;
    els.activeFileSelect.innerHTML = '<option value="">暂无可编辑文件</option>';
    els.fileList.className = "file-list empty-state";
    els.fileList.innerHTML = "<p>还没有导入文件。</p>";
    return;
  }

  els.activeFileSelect.disabled = false;
  els.fileList.className = "file-list";
  for (const file of state.files) {
    const node = els.fileRowTemplate.content.firstElementChild.cloneNode(true);
    node.classList.toggle("is-active", file.id === state.activeFileId);

    const checkbox = node.querySelector(".file-checkbox");
    const nameInput = node.querySelector(".file-name-input");
    const metaEl = node.querySelector(".file-meta");
    const activateBtn = node.querySelector(".file-activate");
    const removeBtn = node.querySelector(".file-remove");

    checkbox.checked = file.selected;
    checkbox.setAttribute("aria-label", `选择文件 ${file.outputName}`);
    checkbox.addEventListener("change", () => {
      file.selected = checkbox.checked;
      renderResults();
    });

    nameInput.value = file.outputName;
    nameInput.setAttribute("aria-label", `修改导出文件名 ${file.name}`);
    nameInput.addEventListener("input", () => {
      file.outputName = normalizeAssFileName(nameInput.value, file.name);
      option.textContent = file.outputName;
      if (state.activeFileId === file.id && state.previewMode === "visual") {
        updatePreviewSummary(file);
      }
      renderResults();
    });

    const statusTags = [formatBytes(file.stats.bytes), `${file.stats.lineCount} 行`, file.encoding];
    if (file.isDirty) statusTags.push("已修改");
    if (file.hasDecodeWarning) statusTags.push("疑似乱码");
    metaEl.textContent = statusTags.join(" · ");

    activateBtn.textContent = file.id === state.activeFileId ? "编辑中" : "预览";
    activateBtn.addEventListener("click", () => {
      if (state.activeFileId === file.id) return;
      if (!confirmDiscardRawEdits()) return;
      flushPendingSync(getActiveFile());
      state.activeFileId = file.id;
      setRawDirty(false);
      renderFiles();
      renderPreview();
      updateHistoryButtons();
    });

    removeBtn.addEventListener("click", () => {
      if (file.id === state.activeFileId && state.rawDirty && !confirmDiscardRawEdits()) {
        return;
      }
      clearFileDerivedState(file.id);
      state.files = state.files.filter((item) => item.id !== file.id);
      if (file.id === state.activeFileId) {
        setRawDirty(false);
      }
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
    setRawDirty(false);
    updateHistoryButtons();
    return;
  }

  els.previewVisualMode.classList.toggle("active", state.previewMode === "visual");
  els.previewRawMode.classList.toggle("active", state.previewMode === "raw");

  if (state.previewMode === "raw") {
    els.rawEditor.classList.remove("hidden");
    if (!state.rawDirty) {
      els.rawEditor.value = file.outputText;
    }
    els.previewContent.className = "preview-content hidden";
    els.previewContent.innerHTML = "";
    updateHistoryButtons();
    return;
  }

  els.rawEditor.classList.add("hidden");
  els.previewContent.className = "preview-content";
  els.previewContent.innerHTML = "";

  const summaryCard = document.createElement("article");
  summaryCard.className = "preview-card";
  summaryCard.dataset.role = "preview-summary";
  summaryCard.innerHTML = buildSummaryCardHtml(file);
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
  updateHistoryButtons();
}

function buildSummaryCardHtml(file) {
  const warningBadge = file.hasDecodeWarning
    ? `<span class="pill dirty-badge">存在疑似乱码字符，建议切换导入编码</span>`
    : "";
  return `
    <header>
      <strong>${escapeHtml(file.outputName)}</strong>
      <div class="preview-card-header-right">
        ${warningBadge}
        <span class="pill">${formatBytes(file.stats.bytes)} / ${file.stats.lineCount} 行</span>
      </div>
    </header>
    <div class="preview-meta">源文件: ${escapeHtml(file.name)} · Section: ${escapeHtml(file.stats.sections.join(" / ") || "无")}</div>
  `;
}

function updatePreviewSummary(file) {
  const summaryCard = els.previewContent.querySelector('[data-role="preview-summary"]');
  if (!summaryCard) return;
  summaryCard.innerHTML = buildSummaryCardHtml(file);
}

function attachCellHistoryTracking(input, file, { disallowComma = false, isLastEventField = false } = {}) {
  let focusSnapshot = null;

  input.addEventListener("focus", () => {
    flushPendingSync(file);
    focusSnapshot = file.outputText;
  });

  input.addEventListener("change", () => {
    if (disallowComma && input.value.includes(",")) {
      input.value = sanitizeSingleLineField(input.value, { disallowComma: true });
      showToast("ASS 非末列字段不能包含英文逗号，已自动替换为分号。");
    }
    if (isLastEventField && /[\r\n]/.test(input.value)) {
      input.value = sanitizeEventLastField(input.value);
      showToast("ASS 对话内容中的换行已自动转换为 \\N。");
    }
  });

  input.addEventListener("blur", () => {
    flushPendingSync(file);
    if (focusSnapshot !== null && file.outputText !== focusSnapshot) {
      pushUndoSnapshot(file.id, focusSnapshot, "单元格编辑");
    }
    focusSnapshot = null;
  });
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
  addBtn.type = "button";
  addBtn.className = "ghost small";
  addBtn.textContent = "新增条目";
  addBtn.addEventListener("click", () => {
    flushPendingSync(file);
    pushUndoSnapshot(file.id, file.outputText, `新增 ${title} 条目`);
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
    keyInput.setAttribute("aria-label", `${title} 键`);
    attachCellHistoryTracking(keyInput, file);
    keyInput.addEventListener("input", () => {
      entry.key = sanitizeSingleLineField(keyInput.value);
      scheduleSyncFileOutput(file);
    });

    const valueInput = document.createElement("input");
    valueInput.value = entry.value;
    valueInput.setAttribute("aria-label", `${title} ${entry.key} 值`);
    attachCellHistoryTracking(valueInput, file);
    valueInput.addEventListener("input", () => {
      entry.value = sanitizeSingleLineField(valueInput.value);
      scheduleSyncFileOutput(file);
    });

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "ghost small";
    removeBtn.textContent = "删除";
    removeBtn.addEventListener("click", () => {
      flushPendingSync(file);
      pushUndoSnapshot(file.id, file.outputText, `删除 ${title} 条目`);
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
  if (!section) return null;

  const rows = section.rows ?? [];
  const allColumns = section.format.length ? section.format : DEFAULT_STYLE_FORMAT;
  const isExpanded = state.expandedColumns.styles.has(file.id);
  const shownColumns = isExpanded ? allColumns : allColumns.slice(0, 10);
  const tableColumns = [...shownColumns, "rowActions"];

  const totalPages = Math.max(1, Math.ceil(rows.length / STYLE_PAGE_SIZE));
  const page = clampPage("styles", file.id, totalPages);
  const visibleRows = rows.slice(page * STYLE_PAGE_SIZE, page * STYLE_PAGE_SIZE + STYLE_PAGE_SIZE);

  const card = document.createElement("article");
  card.className = "preview-card";
  const header = document.createElement("header");
  header.innerHTML = `
    <strong>V4+ Styles</strong>
    <span class="pill">${rows.length} 条，第 ${page + 1}/${totalPages} 页</span>
  `;

  const actions = document.createElement("div");
  actions.className = "section-actions";

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "ghost small";
  addBtn.textContent = "+ 新增样式";
  addBtn.addEventListener("click", () => {
    flushPendingSync(file);
    pushUndoSnapshot(file.id, file.outputText, "新增样式");
    if (!section.format.length) section.format = [...DEFAULT_STYLE_FORMAT];
    insertSectionRow(section, createDefaultStyleRow(section.format));
    setCurrentPage("styles", file.id, Math.max(0, Math.ceil(section.rows.length / STYLE_PAGE_SIZE) - 1));
    syncFileOutput(file);
  });
  actions.appendChild(addBtn);

  if (allColumns.length > 10) {
    const toggleColsBtn = document.createElement("button");
    toggleColsBtn.type = "button";
    toggleColsBtn.className = "ghost small";
    toggleColsBtn.textContent = isExpanded ? "收起为前 10 列" : `展开全部列 (${allColumns.length} 列)`;
    toggleColsBtn.addEventListener("click", () => {
      if (isExpanded) {
        state.expandedColumns.styles.delete(file.id);
      } else {
        state.expandedColumns.styles.add(file.id);
      }
      renderPreview();
    });
    actions.appendChild(toggleColsBtn);
  }

  if (!rows.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = "<p>当前没有样式行，可点击上方「+ 新增样式」。</p>";
    card.append(header, actions, empty);
    return card;
  }

  const wrap = document.createElement("div");
  wrap.className = "editor-table-wrap";
  const table = document.createElement("table");
  table.className = "editor-table";
  table.innerHTML = `<thead><tr>${shownColumns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}<th>操作</th></tr></thead>`;
  applyDynamicTableLayout(table, tableColumns, "styles");
  const tbody = document.createElement("tbody");

  visibleRows.forEach((row) => {
    const tr = document.createElement("tr");
    shownColumns.forEach((column) => {
      const colIndex = allColumns.indexOf(column);
      const isLast = colIndex === allColumns.length - 1;
      const input = document.createElement("input");
      input.value = row.data[column] ?? "";
      input.setAttribute("aria-label", `样式 ${column}`);
      attachCellHistoryTracking(input, file, { disallowComma: !isLast });
      input.addEventListener("input", () => {
        row.data[column] = isLast ? sanitizeSingleLineField(input.value) : sanitizeSingleLineField(input.value, { disallowComma: true });
        scheduleSyncFileOutput(file);
      });
      tr.appendChild(createCell(input, column, "styles"));
    });

    tr.appendChild(createRowActionsCell(file, section, row, "styles", "样式"));
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  wrap.appendChild(table);
  card.append(
    header,
    actions,
    buildPager(page, totalPages, (nextPage) => setCurrentPage("styles", file.id, nextPage)),
    wrap,
    buildPager(page, totalPages, (nextPage) => setCurrentPage("styles", file.id, nextPage))
  );
  return card;
}

function getDefaultVisibleEventColumns(format) {
  const columns = ["eventType"];
  if (format.includes("Layer")) columns.push("Layer");
  if (format.includes("Start")) columns.push("Start");
  if (format.includes("End")) columns.push("End");
  if (format.includes("Style")) columns.push("Style");
  if (format.includes("Name")) {
    columns.push("Name");
  } else if (format.includes("Actor")) {
    columns.push("Actor");
  }
  const tail = format[format.length - 1];
  if (tail && !columns.includes(tail)) {
    columns.push(tail);
  }
  return columns;
}

function buildEditableEventsPreview(file) {
  const section = file.parsed.events;
  if (!section) return null;

  const allRows = section.rows ?? [];
  const allFormat = section.format.length ? section.format : DEFAULT_EVENT_FORMAT;
  const isExpanded = state.expandedColumns.events.has(file.id);
  const dataColumns = isExpanded ? allFormat : getDefaultVisibleEventColumns(allFormat).filter((col) => col !== "eventType");
  const columns = ["eventType", ...dataColumns, "rowActions"];

  const filterState = getEventFilterState(file.id);
  const filteredRows = filterEventRows(allRows, filterState);
  const isFiltered = Boolean(filterState.query.trim() || filterState.style || filterState.eventType !== "all");

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / EVENT_PAGE_SIZE));
  const page = clampPage("events", file.id, totalPages);
  const visibleRows = filteredRows.slice(page * EVENT_PAGE_SIZE, page * EVENT_PAGE_SIZE + EVENT_PAGE_SIZE);

  const card = document.createElement("article");
  card.className = "preview-card";
  const header = document.createElement("header");
  const countLabel = isFiltered
    ? `命中 ${filteredRows.length}/${allRows.length} 条，第 ${page + 1}/${totalPages} 页`
    : `${allRows.length} 条，第 ${page + 1}/${totalPages} 页`;
  header.innerHTML = `
    <strong>Events</strong>
    <span class="pill">${countLabel}</span>
  `;

  const actions = document.createElement("div");
  actions.className = "section-actions";

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "ghost small";
  addBtn.textContent = "+ 新增事件";
  addBtn.addEventListener("click", () => {
    flushPendingSync(file);
    pushUndoSnapshot(file.id, file.outputText, "新增事件");
    if (!section.format.length) section.format = [...DEFAULT_EVENT_FORMAT];
    insertSectionRow(section, createDefaultEventRow(section.format));
    if (isFiltered) {
      filterState.query = "";
      filterState.style = "";
      filterState.eventType = "all";
    }
    setCurrentPage("events", file.id, Math.max(0, Math.ceil(section.rows.length / EVENT_PAGE_SIZE) - 1));
    syncFileOutput(file);
  });
  actions.appendChild(addBtn);

  const toggleColsBtn = document.createElement("button");
  toggleColsBtn.type = "button";
  toggleColsBtn.className = "ghost small";
  toggleColsBtn.textContent = isExpanded ? "收起为常用字段" : `展开全部字段 (${allFormat.length} 列)`;
  toggleColsBtn.addEventListener("click", () => {
    if (isExpanded) {
      state.expandedColumns.events.delete(file.id);
    } else {
      state.expandedColumns.events.add(file.id);
    }
    renderPreview();
  });
  actions.appendChild(toggleColsBtn);

  const toolbox = buildEventsToolbox(file, filteredRows);

  if (!filteredRows.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = isFiltered
      ? "<p>当前筛选条件下没有匹配的事件。</p>"
      : "<p>当前没有事件行，可点击上方「+ 新增事件」。</p>";
    card.append(header, actions, toolbox, empty);
    return card;
  }

  const wrap = document.createElement("div");
  wrap.className = "editor-table-wrap";
  const table = document.createElement("table");
  table.className = "editor-table";
  table.innerHTML = `<thead><tr>${columns.map((column) => `<th>${escapeHtml(column === "rowActions" ? "操作" : column)}</th>`).join("")}</tr></thead>`;
  applyDynamicTableLayout(table, columns, "events");
  const tbody = document.createElement("tbody");
  const lastFieldName = allFormat[allFormat.length - 1];

  visibleRows.forEach((row) => {
    const tr = document.createElement("tr");
    columns.forEach((column) => {
      if (column === "rowActions") {
        tr.appendChild(createRowActionsCell(file, section, row, "events", "事件"));
      } else if (column === "eventType") {
        const select = document.createElement("select");
        select.setAttribute("aria-label", "事件类型");
        EVENT_TYPES.forEach((type) => {
          const option = document.createElement("option");
          option.value = type;
          option.textContent = type;
          option.selected = row.eventType === type;
          select.appendChild(option);
        });
        select.addEventListener("change", () => {
          flushPendingSync(file);
          pushUndoSnapshot(file.id, file.outputText, "修改事件类型");
          row.eventType = select.value;
          syncFileOutput(file);
        });
        tr.appendChild(createCell(select, column, "events"));
      } else {
        const isLast = column === lastFieldName;
        const input = document.createElement(isLast ? "textarea" : "input");
        input.value = row.data[column] ?? "";
        input.setAttribute("aria-label", `事件 ${column}`);
        if (isLast) input.rows = 2;
        attachCellHistoryTracking(input, file, { disallowComma: !isLast, isLastEventField: isLast });
        input.addEventListener("input", () => {
          row.data[column] = isLast ? sanitizeEventLastField(input.value) : sanitizeSingleLineField(input.value, { disallowComma: true });
          scheduleSyncFileOutput(file);
        });
        tr.appendChild(createCell(input, column, "events"));
      }
    });
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  wrap.appendChild(table);
  card.append(
    header,
    actions,
    toolbox,
    buildPager(page, totalPages, (nextPage) => setCurrentPage("events", file.id, nextPage)),
    wrap,
    buildPager(page, totalPages, (nextPage) => setCurrentPage("events", file.id, nextPage))
  );
  return card;
}

function createRowActionsCell(file, section, row, kind, labelText) {
  const group = document.createElement("div");
  group.className = "row-actions-group";

  const dupBtn = document.createElement("button");
  dupBtn.type = "button";
  dupBtn.className = "ghost small";
  dupBtn.textContent = "复制";
  dupBtn.addEventListener("click", () => {
    flushPendingSync(file);
    pushUndoSnapshot(file.id, file.outputText, `复制${labelText}`);
    const newRow = kind === "styles" ? createDefaultStyleRow(section.format, row) : createDefaultEventRow(section.format, row);
    insertSectionRow(section, newRow, row);
    syncFileOutput(file);
    renderPreview();
  });

  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "ghost small";
  delBtn.textContent = "删除";
  delBtn.addEventListener("click", () => {
    flushPendingSync(file);
    pushUndoSnapshot(file.id, file.outputText, `删除${labelText}`);
    removeSectionRow(section, row);
    syncFileOutput(file);
    renderPreview();
  });

  group.append(dupBtn, delBtn);
  return createCell(group, "rowActions", kind);
}

function buildEventsToolbox(file, filteredRows) {
  const currentTab = state.eventsToolboxTab.get(file.id) || "timeline";
  const tool = document.createElement("section");
  tool.className = "timeline-tool events-toolbox";

  const tabsRow = document.createElement("div");
  tabsRow.className = "toolbox-tabs";

  const tabButtons = document.createElement("div");
  tabButtons.className = "toolbox-tab-buttons";

  [
    ["timeline", "时轴快调"],
    ["filter-replace", "筛选与批量替换"],
  ].forEach(([tabKey, tabLabel]) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `ghost small${currentTab === tabKey ? " active" : ""}`;
    btn.textContent = tabLabel;
    btn.addEventListener("click", () => {
      if (currentTab === tabKey) return;
      state.eventsToolboxTab.set(file.id, tabKey);
      renderPreview();
    });
    tabButtons.appendChild(btn);
  });

  const hint = document.createElement("span");
  hint.className = "preview-meta";
  hint.textContent =
    currentTab === "timeline"
      ? "适合做整段提前 / 延后，默认按开始时间匹配范围。"
      : "支持按关键词、样式与类型筛选，或对命中事件批量替换。";

  tabsRow.append(tabButtons, hint);
  tool.appendChild(tabsRow);

  if (currentTab === "timeline") {
    appendTimelineToolBody(tool, file);
  } else {
    appendFilterReplaceToolBody(tool, file, filteredRows);
  }

  return tool;
}

function appendTimelineToolBody(tool, file) {
  const toolState = getTimelineToolState(file.id);
  const fields = document.createElement("div");
  fields.className = "timeline-tool-fields";

  const startLabel = buildTimelineField("起始时间", "例如 00.00.00 或 0:00:00.00");
  const startInput = startLabel.querySelector("input");
  startInput.value = toolState.rangeStart;
  startInput.addEventListener("input", () => {
    toolState.rangeStart = startInput.value;
  });

  const endField = buildTimelineField("结束时间", "例如 01.24.23 或 0:01:24.23");
  const endFieldInput = endField.querySelector("input");
  endFieldInput.value = toolState.rangeEnd;
  endFieldInput.addEventListener("input", () => {
    toolState.rangeEnd = endFieldInput.value;
  });

  const offsetField = buildTimelineField("偏移秒数", "输入 0.3、0.30 或 00.30");
  const offsetInput = offsetField.querySelector("input");
  offsetInput.value = toolState.offsetSeconds;
  offsetInput.addEventListener("input", () => {
    toolState.offsetSeconds = offsetInput.value;
  });

  const directionLabel = document.createElement("label");
  directionLabel.className = "stack";
  directionLabel.innerHTML = "<span>方向</span>";
  const directionSelect = document.createElement("select");
  [
    ["later", "整体延后"],
    ["earlier", "整体提前"],
  ].forEach(([value, text]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = text;
    option.selected = toolState.direction === value;
    directionSelect.appendChild(option);
  });
  directionSelect.addEventListener("change", () => {
    toolState.direction = directionSelect.value;
  });
  directionLabel.appendChild(directionSelect);

  const matchLabel = document.createElement("label");
  matchLabel.className = "stack";
  matchLabel.innerHTML = "<span>命中方式</span>";
  const matchSelect = document.createElement("select");
  [
    ["start", "开始时间落入范围"],
    ["overlap", "与范围相交"],
  ].forEach(([value, text]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = text;
    option.selected = toolState.matchMode === value;
    matchSelect.appendChild(option);
  });
  matchSelect.addEventListener("change", () => {
    toolState.matchMode = matchSelect.value;
  });
  matchLabel.appendChild(matchSelect);

  fields.append(startLabel, endField, offsetField, directionLabel, matchLabel);

  const actions = document.createElement("div");
  actions.className = "timeline-tool-actions";

  [
    ["0.10", "0.1s"],
    ["0.30", "0.3s"],
    ["0.50", "0.5s"],
    ["1.00", "1.0s"],
  ].forEach(([value, text]) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "ghost small";
    chip.textContent = text;
    chip.addEventListener("click", () => {
      toolState.offsetSeconds = value;
      offsetInput.value = value;
    });
    actions.appendChild(chip);
  });

  const applyButton = document.createElement("button");
  applyButton.type = "button";
  applyButton.className = "ghost";
  applyButton.textContent = "应用到命中事件";
  applyButton.addEventListener("click", () => applyTimelineShift(file));
  actions.appendChild(applyButton);

  tool.append(fields, actions);
}

function appendFilterReplaceToolBody(tool, file, filteredRows) {
  const filterState = getEventFilterState(file.id);
  const replaceState = getReplaceToolState(file.id);
  const section = file.parsed.events;
  const allRows = section?.rows ?? [];

  const styleOptions = Array.from(
    new Set([
      ...(file.parsed.styles?.rows ?? []).map((row) => row.data.Name).filter(Boolean),
      ...allRows.map((row) => row.data.Style).filter(Boolean),
    ])
  );

  // Filter row
  const filterFields = document.createElement("div");
  filterFields.className = "timeline-tool-fields";

  const queryField = buildTimelineField("关键词筛选", "搜索文本 / 角色 / 样式 / 特效");
  const queryInput = queryField.querySelector("input");
  queryInput.value = filterState.query;
  queryInput.addEventListener("input", () => {
    filterState.query = queryInput.value;
    state.previewPages.events.set(file.id, 0);
  });
  queryInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      renderPreview();
    }
  });

  const styleLabel = document.createElement("label");
  styleLabel.className = "stack";
  styleLabel.innerHTML = "<span>按样式筛选</span>";
  const styleSelect = document.createElement("select");
  const allStyleOpt = document.createElement("option");
  allStyleOpt.value = "";
  allStyleOpt.textContent = "全部样式";
  styleSelect.appendChild(allStyleOpt);
  styleOptions.forEach((styleName) => {
    const opt = document.createElement("option");
    opt.value = styleName;
    opt.textContent = styleName;
    opt.selected = filterState.style === styleName;
    styleSelect.appendChild(opt);
  });
  styleSelect.addEventListener("change", () => {
    filterState.style = styleSelect.value;
    setCurrentPage("events", file.id, 0);
  });
  styleLabel.appendChild(styleSelect);

  const typeLabel = document.createElement("label");
  typeLabel.className = "stack";
  typeLabel.innerHTML = "<span>按事件类型</span>";
  const typeSelect = document.createElement("select");
  [["all", "全部类型"], ...EVENT_TYPES.map((type) => [type, type])].forEach(([val, text]) => {
    const opt = document.createElement("option");
    opt.value = val;
    opt.textContent = text;
    opt.selected = filterState.eventType === val;
    typeSelect.appendChild(opt);
  });
  typeSelect.addEventListener("change", () => {
    filterState.eventType = typeSelect.value;
    setCurrentPage("events", file.id, 0);
  });
  typeLabel.appendChild(typeSelect);

  filterFields.append(queryField, styleLabel, typeLabel);

  const filterActions = document.createElement("div");
  filterActions.className = "timeline-tool-actions";
  const applyFilterBtn = document.createElement("button");
  applyFilterBtn.type = "button";
  applyFilterBtn.className = "ghost small";
  applyFilterBtn.textContent = "应用筛选";
  applyFilterBtn.addEventListener("click", () => setCurrentPage("events", file.id, 0));

  const resetFilterBtn = document.createElement("button");
  resetFilterBtn.type = "button";
  resetFilterBtn.className = "ghost small";
  resetFilterBtn.textContent = "清空筛选";
  resetFilterBtn.addEventListener("click", () => {
    filterState.query = "";
    filterState.style = "";
    filterState.eventType = "all";
    setCurrentPage("events", file.id, 0);
  });
  filterActions.append(applyFilterBtn, resetFilterBtn);

  // Batch replace row
  const replaceFields = document.createElement("div");
  replaceFields.className = "timeline-tool-fields";

  const searchField = buildTimelineField("查找内容", "输入要替换的文本或正则");
  const searchInput = searchField.querySelector("input");
  searchInput.value = replaceState.search;
  searchInput.addEventListener("input", () => {
    replaceState.search = searchInput.value;
  });

  const replaceWithField = buildTimelineField("替换为", "留空表示删除匹配内容");
  const replaceWithInput = replaceWithField.querySelector("input");
  replaceWithInput.value = replaceState.replaceWith;
  replaceWithInput.addEventListener("input", () => {
    replaceState.replaceWith = replaceWithInput.value;
  });

  const targetFieldLabel = document.createElement("label");
  targetFieldLabel.className = "stack";
  targetFieldLabel.innerHTML = "<span>替换字段</span>";
  const targetFieldSelect = document.createElement("select");
  const format = section.format.length ? section.format : DEFAULT_EVENT_FORMAT;
  const candidateFields = ["Text", "Style", format.includes("Actor") ? "Actor" : "Name", "Effect"].filter(
    (name, idx, arr) => format.includes(name) && arr.indexOf(name) === idx
  );
  if (!candidateFields.includes(replaceState.field) && candidateFields.length) {
    replaceState.field = candidateFields[0];
  }
  candidateFields.forEach((fieldName) => {
    const opt = document.createElement("option");
    opt.value = fieldName;
    opt.textContent = fieldName;
    opt.selected = replaceState.field === fieldName;
    targetFieldSelect.appendChild(opt);
  });
  targetFieldSelect.addEventListener("change", () => {
    replaceState.field = targetFieldSelect.value;
  });
  targetFieldLabel.appendChild(targetFieldSelect);

  replaceFields.append(searchField, replaceWithField, targetFieldLabel);

  const replaceActions = document.createElement("div");
  replaceActions.className = "timeline-tool-actions";

  [
    ["caseSensitive", "区分大小写"],
    ["useRegex", "正则模式"],
    ["filteredOnly", "仅作用于筛选命中行"],
  ].forEach(([prop, text]) => {
    const label = document.createElement("label");
    label.className = "toolbox-checkbox";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = replaceState[prop];
    cb.addEventListener("change", () => {
      replaceState[prop] = cb.checked;
    });
    const span = document.createElement("span");
    span.textContent = text;
    label.append(cb, span);
    replaceActions.appendChild(label);
  });

  const previewReplaceBtn = document.createElement("button");
  previewReplaceBtn.type = "button";
  previewReplaceBtn.className = "ghost small";
  previewReplaceBtn.textContent = "统计命中";
  previewReplaceBtn.addEventListener("click", () => {
    runBatchReplace(file, filteredRows, true);
  });

  const execReplaceBtn = document.createElement("button");
  execReplaceBtn.type = "button";
  execReplaceBtn.className = "ghost";
  execReplaceBtn.textContent = "执行批量替换";
  execReplaceBtn.addEventListener("click", () => {
    runBatchReplace(file, filteredRows, false);
  });

  replaceActions.append(previewReplaceBtn, execReplaceBtn);
  tool.append(filterFields, filterActions, replaceFields, replaceActions);
}

function runBatchReplace(file, filteredRows, dryRun) {
  flushPendingSync(file);
  const replaceState = getReplaceToolState(file.id);
  const section = file.parsed.events;
  if (!section?.rows?.length) {
    showToast("当前文件没有可替换的事件。");
    return;
  }
  if (!replaceState.search) {
    showToast("请输入查找内容。");
    return;
  }

  const targetRows = replaceState.filteredOnly ? filteredRows : section.rows;
  const format = section.format.length ? section.format : DEFAULT_EVENT_FORMAT;
  const isLastField = replaceState.field === format[format.length - 1];

  try {
    if (dryRun) {
      const stats = batchReplaceEvents(targetRows, { ...replaceState, dryRun: true, isLastField });
      showToast(
        stats.replacementsCount
          ? `共命中 ${stats.matchedRows} 行，预计替换 ${stats.replacementsCount} 处。`
          : "没有命中可替换的内容。"
      );
      return;
    }

    const beforeText = file.outputText;
    const stats = batchReplaceEvents(targetRows, { ...replaceState, dryRun: false, isLastField });
    if (!stats.replacementsCount) {
      showToast("没有命中可替换的内容。");
      return;
    }

    pushUndoSnapshot(file.id, beforeText, `批量替换 ${replaceState.field}`);
    syncFileOutput(file);
    renderPreview();
    showToast(`已完成批量替换：共修改 ${stats.matchedRows} 行（${stats.replacementsCount} 处）。`);
  } catch (error) {
    showToast(`正则表达式无效: ${error.message}`);
  }
}

function buildTimelineField(labelText, placeholder) {
  const label = document.createElement("label");
  label.className = "stack";
  const title = document.createElement("span");
  title.textContent = labelText;
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = placeholder;
  label.append(title, input);
  return label;
}

// Table layout and interaction helpers
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

  if (key === "rowactions") return { width: 132, kind: "action" };

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

function updateAllScrollableTableStates() {
  if (!els?.previewContent) return;
  els.previewContent.querySelectorAll(".editor-table-wrap").forEach((wrap) => updateScrollableTableState(wrap));
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
  left.className = "pager-actions";
  const prev = document.createElement("button");
  prev.type = "button";
  prev.className = "ghost small";
  prev.textContent = "上一页";
  prev.disabled = page <= 0;
  prev.addEventListener("click", () => onPageChange(page - 1));
  const next = document.createElement("button");
  next.type = "button";
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

function clampPage(kind, fileId, totalPages) {
  const clamped = Math.max(0, Math.min(getCurrentPage(kind, fileId), totalPages - 1));
  state.previewPages[kind].set(fileId, clamped);
  return clamped;
}

function setCurrentPage(kind, fileId, page) {
  state.previewPages[kind].set(fileId, Math.max(0, page));
  renderPreview();
}

// Synchronization between structured state and export text
function scheduleSyncFileOutput(file) {
  if (!file) return;
  file.isDirty = true;
  const existingTimer = state.pendingSyncTimers.get(file.id);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }
  const timerId = setTimeout(() => {
    state.pendingSyncTimers.delete(file.id);
    syncFileOutput(file);
  }, SYNC_DEBOUNCE_MS);
  state.pendingSyncTimers.set(file.id, timerId);
}

function flushPendingSync(targetFile = null) {
  if (targetFile) {
    const timer = state.pendingSyncTimers.get(targetFile.id);
    if (timer) {
      clearTimeout(timer);
      state.pendingSyncTimers.delete(targetFile.id);
      syncFileOutput(targetFile);
    }
    return;
  }

  for (const [fileId, timer] of state.pendingSyncTimers.entries()) {
    clearTimeout(timer);
    state.pendingSyncTimers.delete(fileId);
    const file = state.files.find((item) => item.id === fileId);
    if (file) {
      syncFileOutput(file);
    }
  }
}

function syncFileOutput(file) {
  // Every structured edit eventually flows through this function so preview,
  // raw editor and download output remain synchronized.
  file.outputText = stringifyAss(file.parsed);
  file.isDirty = file.outputText !== file.originalText;
  file.stats = summarizeParsedAss(file.parsed, file.outputText);
  if (state.previewMode === "raw" && file.id === state.activeFileId) {
    els.rawEditor.value = file.outputText;
    setRawDirty(false);
  }
  if (els) {
    if (file.id === state.activeFileId && state.previewMode === "visual") {
      updatePreviewSummary(file);
    }
    renderResults();
    updateHistoryButtons();
  }
}

function saveRawEditorChanges() {
  const file = getActiveFile();
  if (!file) {
    showToast("请先选一个活动文件。");
    return;
  }
  try {
    const beforeText = file.outputText;
    const rawValue = els.rawEditor.value;
    const nextParsed = parseAss(rawValue);
    if (beforeText !== rawValue) {
      pushUndoSnapshot(file.id, beforeText, "原文编辑");
    }
    file.parsed = nextParsed;
    file.outputText = rawValue;
    file.isDirty = file.outputText !== file.originalText;
    file.stats = summarizeParsedAss(file.parsed, file.outputText);
    setRawDirty(false);
    renderFiles();
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
    return `${sanitizeSingleLineField(entry.key)}: ${sanitizeSingleLineField(entry.value)}`;
  });
}

function stringifyRowFields(format, rowData, { lastFieldMultilineToAss = false } = {}) {
  return format
    .map((field, index) => {
      const raw = rowData?.[field] ?? "";
      const isLast = index === format.length - 1;
      if (isLast) {
        return lastFieldMultilineToAss ? sanitizeEventLastField(raw) : sanitizeSingleLineField(raw);
      }
      return sanitizeSingleLineField(raw, { disallowComma: true });
    })
    .join(",");
}

function stringifyStylesSection(section) {
  if (!section) return [];
  const lines = [];
  const format = section.format.length ? section.format : [];
  if (format.length) lines.push(`Format: ${format.join(", ")}`);

  if (Array.isArray(section.items) && section.items.length) {
    section.items.forEach((item) => {
      if (item.kind === "row") {
        lines.push(`Style: ${stringifyRowFields(format, item.row.data)}`);
      } else {
        lines.push(item.raw ?? "");
      }
    });
    return lines;
  }

  section.rows.forEach((row) => {
    lines.push(`Style: ${stringifyRowFields(format, row.data)}`);
  });
  (section.extras ?? []).forEach((item) => lines.push(item.raw ?? ""));
  return lines;
}

function stringifyEventsSection(section) {
  if (!section) return [];
  const lines = [];
  const format = section.format.length ? section.format : [];
  if (format.length) lines.push(`Format: ${format.join(", ")}`);

  if (Array.isArray(section.items) && section.items.length) {
    section.items.forEach((item) => {
      if (item.kind === "row") {
        lines.push(`${item.row.eventType}: ${stringifyRowFields(format, item.row.data, { lastFieldMultilineToAss: true })}`);
      } else {
        lines.push(item.raw ?? "");
      }
    });
    return lines;
  }

  section.rows.forEach((row) => {
    lines.push(`${row.eventType}: ${stringifyRowFields(format, row.data, { lastFieldMultilineToAss: true })}`);
  });
  (section.extras ?? []).forEach((item) => lines.push(item.raw ?? ""));
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

// Export and download
function renderResults() {
  els.resultList.innerHTML = "";
  const selected = state.files.filter((file) => file.selected);
  if (!selected.length) {
    state.resultPage = 0;
    els.resultList.className = "result-list empty-state";
    els.resultList.innerHTML = "<p>勾选文件后，这里会列出下载项。</p>";
    return;
  }

  const pageSize = getResultPageSize();
  const totalPages = Math.max(1, Math.ceil(selected.length / pageSize));
  const currentPage = Math.min(state.resultPage, totalPages - 1);
  const visibleFiles = selected.slice(currentPage * pageSize, currentPage * pageSize + pageSize);

  state.resultPage = currentPage;
  els.resultList.className = "result-list";
  const itemsWrap = document.createElement("div");
  itemsWrap.className = "result-items";

  visibleFiles.forEach((file) => {
    const card = document.createElement("article");
    card.className = "result-card";
    const header = document.createElement("header");
    const title = document.createElement("strong");
    title.textContent = file.outputName;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "small";
    button.textContent = "下载";
    button.addEventListener("click", () => downloadFile(file));
    header.append(title, button);

    const meta = document.createElement("div");
    meta.className = "result-meta";
    meta.textContent = `${formatBytes(file.stats.bytes)} · ${file.stats.styleCount} styles · ${file.stats.eventCount} events`;
    card.append(header, meta);
    itemsWrap.appendChild(card);
  });

  els.resultList.appendChild(itemsWrap);

  if (totalPages > 1) {
    els.resultList.appendChild(
      buildPager(currentPage, totalPages, (nextPage) => {
        state.resultPage = nextPage;
        renderResults();
      })
    );
  }
}

function getResultPageSize() {
  const fallbackPageSize = window.matchMedia("(max-width: 760px)").matches ? RESULT_PAGE_SIZE_MOBILE : RESULT_PAGE_SIZE_DESKTOP;
  const listHeight = els.resultList.getBoundingClientRect().height;
  if (listHeight <= 0) {
    return fallbackPageSize;
  }

  const estimatedPagerHeight = 42;
  const estimatedCardHeight = window.matchMedia("(max-width: 760px)").matches ? 96 : 88;
  const availableHeight = Math.max(estimatedCardHeight, listHeight - estimatedPagerHeight);
  const fitCount = Math.floor((availableHeight + 10) / (estimatedCardHeight + 10));
  return Math.max(1, Math.min(fallbackPageSize, fitCount || 1));
}

function downloadSelectedFiles() {
  if (state.rawDirty && !confirmDiscardRawEdits()) {
    return;
  }
  flushPendingSync();
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
  if (file.id === state.activeFileId && state.rawDirty && !confirmDiscardRawEdits()) {
    return;
  }
  flushPendingSync(file);
  const blob = new Blob([file.outputText], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.outputName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadZipForSelected() {
  if (state.rawDirty && !confirmDiscardRawEdits()) {
    return;
  }
  flushPendingSync();
  const files = state.files.filter((file) => file.selected);
  if (!files.length) {
    showToast("请先勾选文件。");
    return;
  }

  const zipBlob = createZipBlob(
    files.map((file) => ({
      name: file.outputName,
      data: utf8Encoder.encode(file.outputText),
    }))
  );
  const url = URL.createObjectURL(zipBlob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `ass-subtitle-studio-${Date.now()}.zip`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function createZipBlob(entries) {
  const localFiles = [];
  const centralDirectory = [];
  let offset = 0;
  // Setting the UTF-8 flag keeps non-ASCII subtitle file names readable after
  // extraction on mainstream archive tools.
  const utf8Flag = 0x0800;

  entries.forEach((entry) => {
    const nameBytes = utf8Encoder.encode(entry.name);
    const data = entry.data instanceof Uint8Array ? entry.data : new Uint8Array(entry.data);
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

function buildCrc32Table() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let j = 0; j < 8; j += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
}

function crc32(bytes) {
  // ZIP requires CRC32 in both local headers and central directory records.
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Misc utilities
function generateId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
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
  toast.className = "app-toast";
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("is-visible"));
  activeToast = toast;
  setTimeout(() => {
    if (activeToast === toast) {
      activeToast = null;
    }
    toast.classList.remove("is-visible");
    window.setTimeout(() => toast.remove(), UI_ANIMATION_DURATION);
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

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    EVENT_TYPES,
    DEFAULT_STYLE_FORMAT,
    DEFAULT_EVENT_FORMAT,
    state,
    generateId,
    detectBomEncoding,
    decodeAssBuffer,
    parseAss,
    stringifyAss,
    splitAssFields,
    sanitizeSingleLineField,
    sanitizeEventLastField,
    insertSectionRow,
    removeSectionRow,
    createDefaultStyleRow,
    createDefaultEventRow,
    parseFlexibleTimeToCentiseconds,
    parseAssTimestamp,
    formatAssTimestamp,
    shiftEventsTimeline,
    filterEventRows,
    batchReplaceEvents,
    pushUndoSnapshot,
    summarizeParsedAss,
    createZipBlob,
    crc32,
    normalizeAssFileName,
    formatBytes,
    escapeHtml,
  };
}
