// Real-file persistence: one JSON file per script in ~/Documents/BijouDocs/,
// named by the script's stable id (idXXXXX.json) so renaming a script's
// title in-app never touches the filename on disk.
import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { migrateScript } from './scriptSchema.js'

function defaultDocsDir() {
  return path.join(app.getPath('documents'), 'BijouDocs')
}

// Where scripts are actually read from/written to — a user-chosen folder
// (e.g. inside a Google Drive/Dropbox/iCloud sync folder, for sharing
// scripts across machines) if one's been set, else the default local
// Documents folder. The choice itself is saved in settings.json, which is
// deliberately per-machine (Electron's own userData dir, never synced) —
// each machine points at wherever its own copy of the sync folder lives.
function getDocsDir() {
  const settings = loadSettings()
  return settings.storageDir || defaultDocsDir()
}

// Copies any script JSON the old folder has that the new one doesn't, so
// switching to a synced folder (or switching between machines) never
// silently drops scripts that only exist in the old location. Never
// overwrites a file already present at the destination — if the new
// folder already has a same-named script (e.g. synced in from another
// machine), that copy wins.
function migrateStorageDir(oldDir, newDir) {
  fs.mkdirSync(newDir, { recursive: true })
  if (path.resolve(oldDir) === path.resolve(newDir) || !fs.existsSync(oldDir)) return
  const files = fs.readdirSync(oldDir).filter((f) => f.endsWith('.json'))
  for (const file of files) {
    const dest = path.join(newDir, file)
    if (!fs.existsSync(dest)) fs.copyFileSync(path.join(oldDir, file), dest)
  }
}

// App-wide preferences (not tied to any one script) — kept in Electron's
// own userData dir, separate from the per-script files in Documents.
function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json')
}

function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsPath(), 'utf-8'))
  } catch (err) {
    return {}
  }
}

// Merges into whatever's already on disk rather than overwriting wholesale
// — a caller only needs to pass the field(s) it actually knows about. This
// is deliberate: the renderer's own saveAppSettings() used to pass a
// "complete" object that didn't actually include every persisted field
// (storageDir wasn't in it), so every save silently erased the user's
// chosen sync folder — a real incident, not a hypothetical. An explicit
// `undefined` for a key still deletes it (see resetStorageDir below),
// distinct from simply not mentioning a key at all.
function saveSettings(incoming) {
  const merged = { ...loadSettings(), ...incoming }
  Object.keys(merged).forEach((k) => {
    if (merged[k] === undefined) delete merged[k]
  })
  fs.writeFileSync(settingsPath(), JSON.stringify(merged, null, 2), 'utf-8')
  return true
}

function ensureDir() {
  const dir = getDocsDir()
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function scriptPath(id) {
  return path.join(ensureDir(), id + '.json')
}

// Matches both kinds of full-content history files this project writes
// alongside a script's real file — neither should ever be picked up as a
// script of its own (see the loadAllScripts filter below).
function isHistoryFile(f) {
  return f.includes('.conflict-') || f.includes('.snapshot-')
}

function loadAllScripts() {
  const dir = ensureDir()
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && !isHistoryFile(f))
  const scripts = []
  for (const file of files) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'))
      const script = migrateScript(raw)
      if (script) scripts.push(script)
    } catch (err) {
      console.error('BijouDocs: failed to read/parse', file, err)
    }
  }
  return scripts
}

const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000 // how far apart automatic snapshots are, at minimum
const MAX_SNAPSHOTS = 40 // ~3+ hours of history at the interval above, per script

// A lightweight, automatic version history — separate from the app's own
// manual "+ Save checkpoint" feature (which only snapshots section text,
// for the writer's own before/after comparisons). This snapshots the
// *entire* script file (including the mind map, categories, etc.) on a
// throttle, purely so a bad save can always be undone from outside the
// app's own in-memory state, the same way a conflict backup already can be
// — see saveScript below, which is the only caller.
function maybeWriteSnapshot(id, contents) {
  const dir = ensureDir()
  const prefix = id + '.snapshot-'
  const existing = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.endsWith('.json'))
    .sort()
  const last = existing[existing.length - 1]
  const lastAt = last ? Number(last.slice(prefix.length, -'.json'.length)) : 0
  if (Date.now() - lastAt < SNAPSHOT_INTERVAL_MS) return
  fs.writeFileSync(path.join(dir, prefix + Date.now() + '.json'), contents, 'utf-8')
  const stale = existing.slice(0, Math.max(0, existing.length + 1 - MAX_SNAPSHOTS))
  stale.forEach((f) => fs.unlinkSync(path.join(dir, f)))
}

