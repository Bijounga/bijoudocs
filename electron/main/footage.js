// Bijou Footage's notes and markers, read-only, for the inspector's Footage
// tab. Bijou Footage (footage-review/, its own app) keeps every review in
// <data>/reviews.json — notes per recording, keyed by the lowercased file
// path — and each project in <projects folder>/<name>/project.json. This
// file only ever reads those; "open at this note" goes to the running app
// over its local bridge (footage-review/electron/main/deckBridge.js), the
// same line the Stream Deck plugin uses.
//
// Footage's data only exists on the computer Footage runs on (the PC), so
// that computer's BijouDocs also publishes a small snapshot of the notes,
// markers and edit sections into <docs folder>/footage-notes/<computer>.json
// — the docs folder is the one that syncs (Google Drive) — and a computer
// with no Footage data of its own (the Mac) reads the newest snapshot instead,
// read-only. A subfolder, because a loose .json in the docs folder would be
// loaded as a script by BijouDocs, its watcher and the Premiere panel.
import fs from 'fs'
import os from 'os'
import net from 'net'
import path from 'path'
import { spawn } from 'child_process'

const DATA_DIRS = [path.join(os.homedir(), '.bijou-footage', 'app'), path.join(process.env.APPDATA || '', 'bijou-footage')]
const DEFAULT_PORT = 47824

function dataDir() {
  return DATA_DIRS.find((d) => fs.existsSync(path.join(d, 'reviews.json'))) || null
}

// Footage swaps reviews.json in with a rename; a read that lands mid-swap
// just retries.
function readJson(file) {
  if (!fs.existsSync(file)) return null
  for (let i = 0; i < 5; i++) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 60)
    }
  }
  return null
}

// Footage's recording keys are lowercased paths on Windows (exact elsewhere);
// folder matching follows the same rule. Keys themselves pass through as-is.
const lower = (p) => (process.platform === 'win32' ? String(p || '').toLowerCase() : String(p || ''))

// A project's recordings: the ones added by hand, plus everything under the
// folders it follows (minus the ones taken out) — the same rule Footage uses.
function projectKeys(p, allKeys) {
  const keys = new Set((p.clipKeys || []).map(lower))
  const folders = (p.folders || []).map((f) => lower(f).replace(/[\\/]+$/, '') + path.sep)
  const excluded = new Set((p.excluded || []).map(lower))
  if (folders.length) {
    for (const k of allKeys) if (!excluded.has(k) && folders.some((f) => k.startsWith(f))) keys.add(k)
  }
  return [...keys]
}

// A project's edit sections (the cuts made in Footage's Edit): clips play
// back to back, each a recording's [in, out) range; markers sit on the cut.
function listSections(folder) {
  const dir = path.join(folder, 'sections')
  let names = []
  try {
    names = fs.readdirSync(dir).filter((f) => f.endsWith('.json'))
  } catch {
    return []
  }
  const out = []
  for (const f of names) {
    const s = readJson(path.join(dir, f))
    if (!s || !s.id) continue
    out.push({
      id: s.id,
      name: s.name || 'Section',
      order: s.order ?? 0,
      clips: (s.clips || []).filter((c) => c && c.key && c.out > c.in).map((c) => ({ id: c.id, key: c.key, in: c.in, out: c.out })),
      markers: (s.markers || []).map((m) => ({ id: m.id, t: m.t, color: m.color || null, text: m.text || '' }))
    })
  }
  return out.sort((a, b) => a.order - b.order)
}

function listProjects(dir, fallback) {
  const out = []
  if (dir) {
    let entries = []
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {}
    for (const d of entries) {
      if (!d.isDirectory()) continue
      const p = readJson(path.join(dir, d.name, 'project.json'))
      if (p && p.id) out.push({ ...p, sections: listSections(path.join(dir, d.name)) })
    }
  }
  // Older Footage versions kept projects inside reviews.json.
  if (!out.length && Array.isArray(fallback)) out.push(...fallback)
  return out.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
}

// A recording's name from its key, whichever computer's path style it is
// (a Windows path read on a Mac has backslashes the Mac's path.basename
// would leave in).
const fileName = (key) => String(key).split(/[\\/]/).pop()

