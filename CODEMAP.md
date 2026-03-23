# 代码地图

## 文档定位

本文档用于为维护者、贡献者和后续功能扩展提供一份工程视角的代码地图。重点不在于复述界面功能，而在于说明项目的结构边界、运行时数据流、关键模块职责、发布链路和改动影响范围。

适用读者：

- 首次接手本仓库的维护者
- 需要定位问题或新增功能的开发者
- 需要理解发布、部署和构建链路的仓库管理员

## 文档分层

当前仓库的工程文档分成三层：

- [README.md](./README.md)
  面向使用者，说明当前可用能力和使用方式
- [CODEMAP.md](./CODEMAP.md)
  面向维护者，说明系统结构、数据流和模块边界
- [FUNCTION_MAP.md](./FUNCTION_MAP.md)
  面向开发者，说明函数职责、调用关系与改动入口
- [ROADMAP.md](./ROADMAP.md)
  面向规划阶段，说明中长期路线和未实现能力

`TODO.md` 现仅保留为兼容入口，用于指向正式路线图文档。

## 项目定位

本项目是一个本地优先、无后端依赖的 ASS 字幕编辑工具。

核心特点：

- 纯前端实现，默认通过 `file://` 或静态托管运行
- 不依赖框架，主逻辑集中在原生 JavaScript 中
- 以结构化解析 `Script Info`、`Aegisub Project Garbage`、`V4+ Styles`、`Events`
- 同时支持可视化编辑和原文编辑
- 支持单文件导出、ZIP 导出，以及 Release 单文件 HTML 构建

从工程角度看，这是一个“单页面 + 单主逻辑文件 + 单样式文件 + 少量仓库自动化脚本”的轻量项目。

## 仓库结构

### 运行时核心文件

- `index.html`
  页面骨架、主要挂载点、模板节点和资源引用入口
- `styles.css`
  全局主题、布局、组件样式、响应式规则和交互动效
- `app.js`
  应用主逻辑，包含状态管理、事件绑定、字幕解析、预览构建、导出和辅助工具

### 构建与发布

- `scripts/build-single-file.js`
  将 `index.html`、`styles.css`、`app.js` 合并为单文件 HTML，用于 Release 附件
- `.github/workflows/pages.yml`
  GitHub Pages 自动部署工作流
- `.github/workflows/release.yml`
  GitHub Release 自动发布工作流

### 仓库文档

- `README.md`
  仓库首页和使用说明
- `CONTRIBUTING.md`
  贡献和维护约束
- `CHANGELOG.md`
  变更记录
- `FUNCTION_MAP.md`
  函数职责、调用关系与改动入口
- `ROADMAP.md`
  已形成方向但尚未实现的路线规划
- `TODO.md`
  兼容入口，避免旧链接失效
- `SECURITY.md`
  安全问题反馈方式
- `CODE_OF_CONDUCT.md`
  协作行为准则

### 运行时之外的本地文件

- 根目录中的示例 `.ass` 文件仅用于本地测试，已通过 `.gitignore` 排除
- `dist/` 为构建产物目录，不纳入版本控制

## 高层架构

项目采用典型的静态前端三层结构：

1. `index.html` 提供结构和挂载点
2. `styles.css` 提供布局、主题和交互表现
3. `app.js` 提供状态、行为、解析、序列化与导出逻辑

应用没有引入框架，因此不存在组件树、虚拟 DOM 或外部状态库。页面刷新与局部更新通过手写渲染函数完成。

## 系统边界

### 明确包含在系统内的部分

- 本地文件读取与解码
- ASS 结构解析与回写
- 可视化编辑与原文编辑
- 前端侧的文件下载与 ZIP 构造
- GitHub Pages 与 Release 发布自动化

### 明确不包含在系统内的部分

- 后端服务
- 数据库存储
- 服务端字幕解析
- 在线协同编辑
- 运行时外部 AI 调用

这也是为什么仓库当前可以保持纯静态部署。

## 运行环境与依赖约束

### 浏览器运行时

- 原生 DOM API
- `TextDecoder`
- `TextEncoder`
- `Blob`
- `URL.createObjectURL`
- `localStorage`
- `sessionStorage`
- `ResizeObserver`

### 构建与仓库自动化

- Node.js
  用于执行 `scripts/build-single-file.js`
- GitHub Actions
  用于 Pages 与 Release 自动化

### 工程约束

- 不依赖前端框架
- 不依赖打包器作为日常运行前提
- 默认保留 `file://` 兼容性
- 发布流程尽量保持轻量和可读

