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

function saveSettings(settings) {
  fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), 'utf-8')
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

function loadAllScripts() {
  const dir = ensureDir()
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && !f.includes('.conflict-'))
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

// `expectedUpdatedAt` is whatever `updatedAt` this app instance last knew
// the on-disk file to have (from loading it, or from this instance's own
// last successful save) — if the file on disk now has a *different*
// `updatedAt`, something else (almost always: this same app, saved from
// another machine sharing this folder via Drive/Dropbox/etc) wrote a
// change we never saw. Rather than silently clobber that with whatever's
// in memory here, the losing copy gets backed up alongside it first, so a
// save can never make data actually disappear — worst case, a human has
// to go compare two files by hand.
function saveScript(script, expectedUpdatedAt) {
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
  fs.writeFileSync(file, JSON.stringify(script, null, 2), 'utf-8')
  return { conflict, backupFile, updatedAt: script.updatedAt }
}

function deleteScript(id) {
  const dir = ensureDir()
  const file = scriptPath(id)
  if (fs.existsSync(file)) fs.unlinkSync(file)
  // Also clean up any conflict backups left for this script — no point
  // keeping them around once the script itself is gone for good.
  fs.readdirSync(dir)
    .filter((f) => f.startsWith(id + '.conflict-'))
    .forEach((f) => fs.unlinkSync(path.join(dir, f)))
  return true
}

export { getDocsDir, defaultDocsDir, migrateStorageDir, ensureDir, loadAllScripts, saveScript, deleteScript, loadSettings, saveSettings }
