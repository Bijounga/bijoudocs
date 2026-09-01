// Real-file persistence: one JSON file per script in ~/Documents/BijouDocs/,
// named by the script's stable id (idXXXXX.json) so renaming a script's
// title in-app never touches the filename on disk.
import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { migrateScript } from './scriptSchema.js'

function getDocsDir() {
  return path.join(app.getPath('documents'), 'BijouDocs')
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

export { getDocsDir, ensureDir, loadAllScripts, saveScript, deleteScript, loadSettings, saveSettings }
