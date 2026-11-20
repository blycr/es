const test = require("node:test");
const assert = require("node:assert/strict");

const {
  EVENT_TYPES,
  detectBomEncoding,
  decodeAssBuffer,
  parseAss,
  stringifyAss,
  splitAssFields,
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
  state,
  createZipBlob,
  crc32,
  normalizeAssFileName,
  formatBytes,
  escapeHtml,
  generateId,
} = require("../app.js");

const SAMPLE_ASS = [
  "\uFEFF; Leading comment",
  "[Script Info]  ",
  "Title: Demo Subtitle",
  "; Keep info comment",
  "PlayResX: 1920",
  "",
  "[V4+ Styles]",
  "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
  "; Default dialogue style",
  "Style: Default,Noto Sans SC,48,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,1,2,20,20,24,1",
  "",
  "[Events]",
  "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  "; Opening line",
  "Dialogue: 0,0:00:01.00,0:00:03.50,Default,Alice,0,0,0,,Hello, world!",
  "comment: 0,0:00:04.00,0:00:05.00,Default,,0,0,0,,Translator note",
  "Picture: 0,0:00:06.00,0:00:07.00,Default,,0,0,0,,poster.png",
  "",
  "[Custom Extra]",
  "Foo=Bar",
].join("\r\n");

test("parseAss and stringifyAss preserve section order, interleaved comments, all event types, and commas in Text", () => {
  const parsed = parseAss(SAMPLE_ASS);

  assert.equal(parsed.scriptInfo.entries.filter((e) => e.type === "kv").length, 2);
  assert.equal(parsed.styles.format.length, 23);
  assert.equal(parsed.styles.rows.length, 1);
  assert.equal(parsed.events.rows.length, 3);
  assert.equal(parsed.events.rows[0].data.Text, "Hello, world!");
  assert.equal(parsed.events.rows[1].eventType, "Comment");
  assert.equal(parsed.events.rows[2].eventType, "Picture");

  const output = stringifyAss(parsed);
  const lines = output.split("\r\n");

  // BOM is stripped, trailing space on [Script Info] normalized
  assert.equal(lines[0], "; Leading comment");
  assert.equal(lines[1], "[Script Info]");

  // Comment inside [V4+ Styles] stays before Style: Default
  const styleCommentIdx = lines.indexOf("; Default dialogue style");
  const styleRowIdx = lines.findIndex((l) => l.startsWith("Style: Default,"));
  assert.ok(styleCommentIdx > 0 && styleCommentIdx < styleRowIdx);

  // Comment inside [Events] stays before Dialogue: 0,...
  const eventCommentIdx = lines.indexOf("; Opening line");
  const dialogueIdx = lines.findIndex((l) => l.startsWith("Dialogue: 0,"));
  assert.ok(eventCommentIdx > 0 && eventCommentIdx < dialogueIdx);

  // Unknown section is preserved verbatim
  assert.ok(lines.includes("[Custom Extra]"));
  assert.ok(lines.includes("Foo=Bar"));

  // All 6 ASS event types are recognized
  assert.deepEqual(EVENT_TYPES, ["Dialogue", "Comment", "Picture", "Sound", "Movie", "Command"]);
});

test("stringifyAss sanitizes newlines in Text to \\N and commas in non-final fields", () => {
  const parsed = parseAss(SAMPLE_ASS);
  parsed.events.rows[0].data.Name = "Alice, Bob";
  parsed.events.rows[0].data.Text = "Line 1\nLine 2\r\nLine 3";

  const reparsed = parseAss(stringifyAss(parsed));
  assert.equal(reparsed.events.rows[0].data.Name, "Alice; Bob");
  assert.equal(reparsed.events.rows[0].data.Text, "Line 1\\NLine 2\\NLine 3");
});

test("splitAssFields splits only count - 1 commas and pads missing fields", () => {
  assert.deepEqual(splitAssFields("a, b, c, d, e", 4), ["a", "b", "c", "d, e"]);
  assert.deepEqual(splitAssFields("only,two", 4), ["only", "two", "", ""]);
});