// Footage's own data on this computer, or null when there isn't any.
function readLocal() {
  const dir = dataDir()
  if (!dir) return null
  const data = readJson(path.join(dir, 'reviews.json'))
  if (!data) return { available: false, error: 'unreadable' }
  const reviews = data.reviews || {}
  const allKeys = Object.keys(reviews)
  const recordings = []
  for (const [key, r] of Object.entries(reviews)) {
    const notes = (r && r.notes) || []
    if (!notes.length) continue
    recordings.push({
      key,
      name: fileName(key).replace(/\.[^.]+$/, ''),
      notes: notes
        .filter((n) => n && typeof n.t === 'number' && n.type !== 'BREAK')
        .map((n) => ({ id: n.id, t: n.t, type: n.type, color: n.color || null, text: n.text || '', star: !!n.star, sketch: !!n.sketch, pov: n.pov || null }))
    })
  }
  recordings.sort((a, b) => a.name.localeCompare(b.name))
  const projects = listProjects(data.settings && data.settings.projectsDir, data.projects).map((p) => ({
    id: p.id,
    name: p.name || 'Project',
    bijouScriptId: p.bijouScriptId || null,
    keys: projectKeys(p, allKeys),
    sections: p.sections || []
  }))
  // Beat colours come from the Beat Notes panel's prefs, like in Footage.
  const prefs = readJson(path.join(os.homedir(), '.beatnotes', 'prefs.json'))
  return { available: true, projects, recordings, beatColors: (prefs && prefs.colors) || {} }
}

// ---- the snapshot that crosses to the other computer ----
const SYNC_DIR = 'footage-notes'
const hostId = () => (os.hostname() || 'computer').replace(/[^\w.-]+/g, '_')
let lastPublished = '' // the data last written, to skip a rewrite (and a Drive upload) when nothing changed

// Writes this computer's snapshot into the docs folder; only when there is
// Footage data here, and only when it differs from what's already there.
export function publishFootage(docsDir) {
  if (!docsDir) return false
  const data = readLocal()
  if (!data || !data.available) return false
  const body = JSON.stringify(data)
  if (body === lastPublished) return false
  const file = path.join(docsDir, SYNC_DIR, hostId() + '.json')
  try {
    const cur = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (cur && JSON.stringify(cur.data) === body) {
      lastPublished = body
      return false
    }
  } catch {}
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file + '.tmp', JSON.stringify({ v: 1, host: os.hostname(), at: Date.now(), data }), 'utf8')
  fs.renameSync(file + '.tmp', file)
  lastPublished = body
  return true
}

// The newest snapshot any computer has published, or null.
function readSynced(docsDir) {
  if (!docsDir) return null
  const dir = path.join(docsDir, SYNC_DIR)
  let names = []
  try {
    names = fs.readdirSync(dir).filter((f) => f.endsWith('.json'))
  } catch {
    return null
  }
  let best = null
  for (const f of names) {
    const s = readJson(path.join(dir, f))
    if (s && s.v === 1 && s.data && s.data.available && (!best || s.at > best.at)) best = s
  }
  return best && { ...best.data, source: 'synced', syncedFrom: best.host, syncedAt: best.at }
}

// What the Footage tab shows: this computer's own Footage data when it has
// any, else the synced snapshot from the one that does.
export function loadFootage(docsDir) {
  const local = readLocal()
  if (local) return local.available ? { ...local, source: 'local' } : local
  return readSynced(docsDir) || { available: false }
}

