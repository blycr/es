const fs = require("fs");
const path = require("path");

function buildSingleFileHtml(indexHtml, stylesCss, appJs) {
  // Escape closing tags inside inlined blocks so embedded CSS/JS cannot break out
  // of <style> or <script> tags in the generated single-file HTML.
  const safeCss = stylesCss.replace(/<\/style/gi, "<\\/style");
  const safeScript = appJs.replace(/<\/script/gi, "<\\/script");
  const inlinedCss = `<style>\n${safeCss}\n</style>`;
  const inlinedJs = `<script>\n${safeScript}\n</script>`;

  const stylesheetPattern = /<link\s+rel="stylesheet"\s+href="\.\/styles\.css"\s*\/?>/;
  const scriptPattern = /<script\s+src="\.\/app\.js"\s+defer><\/script>/;

  if (!stylesheetPattern.test(indexHtml)) {
    throw new Error("未找到 styles.css 的引用标签，请检查 index.html。");
  }

  if (!scriptPattern.test(indexHtml)) {
    throw new Error("未找到 app.js 的引用标签，请检查 index.html。");
  }

  // Use replacer functions so literal `$&`, `$1`, `$$`, etc. in CSS/JS are never
  // interpreted as String.prototype.replace backreferences.
  let mergedHtml = indexHtml.replace(stylesheetPattern, () => inlinedCss);
  mergedHtml = mergedHtml.replace(scriptPattern, () => inlinedJs);
  return mergedHtml;
}

function runBuild(rootDir = path.resolve(__dirname, "..")) {
  const outputDir = path.join(rootDir, "dist");
  const indexHtml = fs.readFileSync(path.join(rootDir, "index.html"), "utf8");
  const stylesCss = fs.readFileSync(path.join(rootDir, "styles.css"), "utf8");
  const appJs = fs.readFileSync(path.join(rootDir, "app.js"), "utf8");

  const mergedHtml = buildSingleFileHtml(indexHtml, stylesCss, appJs);
  const outputPath = path.join(outputDir, "ass-subtitle-studio-single-file.html");

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputPath, mergedHtml, "utf8");
  return outputPath;
}

if (require.main === module) {
  runBuild();
}

module.exports = {
  buildSingleFileHtml,
  runBuild,
};