test("insertSectionRow and removeSectionRow keep rows and items synchronized", () => {
  const parsed = parseAss(SAMPLE_ASS);
  const firstEvent = parsed.events.rows[0];
  const inserted = createDefaultEventRow(parsed.events.format, firstEvent);
  inserted.data.Text = "Inserted";

  insertSectionRow(parsed.events, inserted, firstEvent);
  assert.equal(parsed.events.rows.length, 4);
  assert.equal(parsed.events.rows[1].data.Text, "Inserted");

  const output = stringifyAss(parsed);
  assert.ok(output.includes("Inserted"));

  removeSectionRow(parsed.events, inserted);
  assert.equal(parsed.events.rows.length, 3);
  assert.ok(!stringifyAss(parsed).includes("Inserted"));

  const newStyle = createDefaultStyleRow(parsed.styles.format);
  insertSectionRow(parsed.styles, newStyle);
  assert.equal(parsed.styles.rows.length, 2);
});

test("timeline parsing and shiftEventsTimeline handle ranges, overlap, and clamping at 0", () => {
  assert.equal(parseFlexibleTimeToCentiseconds("00.01.50"), 150);
  assert.equal(parseFlexibleTimeToCentiseconds("0:01:02.50"), 6250);
  assert.equal(parseFlexibleTimeToCentiseconds("1.25"), 125);
  assert.equal(parseAssTimestamp("1:02:03.45"), 372345);
  assert.equal(formatAssTimestamp(372345), "1:02:03.45");

  const parsed = parseAss(SAMPLE_ASS);
  const res = shiftEventsTimeline(parsed.events, {
    rangeStart: "0:00:00.00",
    rangeEnd: "0:00:04.00",
    offsetSeconds: "2.00",
    direction: "earlier",
    matchMode: "start",
  });

  assert.equal(res.ok, true);
  assert.equal(res.affectedCount, 2);
  assert.equal(res.clampedCount, 1);
  // 1.00 - 2.00 -> clamped to 0.00, duration 2.50 preserved
  assert.equal(parsed.events.rows[0].data.Start, "0:00:00.00");
  assert.equal(parsed.events.rows[0].data.End, "0:00:02.50");
  // 4.00 - 2.00 -> 2.00, duration 1.00 preserved
  assert.equal(parsed.events.rows[1].data.Start, "0:00:02.00");
  assert.equal(parsed.events.rows[1].data.End, "0:00:03.00");
  // Picture at 6.00 untouched
  assert.equal(parsed.events.rows[2].data.Start, "0:00:06.00");

  // Overlap mode matches only event [0:00:02.00, 0:00:03.00] when range is [0:00:02.60, 0:00:02.80]
  const overlapRes = shiftEventsTimeline(parsed.events, {
    rangeStart: "0:00:02.60",
    rangeEnd: "0:00:02.80",
    offsetSeconds: "0.50",
    direction: "later",
    matchMode: "overlap",
  });
  assert.equal(overlapRes.ok, true);
  assert.equal(overlapRes.affectedCount, 1);
  assert.equal(parsed.events.rows[1].data.Start, "0:00:02.50");
  assert.equal(parsed.events.rows[1].data.End, "0:00:03.50");
});

test("filterEventRows and batchReplaceEvents support filtering, dryRun, and regex replacement", () => {
  const parsed = parseAss(SAMPLE_ASS);
  const filtered = filterEventRows(parsed.events.rows, {
    query: "hello",
    style: "Default",
    eventType: "Dialogue",
  });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].data.Name, "Alice");

  const dry = batchReplaceEvents(parsed.events.rows, {
    search: "hello",
    replaceWith: "Hi",
    field: "Text",
    caseSensitive: false,
    useRegex: false,
    dryRun: true,
    isLastField: true,
  });
  assert.equal(dry.matchedRows, 1);
  assert.equal(dry.replacementsCount, 1);
  assert.equal(parsed.events.rows[0].data.Text, "Hello, world!");

  const applied = batchReplaceEvents(parsed.events.rows, {
    search: "\\bHello\\b",
    replaceWith: "Hi\nThere",
    field: "Text",
    caseSensitive: true,
    useRegex: true,
    dryRun: false,
    isLastField: true,
  });
  assert.equal(applied.matchedRows, 1);
  assert.equal(parsed.events.rows[0].data.Text, "Hi\\NThere, world!");
});

