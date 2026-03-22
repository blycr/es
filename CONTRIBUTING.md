# Contributing

## Setup

1. Clone the repository.
2. Open `index.html` directly in a browser, or serve the folder with any static file server.
3. Edit `index.html`, `styles.css`, and `app.js` as needed.

## Guidelines

- Keep the app dependency-free unless a dependency clearly reduces complexity.
- Preserve `file://` compatibility when changing loading behavior.
- Prefer progressive enhancement over browser-specific features.
- Keep UI copy concise and user-facing.
- Do not commit local sample subtitle files or generated export archives.

## Before Opening a PR

- Verify the page still works in direct file mode.
- Check the main flows: import, rename, visual edit, raw edit, single download, ZIP download, and theme toggle.
- Run `node --check app.js`.
