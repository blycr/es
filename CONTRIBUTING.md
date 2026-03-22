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
- Keep README focused on product overview, usage, and repository entry points.
- Move implementation details and contributor-only guidance into repository docs instead of the README.

## Scope

- `README.md` should explain what the project is, how to use it, and where to start.
- `CONTRIBUTING.md` should explain how to change the project safely.
- `SECURITY.md` should be the only place for vulnerability reporting guidance.

## Before Opening a PR

- Verify the page still works in direct file mode.
- Check the main flows: import, rename, visual edit, raw edit, single download, ZIP download, and theme toggle.
- Run `node --check app.js`.
- Review copy for consistency in tone and language before submitting.
