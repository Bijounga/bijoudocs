# BijouDocs

A desktop app for writing and organizing YouTube scripts — sections, lines, tags/categories, notes, bookmarks, A/B line takes, a teleprompter view, and a freeform mind-map for planning story structure. Built with Electron + React, plain JavaScript (no TypeScript).

This copy is meant as a **starting point** — open it in Claude Code and describe what you'd want changed or added, and it can customize the app for you from here.

## Requirements

- [Node.js](https://nodejs.org) (LTS version) and npm
- Windows, macOS, or Linux (built and tested on Windows)

## Getting started

```bash
npm install
npm run dev
```

That opens the app in a dev window with hot reload. Your scripts are saved as you go — see **Where your data lives** below.

To build an installable copy:

```bash
npm run dist
```

The installer lands in `dist/` (e.g. `dist/BijouDocs Setup <version>.exe` on Windows).

## Where your data lives

- Each script is saved as its own JSON file in `~/Documents/BijouDocs/` by default — or wherever you point it via the folder icon at the bottom of the sidebar ("Change…"), e.g. a Google Drive/Dropbox/iCloud-synced folder, to share scripts across machines. Switching folders copies over anything the old one had that the new one doesn't, without ever overwriting a file already at the destination.
- App-wide preferences (note color, margin widths, *which* storage folder is chosen, etc.) are saved separately and locally on each machine, in Electron's own per-OS app-data folder, as `settings.json` — never synced itself, since each machine may point at the sync folder via a different local path.

Nothing is sent anywhere except the app's own update check (see below) — script content itself never leaves your machine or your chosen sync folder.

## Auto-updates

This copy is wired to check `github.com/Bijounga/bijoudocs` (Releases) for newer versions on launch and periodically while running, download silently in the background, and show a small "restart to update" banner once ready. To point a fork at your own releases instead, change `build.publish` in `package.json` and update `.github/workflows/release.yml`'s target repo — then push a `vX.Y.Z` tag to build and publish a new release automatically (both Windows and a universal Mac build).

## Project structure

```
electron/main/       Main process: window creation, file I/O (reading/writing script JSON,
                      settings.json), IPC handlers. scriptSchema.js defines the on-disk shape
                      and migrates older files when the schema changes.
electron/preload/     Exposes a small `window.bijou.*` API to the renderer over IPC.
src/                  The renderer (the actual UI), a normal React app.
  state/store.js       Single Zustand store (+ immer) — almost all app state and actions
                        live here. This is the file to read first to understand how anything
                        works.
  components/          React components, organized roughly by area (editor/, sidebar, etc.)
  lib/                 Pure helper functions (timecodes, keybinds, html sanitizing, etc.)
build/                Icon source images + the generated .ico/.png used by the installer.
scripts/              Small dev-only utility scripts (e.g. regenerating the icon, a CDP
                      test-driving helper used during development).
```

A couple of things worth knowing before making changes:

- **No TypeScript** — plain `.js`/`.jsx` throughout, by design.
- **The main process and renderer can't share code directly** (separate processes) — `electron/main/scriptSchema.js` and the renderer's own script-shape logic in `src/state/store.js` describe the same data shape and have to be kept in sync by hand whenever a new field is added to a script.
- State updates go through Zustand actions in `store.js` using `immer`, so actions mutate `state` directly inside a `set((state) => { ... })` call rather than returning a new object.
- Undo/redo is snapshot-based (captured on focus / before a structural change), not per-keystroke.

## Customizing this with Claude Code

Open this folder in Claude Code and just describe what you want — a new feature, a visual tweak, rebranding, different terminology for a different kind of writing (not just YouTube scripts), etc. A good first prompt:

> This is BijouDocs, a script-writing app someone shared with me as a starting point (see README.md). I'd like to make it my own — [describe what you want different: rebrand it, add/remove a feature, change the workflow to fit X instead of Y, etc.]. Can you help me figure out the right first steps?
