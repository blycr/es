# 函数地图

## 文档目的

本文档用于从函数级别说明 `app.js` 的职责划分、调用关系和改动入口。

建议与 [CODEMAP.md](./CODEMAP.md) 配合阅读：

- `CODEMAP.md` 说明系统层面的结构、数据流和边界
- `FUNCTION_MAP.md` 说明函数层面的职责、依赖和改动影响

## 读取方式

建议按以下顺序使用本文件：

1. 先找到自己要改的功能域
2. 再看该功能域下的入口函数
3. 最后沿着“直接依赖 / 常见调用方”定位真正需要改的点

## 一、启动与全局编排

### `getElement(selector)`

- 作用：查询关键 DOM 节点，并在缺失时立即抛错
- 直接依赖：`document.querySelector`
- 常见调用方：全局 `els` 对象初始化
- 改动提示：不要改成静默失败，否则后续空指针会更难定位

### `renderApp()`

- 作用：统一刷新文件列表、预览区和结果区
- 直接依赖：
  - `renderFiles()`
  - `renderPreview()`
  - `renderResults()`
- 常见调用方：
  - `handleFileList()`
  - `reloadAllFilesWithEncoding()`
  - `clearAllFiles()`
- 改动提示：如果新增全局级视图刷新入口，应优先挂在这里

### `bindEvents()`

- 作用：注册全局 DOM 事件和窗口事件
- 直接依赖：
  - 文件上传
  - 编码切换
  - 下载
  - 主题切换
  - 窗口尺寸变化
  - `bindLayoutResize()`
- 改动提示：全局事件优先集中在这里，避免分散注册

## 二、主题与布局

### `initializeTheme()`

- 作用：按 `localStorage` 或系统偏好恢复主题
- 直接依赖：
  - `applyTheme()`
  - `window.matchMedia`

### `toggleTheme()`

- 作用：切换昼夜主题，并触发轻量切换动画
- 直接依赖：
  - `applyTheme()`
  - `UI_ANIMATION_DURATION`

### `applyTheme(theme)`

- 作用：写入 `body.dataset.theme` 与本地存储，并更新按钮文案
- 改动提示：所有主题切换副作用应在这里收口

### `initializeLayout()`

- 作用：恢复工作区拖拽后的布局参数
- 直接依赖：
  - `applyLeftPanelWidth()`
  - `applyColumnTopHeight()`

### `bindLayoutResize()`

- 作用：绑定三条工作区分隔条的拖拽逻辑
- 直接依赖：
  - `bindSplitResize()`
  - `applyLeftPanelWidth()`
  - `applyColumnTopHeight()`

### `bindSplitResize({ divider, onMove })`

- 作用：实现分隔条拖拽的通用基础逻辑
- 改动提示：如果以后新增第四条分隔条，应优先复用这里

### `applyLeftPanelWidth(rawWidth, gridWidth)`

- 作用：更新左右主工作区宽度
- 关键约束：
  - 有最小宽度
  - 有最大宽度
  - 会持久化到本地存储

### `applyColumnTopHeight(variableName, rawHeight, columnElement, minHeight, minBottomHeight, storageKey)`

- 作用：更新列内上下分区高度
- 改动提示：如果布局变成三段式，这里需要重构

## 三、导入与文件生命周期

### `initDropzone()`

- 作用：初始化拖拽上传区
- 直接依赖：`handleFileList()`

### `initializeDropzoneHint()`

- 作用：首次访问时显示上传区提示动画
- 改动提示：仅处理引导，不参与上传逻辑

### `handleFileList(fileList)`

- 作用：导入 `.ass` 文件集合并写入状态
- 直接依赖：
  - `loadAssFile()`
  - `normalizeActiveFile()`
  - `renderApp()`
  - `showToast()`
- 关键行为：
  - 过滤非 `.ass`
  - 同名文件会替换已有条目

### `reloadAllFilesWithEncoding()`

- 作用：按当前编码重新解码所有文件
- 直接依赖：
  - `loadAssFile()`
  - `normalizeActiveFile()`
  - `renderApp()`

### `removeSelectedFiles()`

- 作用：删除当前勾选文件
- 改动提示：如果以后支持“回收站”，这里是入口之一

### `clearAllFiles()`

- 作用：清空全部文件和分页状态

### `normalizeActiveFile()`

- 作用：保证 `activeFileId` 始终指向合法文件
- 关键约束：
  - 无文件时置空
  - 当前活动文件失效时切到第一项

