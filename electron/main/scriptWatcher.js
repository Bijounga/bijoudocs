// Watches the scripts folder for changes made by something other than this
// app instance — specifically, the Premiere extension (premiere-extension/)
// editing a script's tags/notes/done-state directly on disk while BijouDocs
// is open on the same script. Forwards the fresh script to the renderer so
// it shows up live, instead of only being noticed the next time this app
// itself tries to save (see fileStore.js's saveScript conflict comment).
import fs from 'fs'
import path from 'path'
import { getDocsDir } from './fileStore.js'
import { migrateScript } from './scriptSchema.js'

let watcher = null
let win = null
const debounceTimers = {}
const DEBOUNCE_MS = 250

// id -> updatedAt this process has already accounted for, either because it
// just wrote that value itself (see noteSelfSave, called from index.js right
// after a save/restore) or because it already forwarded it to the renderer.
// Without this, every one of BijouDocs' own saves would re-trigger as if it
// were an external change.
const lastKnownUpdatedAt = {}

function isTrackedScriptFile(filename) {
  if (!filename || !filename.endsWith('.json')) return false
  if (filename.includes('.conflict-') || filename.includes('.snapshot-')) return false
  if (filename === 'globalCategories.json') return false
  return true
}

function handleFileEvent(dir, filename) {
  if (!isTrackedScriptFile(filename)) return
  const id = filename.slice(0, -'.json'.length)
  clearTimeout(debounceTimers[id])
  debounceTimers[id] = setTimeout(() => {
    const filePath = path.join(dir, filename)
    let script
    try {
      if (!fs.existsSync(filePath)) return
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
      script = migrateScript(raw)
    } catch (err) {
      // Unreadable, or caught mid-write — a settled follow-up event (fs.watch
      // reliably fires again once the write completes) will pick it up.
      return
    }
    if (!script || lastKnownUpdatedAt[id] === script.updatedAt) return
    lastKnownUpdatedAt[id] = script.updatedAt
    if (win && !win.isDestroyed()) {
      win.webContents.send('scripts:externalChange', script)
    }
  }, DEBOUNCE_MS)
}

function startWatching(mainWindow) {
  win = mainWindow
  stopWatching()
  const dir = getDocsDir()
  fs.mkdirSync(dir, { recursive: true })
  try {
    watcher = fs.watch(dir, (_eventType, filename) => handleFileEvent(dir, filename))
  } catch (err) {
    // Not fatal — the app still works, it just won't pick up external
    // changes live (they'll still surface as a save conflict later, same
    // as before this feature existed).
    console.error('BijouDocs: could not watch scripts folder for external changes', err)
  }
}

function stopWatching() {
  if (watcher) {
    watcher.close()
    watcher = null
  }
}

// Call right after this app itself writes a script (save or history
// restore) so that write's own fs event doesn't loop back as a fake
// "external" change.
function noteSelfWrite(id, updatedAt) {
  lastKnownUpdatedAt[id] = updatedAt
}

export { startWatching, stopWatching, noteSelfWrite }
