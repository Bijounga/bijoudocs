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
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'))
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

function saveScript(script) {
  if (!script || !script.id) throw new Error('saveScript requires a script with an id')
  fs.writeFileSync(scriptPath(script.id), JSON.stringify(script, null, 2), 'utf-8')
  return true
}

function deleteScript(id) {
  const file = scriptPath(id)
  if (fs.existsSync(file)) fs.unlinkSync(file)
  return true
}

export { getDocsDir, defaultDocsDir, migrateStorageDir, ensureDir, loadAllScripts, saveScript, deleteScript, loadSettings, saveSettings }
