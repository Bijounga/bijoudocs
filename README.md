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

- Each script is saved as its own JSON file in `~/Documents/BijouDocs/`.
- App-wide preferences (note color, margin widths, etc.) are saved separately, in Electron's own per-OS app-data folder, as `settings.json`.

Nothing is sent anywhere — it's all local files.

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