// Pushes 'footage:changed' to the window whenever the notes change: where
// Footage runs, on its saves (and publishes the snapshot); where it doesn't,
// when a new snapshot arrives from the other computer.
let watching = false
export function watchFootage(win, docsDir) {
  if (watching) return
  watching = true
  const send = () => {
    if (!win.isDestroyed()) win.webContents.send('footage:changed')
  }
  const dir = dataDir()
  if (!dir) {
    // No Footage here: check for a newer snapshot every few seconds.
    if (!docsDir) return
    const stamp = () => {
      try {
        const d = path.join(docsDir, SYNC_DIR)
        return fs.readdirSync(d).map((f) => f + fs.statSync(path.join(d, f)).mtimeMs).join('|')
      } catch {
        return ''
      }
    }
    let last = stamp()
    setInterval(() => {
      const now = stamp()
      if (now !== last) {
        last = now
        send()
      }
    }, 6000)
    return
  }
  const reviews = path.join(dir, 'reviews.json')
  try {
    publishFootage(docsDir)
  } catch {}
  let timer = null
  const changed = () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      try {
        publishFootage(docsDir)
      } catch {}
      send()
    }, 400)
  }
  fs.watchFile(reviews, { interval: 1500 }, changed)
  // Edit sections are saved in the projects folder, one file each.
  const data = readJson(reviews)
  const projectsDir = data && data.settings && data.settings.projectsDir
  if (projectsDir && fs.existsSync(projectsDir)) {
    try {
      fs.watch(projectsDir, { recursive: true }, (_ev, file) => {
        if (file && /(^|[\\/])(sections[\\/][^\\/]+|project)\.json$/.test(file)) changed()
      })
    } catch {}
  }
}

// ---- open a note in Bijou Footage ----
// Where to start Bijou Footage from: the path it wrote last time it ran —
// unless that was a dev build (a bare electron binary, which would open an
// empty Electron window) — else the usual install location.
const INSTALLED = process.platform === 'darwin'
  ? ['/Applications/Bijou Footage.app/Contents/MacOS/Bijou Footage']
  : [path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Bijou Footage', 'Bijou Footage.exe'), path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Bijou Footage', 'Bijou Footage.exe')]

function bridgeInfo() {
  const dir = dataDir()
  const info = dir ? readJson(path.join(dir, 'deck-bridge.json')) : null
  const written = info && info.exePath && !/[\\/]electron(\.exe)?$/i.test(info.exePath) ? info.exePath : null
  const exePath = [written, ...INSTALLED].find((p) => p && fs.existsSync(p)) || null
  return { port: (info && info.port) || DEFAULT_PORT, exePath }
}

function ask(port, msg, timeout = 6000) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1')
    let buf = ''
    const done = (fn, v) => {
      clearTimeout(timer)
      socket.destroy()
      fn(v)
    }
    const timer = setTimeout(() => done(reject, new Error('timeout')), timeout)
    socket.setEncoding('utf8')
    socket.on('connect', () => socket.write(JSON.stringify({ ...msg, id: 1 }) + '\n'))
    socket.on('data', (chunk) => {
      buf += chunk
      let nl
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl)
        buf = buf.slice(nl + 1)
        let m
        try {
          m = JSON.parse(line)
        } catch {
          continue
        }
        if (m.type === 'reply' && m.id === 1) return done(resolve, m)
      }
    })
    socket.on('error', (e) => done(reject, e))
  })
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Asks the running Bijou Footage to open the recording at the note. If it
// isn't running, starts it and keeps asking until it answers (~20 s).
// target: { key, t, noteId } for a recording, or { projectId, sectionId, t }
// for an edit section (t in the cut).
export async function openInFootage({ key, t, noteId, projectId, sectionId }) {
  const { port, exePath } = bridgeInfo()
  const msg = { type: 'open', key, t, noteId, projectId, sectionId }
  let launched = false
  // 30 s: long enough for a cold start to scan its library.
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    let r
    try {
      r = await ask(port, msg, 8000)
    } catch (e) {
      if (e && e.message === 'timeout') return { error: 'Bijou Footage didn’t answer' }
      // Nothing listening: start it once, then keep asking.
      if (!launched) {
        if (!exePath || !fs.existsSync(exePath)) return { error: 'Bijou Footage isn’t running' }
        spawn(exePath, [], { detached: true, stdio: 'ignore' }).unref()
        launched = true
      }
      await sleep(500)
      continue
    }
    // Just started: still scanning its library — or its window is still
    // loading, so the bridge timed the request out on its own.
    if (r && (r.error === 'not-ready' || /didn.t answer/.test(r.error || ''))) {
      await sleep(500)
      continue
    }
    // A Bijou Footage from before it understood 'open'.
    if (r && r.error === 'Unknown request') return { error: 'Update Bijou Footage to open notes from here' }
    return r
  }
  return { error: launched ? 'Bijou Footage didn’t start in time' : 'Bijou Footage is still loading — try again' }
}
