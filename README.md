# ASS Subtitle Studio

ASS Subtitle Studio 是一个用于编辑 `.ass` 字幕文件的浏览器端工具。

项目采用本地优先的使用方式：文件保留在用户本机，支持直接通过 `file://` 打开，也可以通过 GitHub Pages 等静态托管方式访问。

## 功能概览

- 批量导入本地 `.ass` 字幕文件
- 按常见字幕编码重新解码文件
- 在导出前修改输出文件名
- 编辑 `Script Info` 与 `Aegisub Project Garbage`
- 以分页表格方式编辑 `V4+ Styles` 与 `Events`
- 以原文模式直接编辑完整字幕文本
- 单文件导出或将所选文件打包为 ZIP 下载

## 设计目标

- 不依赖后端即可完成常见字幕整理工作
- 保持纯前端、低依赖、易维护的实现方式
- 在处理较大字幕文件时尽量保证可用性
- 覆盖元信息、样式、事件与导出文件名等常见编辑场景

## 使用方式

1. 打开 [index.html](/c:/Users/blycr/es/index.html)。
2. 导入一个或多个 `.ass` 文件。
3. 在可视化编辑或原文编辑中修改内容。
4. 下载单个文件或导出所选文件的 ZIP 包。

## 兼容性说明

- 支持直接使用 `file://` 打开。
- 建议在现代桌面浏览器中使用。
- ZIP 导出使用 UTF-8 文件名。
- 示例字幕文件已通过 Git 忽略规则排除，不会进入仓库。

## 仓库结构

- [index.html](/c:/Users/blycr/es/index.html)：页面结构与应用入口
- [styles.css](/c:/Users/blycr/es/styles.css)：布局、主题与控件样式
- [app.js](/c:/Users/blycr/es/app.js)：字幕解析、编辑与导出逻辑
- [CONTRIBUTING.md](/c:/Users/blycr/es/CONTRIBUTING.md)：贡献说明
- [SECURITY.md](/c:/Users/blycr/es/SECURITY.md)：安全问题反馈方式
- [CHANGELOG.md](/c:/Users/blycr/es/CHANGELOG.md)：版本与变更记录

## 开发说明

- 提交前运行 `node --check app.js`
- 修改加载逻辑时保留 `file://` 兼容性
- 优先保持实现直接、清晰、易维护

## 许可证

本项目基于 MIT License 发布，见 [LICENSE](/c:/Users/blycr/es/LICENSE)。
