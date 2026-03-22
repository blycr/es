# ASS Subtitle Studio

ASS Subtitle Studio is a browser-based editor for `.ass` subtitle files.

It is designed for local-first editing: files stay on the user's machine, the app works when opened directly with `file://`, and common subtitle maintenance tasks can be handled without a backend.

## What It Does

- Import multiple local `.ass` files
- Re-decode files with common subtitle encodings
- Rename output files before export
- Edit `Script Info` and `Aegisub Project Garbage`
- Edit `V4+ Styles` and `Events` in paged visual tables
- Edit the full subtitle text in raw mode
- Export individual files or download selected files as a ZIP archive

## Project Goals

- Keep the app usable without a local server
- Preserve a straightforward, dependency-free front end
- Support large subtitle files without sending content to a remote service
- Provide a practical editing workflow for metadata, styles, events, and export names

## Usage

1. Open [index.html](/c:/Users/blycr/es/index.html) in a browser.
2. Import one or more `.ass` files.
3. Rename files or edit subtitle content in the visual or raw editor.
4. Download the selected outputs as individual files or as a ZIP archive.

## Compatibility Notes

- Direct `file://` usage is supported.
- The app is intended for modern desktop browsers.
- ZIP exports use UTF-8 file names.
- Sample subtitle files are ignored by Git and are not part of the repository.

## Repository Structure

- [index.html](/c:/Users/blycr/es/index.html): application shell
- [styles.css](/c:/Users/blycr/es/styles.css): layout and theme styles
- [app.js](/c:/Users/blycr/es/app.js): parsing, editing, and export logic
- [CONTRIBUTING.md](/c:/Users/blycr/es/CONTRIBUTING.md): contribution workflow
- [SECURITY.md](/c:/Users/blycr/es/SECURITY.md): security reporting guidance

## Development

- Run `node --check app.js` before submitting changes.
- Keep `file://` compatibility intact when changing loading behavior.
- Prefer small, readable changes over framework-heavy abstractions.

## License

This project is licensed under the MIT License. See [LICENSE](/c:/Users/blycr/es/LICENSE).
