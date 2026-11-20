const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { buildSingleFileHtml } = require("../scripts/build-single-file.js");

test("buildSingleFileHtml preserves dollar replacement patterns literally", () => {
  const html = '<!doctype html><html><head><link rel="stylesheet" href="./styles.css" /></head><body><script src="./app.js" defer></script></body></html>';
  const css = "body::after { content: '$$ $& $1'; }";
  const js = 'const s = "price $$ $& $1 $\' $` </script>";';

  const result = buildSingleFileHtml(html, css, js);

  assert.ok(result.includes("content: '$$ $& $1';"));
  assert.ok(result.includes('const s = "price $$ $& $1 $\' $` <\\/script>";'));
  assert.ok(!result.includes("./styles.css"));
  assert.ok(!result.includes("./app.js"));
});

test("buildSingleFileHtml escapes </style> inside CSS", () => {
  const html = '<link rel="stylesheet" href="./styles.css" /><script src="./app.js" defer></script>';
  const result = buildSingleFileHtml(html, "/* </style> */", "console.log(1);");
  assert.ok(result.includes("/* <\\/style> */"));
});

test("buildSingleFileHtml throws when asset tags are missing", () => {
  assert.throws(() => buildSingleFileHtml("<html></html>", "", ""), /styles\.css/);
  assert.throws(
    () => buildSingleFileHtml('<link rel="stylesheet" href="./styles.css" />', "", ""),
    /app\.js/
  );
});

test("buildSingleFileHtml succeeds on real repository files", () => {
  const rootDir = path.resolve(__dirname, "..");
  const indexHtml = fs.readFileSync(path.join(rootDir, "index.html"), "utf8");
  const stylesCss = fs.readFileSync(path.join(rootDir, "styles.css"), "utf8");
  const appJs = fs.readFileSync(path.join(rootDir, "app.js"), "utf8");

  const merged = buildSingleFileHtml(indexHtml, stylesCss, appJs);
  assert.ok(merged.includes("<style>"));
  assert.ok(merged.includes("<script>"));
  assert.ok(!merged.includes('<link rel="stylesheet" href="./styles.css"'));
  assert.ok(!merged.includes('<script src="./app.js" defer></script>'));
});