function forceSnapshot(id, contents) {
  const dir = ensureDir()
  const prefix = id + '.snapshot-'
  fs.writeFileSync(path.join(dir, prefix + Date.now() + '.json'), contents, 'utf-8')
  const existing = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.endsWith('.json'))
    .sort()
  const stale = existing.slice(0, Math.max(0, existing.length - MAX_SNAPSHOTS))
  stale.forEach((f) => fs.unlinkSync(path.join(dir, f)))
}

// `expectedUpdatedAt` is whatever `updatedAt` this app instance last knew
// the on-disk file to have (from loading it, or from this instance's own
// last successful save) — if the file on disk now has a *different*
// `updatedAt`, something else (almost always: this same app, saved from
// another machine sharing this folder via Drive/Dropbox/etc) wrote a
// change we never saw. Rather than silently clobber that with whatever's
// in memory here, the losing copy gets backed up alongside it first, so a
// save can never make data actually disappear — worst case, a human has
// to go compare two files by hand.
function saveScript(script, expectedUpdatedAt, { forceSnapshot: force = false } = {}) {
  if (!script || !script.id) throw new Error('saveScript requires a script with an id')
  const file = scriptPath(script.id)
  let conflict = false
  let backupFile = null
  if (expectedUpdatedAt != null && fs.existsSync(file)) {
    try {
      const onDisk = JSON.parse(fs.readFileSync(file, 'utf-8'))
      if (onDisk && onDisk.updatedAt != null && onDisk.updatedAt !== expectedUpdatedAt) {
        conflict = true
        backupFile = script.id + '.conflict-' + Date.now() + '.json'
        fs.copyFileSync(file, path.join(ensureDir(), backupFile))
      }
    } catch (err) {
      // Unreadable/corrupt on-disk file — nothing sensible to compare
      // against or back up, just proceed with a normal save.
    }
  }
  const contents = JSON.stringify(script, null, 2)
  fs.writeFileSync(file, contents, 'utf-8')
  if (force) forceSnapshot(script.id, contents)
  else maybeWriteSnapshot(script.id, contents)
  return { conflict, backupFile, updatedAt: script.updatedAt }
}

// Every restorable full-content file for one script — the periodic
// snapshots above and any conflict backups, presented together since
// they're both "what this file looked like at some past save," just with
// different reasons for existing.
function listSaveHistory(id) {
  const dir = ensureDir()
  const prefix = id + '.'
  return fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && isHistoryFile(f) && f.endsWith('.json'))
    .map((f) => {
      const isConflict = f.includes('.conflict-')
      const marker = isConflict ? '.conflict-' : '.snapshot-'
      const at = Number(f.slice(f.indexOf(marker) + marker.length, -'.json'.length))
      return { file: f, at, kind: isConflict ? 'conflict' : 'snapshot' }
    })
    .filter((e) => !isNaN(e.at))
    .sort((a, b) => b.at - a.at)
}

// Restores one history entry as the script's real, active file — backing
// up whatever's currently there as a fresh snapshot first (so restoring is
// itself always undoable the same way, not a one-way door), then returns
// the restored content so the renderer can update its in-memory copy
// without a full reload.
function restoreFromHistory(id, file) {
  const dir = ensureDir()
  const src = path.join(dir, file)
  if (!fs.existsSync(src)) throw new Error('History file not found: ' + file)
  const restoredRaw = fs.readFileSync(src, 'utf-8')
  const restored = migrateScript(JSON.parse(restoredRaw))
  const mainFile = scriptPath(id)
  if (fs.existsSync(mainFile)) {
    forceSnapshot(id, fs.readFileSync(mainFile, 'utf-8'))
  }
  restored.updatedAt = Date.now()
  fs.writeFileSync(mainFile, JSON.stringify(restored, null, 2), 'utf-8')
  return restored
}

function deleteScript(id) {
  const dir = ensureDir()
  const file = scriptPath(id)
  if (fs.existsSync(file)) fs.unlinkSync(file)
  // Also clean up any history files left for this script — no point
  // keeping them around once the script itself is gone for good.
  fs.readdirSync(dir)
    .filter((f) => f.startsWith(id + '.') && isHistoryFile(f))
    .forEach((f) => fs.unlinkSync(path.join(dir, f)))
  return true
}

export {
  getDocsDir,
  defaultDocsDir,
  migrateStorageDir,
  ensureDir,
  loadAllScripts,
  saveScript,
  deleteScript,
  loadSettings,
  saveSettings,
  listSaveHistory,
  restoreFromHistory,
  scriptPath as scriptFilePath
}