### 架构特点

- 优点
  - 依赖少，部署和离线使用成本低
  - 运行链路短，调试门槛低
  - 与 `file://` 兼容性较好
- 代价
  - `app.js` 体量较大，功能聚合度高
  - 状态和视图更新依赖手工维护边界
  - 没有模块系统，后续扩展时更需要文档和命名纪律

## 页面结构地图

`index.html` 中最核心的区域有四个：

- `hero-card`
  左上信息与下载区，承载主题切换、下载按钮和导出结果列表
- `upload-panel`
  左下导入区，负责文件上传、重解码、批量移除和文件列表
- `hero-copy`
  右上项目说明区
- `preview-panel`
  右下编辑主区，负责文件切换、可视化编辑与原文编辑

此外还有三条可拖拽分隔条：

- 左右主工作区宽度分隔
- 左列上下区域高度分隔
- 右列上下区域高度分隔

这些分隔条由 CSS 自定义属性驱动布局，并由 `app.js` 在拖拽时更新对应尺寸值。

## 启动链路

应用的初始化链路比较直接：

1. 页面加载 `index.html`
2. 浏览器加载 `styles.css`
3. 浏览器以 `defer` 方式执行 `app.js`
4. `app.js` 顶部初始化静态常量、全局状态和关键 DOM 引用
5. 依次调用：
   - `bindEvents()`
   - `initializeTheme()`
   - `initializeLayout()`
   - `initDropzone()`
   - `initializeDropzoneHint()`
   - `renderApp()`

这个顺序很重要：

- 先绑定事件，确保后续交互可用
- 再恢复主题和布局，避免首帧闪烁
- 最后统一渲染初始界面

## 状态模型

全局运行时状态集中在 `state` 对象中。

### 顶层字段

- `files`
  当前导入的字幕文件集合
- `activeFileId`
  当前活动文件
- `decodeEncoding`
  当前导入/重解码编码
- `previewMode`
  当前预览模式，取值为 `visual` 或 `raw`
- `previewPages`
  表格分页状态，分为 `styles` 和 `events`
- `timelineTools`
  每个文件的时轴快调工具状态
- `resultPage`
  左上结果列表分页状态

### 单文件对象结构

每个文件对象大致包含：

- `id`
  前端内部唯一标识
- `name`
  原始文件名
- `outputName`
  导出文件名
- `encoding`
  当前解码编码
- `originalFile`
  浏览器 `File` 对象
- `originalText`
  首次解码得到的原始文本
- `parsed`
  解析后的 ASS 结构对象
- `outputText`
  当前导出的完整字幕文本
- `selected`
  是否被勾选，用于删除、下载和 ZIP 导出
- `stats`
  统计信息摘要

### ASS 解析结果结构

`parseAss()` 返回的结果包含：

- `lineCount`
  总行数
- `sections`
  原始分段结构，保留 section 顺序
- `scriptInfo`
  `Script Info` 的键值条目结构
- `aegisubGarbage`
  `Aegisub Project Garbage` 的键值条目结构
- `styles`
  `V4+ Styles` 的 `format + rows + extras`
- `events`
  `Events` 的 `format + rows + extras`

这里的设计关键点是：在做结构化编辑时，尽量保留原始 section 顺序和非结构化内容，以便序列化时不破坏文件整体组织。

## 运行时数据流

### 文件导入流

1. 用户上传 `.ass` 文件或拖入文件
2. `handleFileList()` 过滤出合法输入
3. `loadAssFile()` 使用 `TextDecoder` 解码文本
4. `parseAss()` 将文本拆解为结构化对象
5. 生成文件对象并写入 `state.files`
6. `normalizeActiveFile()` 确保活动文件合法
7. `renderApp()` 触发界面刷新

### 编辑流

1. 用户在可视化表格或原文编辑器中修改内容
2. 表格编辑直接修改 `file.parsed` 中的目标字段
3. 结构改动后调用 `syncFileOutput()`
4. `syncFileOutput()` 使用 `stringifyAss()` 重新生成 `outputText`
5. `summarizeParsedAss()` 同步统计信息
6. 根据上下文更新结果区、原文区或摘要区

### 导出流

1. 用户触发单文件下载或 ZIP 下载
2. 从 `state.files` 中筛选 `selected` 文件
3. 直接导出 `outputText`
4. ZIP 导出通过 `createZipBlob()` 自行生成 ZIP 二进制

### 发布流