### `loadAssFile(file, encoding, previous)`

- 作用：读取浏览器 `File`、解码、解析并生成文件对象
- 直接依赖：
  - `parseAss()`
  - `normalizeAssFileName()`
  - `summarizeParsedAss()`
- 改动提示：这是单文件导入生命周期的核心

## 四、ASS 解析与时间处理

### `parseAss(text)`

- 作用：将完整字幕文本拆为 section 级结构
- 直接依赖：
  - `parseKeyValueSection()`
  - `parseStylesSection()`
  - `parseEventsSection()`
- 关键约束：
  - 保留 section 顺序
  - 保留根部非 section 内容

### `parseKeyValueSection(section)`

- 作用：解析键值型 section
- 输出结构：
  - `blank`
  - `comment`
  - `raw`
  - `kv`

### `parseStylesSection(section)`

- 作用：解析 `V4+ Styles`
- 输出结构：
  - `format`
  - `rows`
  - `extras`

### `parseEventsSection(section)`

- 作用：解析 `Events`
- 关键约束：
  - 只把已知事件类型转成结构化行
  - 未识别内容落回 `extras`

### `splitAssFields(text, count)`

- 作用：按 ASS 字段规则拆分逗号字段
- 关键点：
  - 只切前 `count - 1` 个逗号
  - 保证最后一列保留原始文本余量

### `getTimelineToolState(fileId)`

- 作用：维护每个文件的时轴快调状态
- 改动提示：如果以后新增更多批量工具，可按同样模式扩展独立状态

### `parseFlexibleTimeToCentiseconds(value)`

- 作用：解析宽松输入格式的时间 / 偏移量
- 支持：
  - `0:00:00.00`
  - `00.00.00`
  - `0.3`

### `buildCentiseconds(isNegative, hours, minutes, seconds, centiseconds)`

- 作用：把分段时间值转换成内部的百分秒整数

### `parseAssTimestamp(value)`

- 作用：解析标准 ASS 时间

### `formatAssTimestamp(totalCentiseconds)`

- 作用：将内部时间值格式化回 ASS 时间字符串

### `applyTimelineShift(file)`

- 作用：对命中的事件执行整段提前或延后
- 直接依赖：
  - `getTimelineToolState()`
  - `parseFlexibleTimeToCentiseconds()`
  - `parseAssTimestamp()`
  - `formatAssTimestamp()`
  - `syncFileOutput()`
  - `renderPreview()`
  - `showToast()`
- 关键边界：
  - 起止范围自动归一化
  - 非法时间行跳过
  - `End < Start` 行跳过
  - 负时间贴齐到 `0`
  - 保留原始时长

## 五、统计与摘要

### `summarizeParsedAss(parsed, text)`

- 作用：计算用于界面摘要的统计信息
- 输出内容：
  - 字节数
  - 行数
  - section 列表
  - 键值数量
  - 样式数量
  - 事件数量

### `buildFileSummary(file)`

- 作用：生成结构摘要，用于复制或后续 AI 辅助

## 六、文件列表与预览渲染

### `renderFiles()`

- 作用：渲染左侧文件列表和活动文件下拉
- 关键行为：
  - 文件名实时改为输出名
  - 勾选状态影响结果区
  - 删除文件后同步修正活动文件和分页

### `syncActiveFileSelect()`

- 作用：让活动文件下拉和状态保持一致

### `renderPreview()`

- 作用：根据当前活动文件和模式渲染右侧主编辑区
- 分支：
  - 无文件空状态
  - 原文编辑模式
  - 可视化编辑模式

### `updatePreviewSummary(file)`

- 作用：局部刷新预览摘要头部，避免整块重渲染

### `buildEditableKeyValuePreview(file, title, section)`

- 作用：构建键值型 section 的编辑卡片

### `buildEditableStylesPreview(file)`

- 作用：构建样式表分页编辑器

### `buildEditableEventsPreview(file)`

- 作用：构建事件表分页编辑器，并插入时轴快调工具条

### `buildTimelineTool(file)`

- 作用：构建时轴快调表单和快捷偏移按钮

### `buildTimelineField(labelText, placeholder)`

- 作用：构建时轴工具中的标准输入项

## 七、表格布局与滚动增强

### `createCell(node, columnName, sectionType)`

- 作用：统一创建带列元信息的单元格

### `applyDynamicTableLayout(table, columns, sectionType)`

