const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const outputDir = path.join(rootDir, "dist");

const indexPath = path.join(rootDir, "index.html");
const stylesPath = path.join(rootDir, "styles.css");
const scriptPath = path.join(rootDir, "app.js");

const indexHtml = fs.readFileSync(indexPath, "utf8");
const stylesCss = fs.readFileSync(stylesPath, "utf8");
const appJs = fs.readFileSync(scriptPath, "utf8");

const inlinedCss = `<style>\n${stylesCss}\n</style>`;
const safeScript = appJs.replace(/<\/script/gi, "<\\/script");
const inlinedJs = `<script>\n${safeScript}\n</script>`;

const stylesheetPattern = /<link\s+rel="stylesheet"\s+href="\.\/styles\.css"\s*\/?>/;
const scriptPattern = /<script\s+src="\.\/app\.js"\s+defer><\/script>/;

if (!stylesheetPattern.test(indexHtml)) {
  throw new Error("未找到 styles.css 的引用标签，请检查 index.html。");
}

if (!scriptPattern.test(indexHtml)) {
  throw new Error("未找到 app.js 的引用标签，请检查 index.html。");
}

let mergedHtml = indexHtml.replace(stylesheetPattern, inlinedCss);
mergedHtml = mergedHtml.replace(scriptPattern, inlinedJs);

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(
  path.join(outputDir, "ass-subtitle-studio-single-file.html"),
  mergedHtml,
  "utf8"
);