1. `main` 分支变更命中工作流条件
2. Pages 工作流复制静态文件并部署
3. Release 工作流计算版本号
4. 执行 `scripts/build-single-file.js`
5. 同时发布 ZIP 包和单文件 HTML

## 关键函数地图

下面按职责域归纳主要函数。

### 一、应用初始化与全局控制

- `getElement(selector)`
  DOM 查询兜底，确保关键元素存在
- `renderApp()`
  统一触发文件列表、编辑区和结果区刷新
- `bindEvents()`
  注册全局事件，包括上传、编码切换、下载、主题切换和窗口尺寸变化
- `initializeTheme()` / `applyTheme()` / `toggleTheme()`
  主题恢复与切换
- `initializeLayout()`
  恢复布局拖拽后的尺寸状态

### 二、工作区拖拽布局

- `bindLayoutResize()`
  绑定三条分隔条的拖拽行为
- `bindSplitResize()`
  分隔条通用拖拽基础逻辑
- `applyLeftPanelWidth()`
  调整左右列宽
- `applyColumnTopHeight()`
  调整列内上下区域高度

这部分逻辑通过 CSS 自定义属性完成布局控制，是当前界面可调工作区的基础。

### 三、文件导入与生命周期

- `initDropzone()` / `initializeDropzoneHint()`
  拖拽上传区与首次提示
- `handleFileList()`
  导入入口
- `reloadAllFilesWithEncoding()`
  重新按编码解码所有文件
- `removeSelectedFiles()` / `clearAllFiles()`
  文件删除
- `normalizeActiveFile()`
  活动文件兜底修正
- `loadAssFile()`
  单文件读取、解码和结构化生成

### 四、字幕解析层

- `parseAss()`
  主解析器
- `parseKeyValueSection()`
  通用键值节解析
- `parseStylesSection()`
  样式节解析
- `parseEventsSection()`
  事件节解析
- `splitAssFields()`
  按 ASS 字段规则拆分逗号分隔数据

这一层的目标不是构建完整 AST，而是构建“足够编辑、足够回写”的轻量结构。

### 五、时轴辅助能力

- `getTimelineToolState()`
  维护每个文件的时轴快调配置
- `parseFlexibleTimeToCentiseconds()`
  解析宽松输入时间格式
- `parseAssTimestamp()` / `formatAssTimestamp()`
  ASS 标准时间与内部数值互转
- `applyTimelineShift()`
  对命中事件执行整段提前或延后

这部分是当前项目里最接近“批量智能编辑”的结构化辅助工具。

时轴快调的边界策略：

- 输入范围可自动归一化
- 偏移量必须有效且不为 `0`
- 原始时间格式异常的事件行直接跳过
- 原始 `End < Start` 的异常事件行直接跳过
- 提前导致负时间时贴齐到 `0`
- 贴齐到 `0` 后保留原始持续时长

### 六、可视化编辑渲染

- `renderFiles()`
  左侧文件列表渲染
- `renderPreview()`
  右侧编辑主区渲染入口
- `updatePreviewSummary()`
  预览区摘要局部更新
- `buildEditableKeyValuePreview()`
  键值 section 表格化编辑
- `buildEditableStylesPreview()`
  样式分页编辑
- `buildEditableEventsPreview()`
  事件分页编辑
- `buildTimelineTool()`
  构建时轴快调工具条

### 七、表格与交互辅助

- `createCell()`
  单元格创建
- `applyDynamicTableLayout()`
  动态列宽分配
- `getColumnMetrics()`
  按字段类型定义列宽
- `initializeScrollableTables()`
  为表格容器补充增强交互
- `enhanceScrollableTable()`
  实现横向滚动增强与拖拽平移
- `buildPager()`
  通用分页条
- `getCurrentPage()` / `setCurrentPage()`
  分页状态读写

### 八、序列化与输出同步

- `syncFileOutput()`
  将结构化数据回写为完整文本，并更新统计
- `saveRawEditorChanges()`
  原文模式保存入口
- `stringifyAss()`
  主序列化器
- `stringifyKeyValueEntries()`
  键值节回写
- `stringifyStylesSection()`
  样式节回写
- `stringifyEventsSection()`
  事件节回写

这部分是结构化编辑与最终导出的一致性核心。

### 九、结果区与导出

- `buildFileSummary()`
  生成结构摘要，用于复制或辅助理解
- `renderResults()`
  渲染左上下载结果区
- `getResultPageSize()`
  根据空间和终端宽度决定结果区分页容量
- `downloadSelectedFiles()`
  单文件批量下载