- 作用：按字段特征为表格生成动态列宽
- 直接依赖：`getColumnMetrics()`

### `getColumnMetrics(columnName, sectionType)`

- 作用：按列名推断宽度和类型

### `initializeScrollableTables()`

- 作用：为当前预览区内的所有表格容器启用增强滚动

### `enhanceScrollableTable(wrap)`

- 作用：增强横向滚动、拖拽平移和溢出提示

### `hasHorizontalOverflow(wrap)`

- 作用：判断表格是否存在横向溢出

### `updateScrollableTableState(wrap)`

- 作用：更新表格容器左右溢出提示状态

## 八、分页

### `buildPager(page, totalPages, onPageChange)`

- 作用：生成统一风格的分页控件
- 改动提示：全项目分页都应优先复用这里

### `getCurrentPage(kind, fileId)`

- 作用：读取样式页或事件页的当前页码

### `setCurrentPage(kind, fileId, page)`

- 作用：写入分页状态并刷新预览

### `getResultPageSize()`

- 作用：根据左上结果区可用高度估算单页容量
- 关键点：
  - 移动端和桌面端容量不同
  - 会根据实际可用高度动态收缩

## 九、回写与原文编辑

### `syncFileOutput(file)`

- 作用：把结构化数据重新序列化成文本，并同步统计与界面
- 直接依赖：
  - `stringifyAss()`
  - `summarizeParsedAss()`
  - `renderResults()`

### `saveRawEditorChanges()`

- 作用：将原文编辑器内容重新解析并写回结构化状态
- 直接依赖：
  - `parseAss()`
  - `summarizeParsedAss()`
  - `renderPreview()`
  - `renderResults()`

### `stringifyAss(parsed)`

- 作用：将结构化 ASS 对象还原为完整文本
- 关键约束：
  - 尽量保留原始 section 顺序
  - 允许缺失 section 按需补写

### `stringifyKeyValueEntries(entries)`

- 作用：回写键值型 section

### `stringifyStylesSection(section)`

- 作用：回写样式 section

### `stringifyEventsSection(section)`

- 作用：回写事件 section

## 十、下载与 ZIP 构造

### `renderResults()`

- 作用：渲染左上下载结果区和其分页

### `downloadSelectedFiles()`

- 作用：对勾选文件逐个触发浏览器下载

### `downloadFile(file)`

- 作用：生成 `Blob URL` 并触发单文件下载

### `downloadZipForSelected()`

- 作用：为勾选文件生成 ZIP 并下载
- 直接依赖：
  - `createZipBlob()`

### `createZipBlob(entries)`

- 作用：无依赖地构造 ZIP 二进制
- 关键约束：
  - 使用 store 模式，不做压缩
  - 显式写入 UTF-8 文件名标记
  - 依赖 `crc32()` 计算校验值

### `crc32(bytes)`

- 作用：生成 ZIP 所需 CRC32

## 十一、杂项辅助

### `getActiveFile()`

- 作用：读取当前活动文件对象

### `normalizeAssFileName(value, fallbackName)`

- 作用：清洗导出文件名，并保证扩展名为 `.ass`

### `formatBytes(bytes)`

- 作用：格式化字节大小显示

### `escapeHtml(text)`

- 作用：转义预览区中的文本内容

### `showToast(message)`

- 作用：显示全局轻提示

### `copyText(text, successMessage, failureMessage)`

- 作用：复制文本到剪贴板，并在不支持现代剪贴板 API 时降级

## 常见改动路径

### 想加新的结构化编辑区

通常需要同时改：

- `parseAss()`
- 对应的 section 解析函数
- `renderPreview()`
- 新的 `buildEditable...` 函数
- `stringifyAss()`
- 对应的 `stringify...` 函数

### 想加新的批量编辑工具

通常需要同时改：

- `state` 中新增工具状态
- 工具 UI 构建函数
- 工具执行函数
- `syncFileOutput()`
- `README.md` / `CODEMAP.md`

### 想改导出或发布产物

通常需要同时改：

- `downloadFile()` / `downloadZipForSelected()` / `createZipBlob()`
- `.github/workflows/release.yml`
- `scripts/build-single-file.js`

## 最后建议

如果一个改动需要跨越以下两个以上区域，基本就应该同步更新文档：

- 解析层
- 可视化编辑层
- 序列化层
- 导出层
- 发布层

在当前仓库规模下，文档是维持可维护性的关键资产，不应把函数语义只留在代码里。