test("detectBomEncoding and decodeAssBuffer detect BOM and replacement characters", () => {
  assert.equal(detectBomEncoding(new Uint8Array([0xef, 0xbb, 0xbf, 0x5b])), "utf-8");
  assert.equal(detectBomEncoding(new Uint8Array([0xff, 0xfe, 0x5b, 0x00])), "utf-16le");
  assert.equal(detectBomEncoding(new Uint8Array([0xfe, 0xff, 0x00, 0x5b])), "utf-16be");
  assert.equal(detectBomEncoding(new Uint8Array([0x5b, 0x53])), null);

  // UTF-16LE BOM auto-detected even if requestedEncoding is utf-8
  const utf16leBytes = new Uint8Array([0xff, 0xfe, 0x5b, 0x00, 0x53, 0x00, 0x5d, 0x00]);
  const decoded = decodeAssBuffer(utf16leBytes, "utf-8", { respectBom: true });
  assert.equal(decoded.encoding, "utf-16le");
  assert.equal(decoded.text, "[S]");
  assert.equal(decoded.hasDecodeWarning, false);

  // Invalid UTF-8 byte sequence sets hasDecodeWarning
  const invalidUtf8 = new Uint8Array([0xff, 0x80, 0x81]);
  const warned = decodeAssBuffer(invalidUtf8, "utf-8", { respectBom: false });
  assert.equal(warned.hasDecodeWarning, true);
});

test("crc32 and createZipBlob produce valid ZIP structure with UTF-8 filenames", async () => {
  const data = new TextEncoder().encode("123456789");
  assert.equal(crc32(data), 0xcbf43926);

  const blob = createZipBlob([
    { name: "测试字幕.ass", data: new TextEncoder().encode("[Script Info]\r\nTitle: 测试") },
  ]);
  const buf = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(buf.buffer);

  // Local file header signature PK\x03\x04 + UTF-8 flag 0x0800
  assert.equal(view.getUint32(0, true), 0x04034b50);
  assert.equal(view.getUint16(6, true), 0x0800);

  // End of central directory signature PK\x05\x06 at tail
  const eocdOffset = buf.length - 22;
  assert.equal(view.getUint32(eocdOffset, true), 0x06054b50);
  assert.equal(view.getUint16(eocdOffset + 8, true), 1);
  assert.equal(view.getUint16(eocdOffset + 10, true), 1);
});

test("pushUndoSnapshot deduplicates and caps history stack", () => {
  const fileId = "test-history-id";
  state.undoStacks.delete(fileId);
  state.redoStacks.delete(fileId);

  pushUndoSnapshot(fileId, "A", "edit 1");
  pushUndoSnapshot(fileId, "A", "duplicate");
  assert.equal(state.undoStacks.get(fileId).length, 1);

  for (let i = 0; i < 40; i += 1) {
    pushUndoSnapshot(fileId, `state-${i}`, `step-${i}`);
  }
  assert.equal(state.undoStacks.get(fileId).length, 30);

  state.undoStacks.delete(fileId);
  state.redoStacks.delete(fileId);
});

test("misc helpers normalize filenames, format bytes, escape html, and generate unique ids", () => {
  assert.equal(normalizeAssFileName("ep01:test?", "fallback.ass"), "ep01_test_.ass");
  assert.equal(normalizeAssFileName("episode.ASS", "fallback.ass"), "episode.ASS");
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(1536), "1.5 KB");
  assert.equal(escapeHtml('<a "b"&>'), "&lt;a &quot;b&quot;&amp;&gt;");
  assert.notEqual(generateId(), generateId());
});