- `downloadFile()`
  浏览器下载入口
- `downloadZipForSelected()`
  ZIP 下载入口
- `createZipBlob()`
  构造 ZIP 二进制
- `crc32()`
  ZIP 所需 CRC32 计算

## 样式系统地图

`styles.css` 主要承担五类职责：

1. 主题变量
   - 浅色与夜间模式色板
   - 阴影、圆角、焦点、字体和动画参数
2. 布局系统
   - 工作区网格
   - 左右列与上下可调区域
3. 组件系统
   - `hero-card`
   - `panel`
   - `dropzone`
   - `preview-card`
   - `timeline-tool`
   - `editor-table`
4. 交互动效
   - 按钮悬停和按下反馈
   - 主题切换过渡
   - 上传区引导扫光
   - `toast` 进出场
5. 响应式和可访问性兜底
   - 中小屏布局收缩
   - `prefers-reduced-motion` 动画降级

当前样式策略是“统一变量驱动 + 少量组件局部细化”，没有引入设计系统或预处理器。

## 发布与部署地图

### GitHub Pages

`pages.yml` 做的事情很简单：

1. 检出仓库
2. 将 `index.html`、`styles.css`、`app.js`、`README.md` 复制到 `dist/`
3. 上传 Pages 制品
4. 部署到 GitHub Pages

由于本项目是纯静态站点，这个流程已经足够。

### GitHub Release

`release.yml` 的职责更完整：

1. 检出历史并获取 tag
2. 计算下一个版本号
3. 基于 Git 提交生成发布说明
4. 运行 `scripts/build-single-file.js`
5. 生成多文件 ZIP 包
6. 将 ZIP 包和单文件 HTML 一起发布到 GitHub Release

### 单文件构建脚本

`scripts/build-single-file.js` 的策略是：

- 读取 `index.html`
- 将 `styles.css` 内联为 `<style>`
- 将 `app.js` 内联为 `<script>`
- 对 `</script>` 做安全转义
- 输出到 `dist/ass-subtitle-studio-single-file.html`

这是一个非常轻量、非常直接的构建方式，适合当前仓库规模。

## 改动影响面指南

### 如果要修改文件导入行为

优先关注：

- `handleFileList()`
- `loadAssFile()`
- `reloadAllFilesWithEncoding()`
- `parseAss()`

### 如果要修改可视化编辑体验

优先关注：

- `renderPreview()`
- `buildEditableKeyValuePreview()`
- `buildEditableStylesPreview()`
- `buildEditableEventsPreview()`
- `styles.css` 中的 `preview-card`、`editor-table` 相关规则

### 如果要新增批量字幕工具

优先关注：

- `getTimelineToolState()`
- `parseFlexibleTimeToCentiseconds()`
- `applyTimelineShift()`
- `syncFileOutput()`

建议沿用“工具状态独立存储 + 修改 `parsed` + 统一回写 `outputText`”这条链路。

### 如果要修改导出行为

优先关注：

- `downloadSelectedFiles()`
- `downloadZipForSelected()`
- `createZipBlob()`
- `normalizeAssFileName()`

### 如果要调整发布流程

优先关注：

- `.github/workflows/pages.yml`
- `.github/workflows/release.yml`
- `scripts/build-single-file.js`

## 当前技术约束与维护建议

### 约束

- `app.js` 已经承担过多职责，继续扩展时需要控制函数边界
- 当前没有测试体系，回归主要依赖手工验证
- 解析层是“轻结构化”而非严格 AST，对极端 ASS 变体要保持谨慎
- 渲染是手写局部刷新，新增功能时要格外注意重渲染副作用

### 建议

- 新增功能时优先复用现有状态和回写链路，不要绕开 `syncFileOutput()`
- 若 `app.js` 继续增长，建议按职责拆成多个原生模块文件，但必须保留 `file://` 兼容性评估
- 保持 README 面向使用者，工程细节优先写入本文档或贡献文档
- 发布链路保持简单，不要为轻量项目过早引入复杂打包工具

## 推荐阅读顺序

对于首次接手项目的人，建议按以下顺序阅读：

1. `README.md`
2. `index.html`
3. `app.js` 中的初始化、状态和解析函数
4. `renderPreview()` 及各编辑区构建函数
5. `syncFileOutput()` 和 `stringifyAss()`
6. `styles.css`
7. `.github/workflows/pages.yml`
8. `.github/workflows/release.yml`
9. `scripts/build-single-file.js`

这样可以先理解产品表面，再进入运行时，再进入仓库自动化。
