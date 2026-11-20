import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { mkLine, mkSection, defaultCategories } from '../lib/model.js'
import { sanitizeHtml, stripHtmlToText, unwrapComment, stripCommentSpans } from '../lib/html.js'
import { uid } from '../lib/id.js'
import { diffWords, flattenText } from '../lib/diff.js'
import { buildExportContent, parseImportedText } from '../lib/exportImport.js'
import { DEFAULT_KEYBINDS } from '../lib/keybinds.js'
import { buildNavList } from '../lib/navigation.js'
import { totalWordCountAll } from '../lib/timecode.js'
import { CHANGELOG, changelogSince } from '../lib/changelog.js'
import { fetchSynonyms } from '../lib/synonyms.js'
import { MAIN_TAB_ID, getPad, nextTabName } from '../lib/scratchNotes.js'
import { presetChain } from '../lib/ideaPresets.js'
import { descendantIds } from '../lib/mapGraph.js'

// addSection's "before the first section" marker.
export const SECTION_AT_START = '__start__'
import { checkSpelling } from '../lib/spellcheck.js'
import { familyOfTheme } from '../lib/themeFamilies.js'
import { mergeExternalScript } from '../lib/externalMerge.js'

const MAX_UNDO = 200 // typing adds a step per word, so this is roomier than it looks
// Which script to land on when there's no explicit choice (launch, or the
// open one was deleted): most recently edited, but never an archived one
// while any unarchived script exists.
const byLandingOrder = (a, b) => (a.archived ? 1 : 0) - (b.archived ? 1 : 0) || b.updatedAt - a.updatedAt
const saveTimers = {}
let savedFlashTimer = null
let updateStatusTimer = null
let scratchSaveTimer = null
// The script's notepad tabs inside a draft, created (with the first tab)
// the first time something is written; a read-only view is getPad().
function scratchPadFor(s, scriptId) {
  if (!s.scratchPads[scriptId]) {
    const base = getPad({}, scriptId)
    s.scratchPads[scriptId] = { tabs: base.tabs.map((t) => ({ ...t })), active: base.active }
  }
  return s.scratchPads[scriptId]
}
// In-memory only, like the prototype's own `clipboardLines` — never persisted.
let clipboardLines = []
// The last arrow-key nudge of map nodes, to fold a run of presses into one undo step.
let lastNudge = { key: '', at: 0 }
// The plain text of those lines as also put on the OS clipboard when they were
// copied (null if the OS clipboard couldn't be written). Ctrl+V pastes the
// lines only while the OS clipboard still holds this — copy something else
// afterwards and a normal paste wins.
let clipboardText = null
const normalizeClip = (t) => String(t || '').replace(/\r\n/g, '\n').trim()
function setClipboardLines(lines) {
  clipboardLines = lines
  clipboardText = lines.map((l) => stripHtmlToText(l.text)).join('\n')
  try {
    navigator.clipboard.writeText(clipboardText).catch(() => {
      clipboardText = null
    })
  } catch (e) {
    clipboardText = null
  }
}

const hasPosition = (n) => Number.isFinite(n.x) && Number.isFinite(n.y)
// Where a map node goes when it has no usable position: just below the
// lowest placed node, lined up with the map's left edge. A NaN position
// saves as null and renders at the origin — Allumeria had two such
// sections ~23,000px from everything else, which made "Fit every node"
// frame mostly empty space.
// ---------- problem frames ----------
// A problem is a labelled box (a node with its own x/y and manualWidth/Height)
// drawn around idea nodes on the map; nothing is hidden. What is inside it is
// worked out from where things sit: a node belongs to the smallest frame its
// centre is in, kept as `parent` so the Outline can nest. Frames can sit inside
// bigger frames (only ever a strictly smaller one in a bigger one).
const FRAME_W = 420
const FRAME_H = 300
// Room a frame leaves around what is in it: the left is wider (the contents sit
// indented under the title, against a rail), the bottom holds the "add" button.
const PAD_L = 56
const PAD_T = 52
const PAD_R = 28
const PAD_B = 56
// The least room a frame keeps around a member it grows for.
const GROW_L = 24
const GROW_T = 46
const GROW_R = 20
const GROW_B = 48
const frameSize = (n) => ({ w: n.manualWidth || FRAME_W, h: n.manualHeight || FRAME_H })
const boxOf = (n) => (n.type === 'problem' ? frameSize(n) : { w: n.width || 220, h: n.height || 150 })

// Membership is sticky: a node joins a frame when it is added in it, grouped into it, or
// dropped with its centre inside it (the smallest such frame), and stays in it however
// far it is dragged afterwards (the frame stretches to hold it) until it is taken out
// on purpose. `evalIds`: the nodes just added/moved, the only ones re-filed by where
// they are; `absorbFrameId`: a frame just drawn/resized, which takes in the free nodes
// it now covers. Always: drop a parent that no longer exists, stretch each frame to
// hold its members, keep one way out per frame. Returns true if anything changed.
function syncFramesIn(nodes, evalIds, absorbFrameId) {
  const frames = Object.entries(nodes)
    // A folded frame is a small card now, so it does not take new nodes in.
    .filter(([, n]) => n.type === 'problem' && hasPosition(n) && !n.folded)
    .map(([id, n]) => ({ id, x: n.x, y: n.y, ...frameSize(n) }))
  let changed = false
  Object.entries(nodes).forEach(([id, n]) => {
    if (n.type !== 'idea' && n.type !== 'problem') return
    if (n.parent !== undefined && !(nodes[n.parent] && nodes[n.parent].type === 'problem')) {
      delete n.parent
      changed = true
    }
    if (!evalIds || !evalIds.has(id) || !hasPosition(n) || !frames.length) return
    const { w, h } = boxOf(n)
    const cx = n.x + w / 2
    const cy = n.y + h / 2
    const myArea = n.type === 'problem' ? w * h : 0
    let best = null
    frames.forEach((f) => {
      if (f.id === id || f.w * f.h <= myArea) return
      if (cx >= f.x && cx <= f.x + f.w && cy >= f.y && cy <= f.y + f.h && (!best || f.w * f.h < best.w * best.h)) best = f
    })
    if (best && n.parent !== best.id) {
      n.parent = best.id
      changed = true
    }
  })
  if (absorbFrameId && nodes[absorbFrameId] && nodes[absorbFrameId].type === 'problem' && !nodes[absorbFrameId].folded) {
    const f = nodes[absorbFrameId]
    const fz = frameSize(f)
    Object.entries(nodes).forEach(([id, n]) => {
      if (id === absorbFrameId || (n.type !== 'idea' && n.type !== 'problem') || n.parent || !hasPosition(n)) return
      const { w, h } = boxOf(n)
      if (n.type === 'problem' && w * h >= fz.w * fz.h) return
      const cx = n.x + w / 2
      const cy = n.y + h / 2
      if (cx >= f.x && cx <= f.x + fz.w && cy >= f.y && cy <= f.y + fz.h) {
        n.parent = absorbFrameId
        changed = true
      }
    })
  }
  // Frames stretch to hold their members (smallest first, so one inside another is
  // already big enough when the bigger one looks).
  frames
    .map((f) => nodes[f.id])
    .sort((a, b) => frameSize(a).w * frameSize(a).h - frameSize(b).w * frameSize(b).h)
    .forEach((f) => {
      const kids = Object.values(nodes).filter((c) => c.parent && nodes[c.parent] === f && hasPosition(c))
      if (!kids.length) return
      const fs = frameSize(f)
      let x1 = f.x
      let y1 = f.y
      let x2 = f.x + fs.w
      let y2 = f.y + fs.h
      kids.forEach((c) => {
        const b = boxOf(c)
        x1 = Math.min(x1, c.x - GROW_L)
        y1 = Math.min(y1, c.y - GROW_T)
        x2 = Math.max(x2, c.x + b.w + GROW_R)
        y2 = Math.max(y2, c.y + b.h + GROW_B)
      })
      if (Math.abs(x1 - f.x) > 0.01 || Math.abs(y1 - f.y) > 0.01 || Math.abs(x2 - x1 - fs.w) > 0.01 || Math.abs(y2 - y1 - fs.h) > 0.01) {
        f.x = x1
        f.y = y1
        f.manualWidth = x2 - x1
        f.manualHeight = y2 - y1
        changed = true
      }
    })
  // A way out belongs to the frame the node is in, one per frame.
  const seen = new Set()
  Object.values(nodes).forEach((n) => {
    if (!n.exit) return
    if (!n.parent || seen.has(n.parent)) {
      delete n.exit
      changed = true
    } else seen.add(n.parent)
  })
  return changed
}

// Problems made by the earlier step-inside version have no box of their own;
// give each one the box that wraps what was inside it.
function migrateProblemFrames(nodes) {
  let changed = false
  Object.entries(nodes).forEach(([id, n]) => {
    if (n.type !== 'problem' || n.manualWidth || !hasPosition(n)) return
    const inside = Object.values(nodes).filter((c) => c.parent === id && c.type !== 'problem' && hasPosition(c))
    if (inside.length) {
      const minX = Math.min(...inside.map((c) => c.x))
      const minY = Math.min(...inside.map((c) => c.y))
      const maxX = Math.max(...inside.map((c) => c.x + (c.width || 220)))
      const maxY = Math.max(...inside.map((c) => c.y + (c.height || 150)))
      n.x = minX - PAD_L
      n.y = minY - PAD_T
      n.manualWidth = maxX - minX + PAD_L + PAD_R
      n.manualHeight = maxY - minY + PAD_T + PAD_B
    } else {
      n.manualWidth = FRAME_W
      n.manualHeight = FRAME_H
    }
    changed = true
  })
  // Its own x/y were for the card; any nested problem boxes were made above, so re-sync after.
  return changed
}

function spotBelowMap(nodes, skip = 0) {
  const placed = Object.values(nodes).filter(hasPosition)
  if (!placed.length) return { x: 60, y: 60 + skip * 190 }
  const x = Math.min(...placed.map((n) => n.x))
  const bottom = Math.max(...placed.map((n) => n.y + (n.height || 140)))
  return { x, y: bottom + 50 + skip * 190 }
}

// A copy of a line (duplicate, copy/paste) carries no comment highlight: the comment stays with the original.
function cleanLineCopy(line) {
  const c = JSON.parse(JSON.stringify(line))
  c.text = stripCommentSpans(c.text)
  return c
}
function cleanSectionCopy(sec) {
  const c = JSON.parse(JSON.stringify(sec))
  ;(c.lines || []).forEach((l) => {
    l.text = stripCommentSpans(l.text)
  })
  return c
}

function snapshotScript(script) {
  return {
    title: script.title,
    comments: JSON.parse(JSON.stringify(script.comments || [])),
    sections: JSON.parse(JSON.stringify(script.sections)),
    categories: JSON.parse(JSON.stringify(script.categories)),
    pinnedSectionIds: JSON.parse(JSON.stringify(script.pinnedSectionIds)),
    mapLayout: JSON.parse(JSON.stringify(script.mapLayout))
  }
}

export const useStore = create(
  immer((set, get) => ({
    loaded: false,
    loadError: null, // set when the scripts folder could not be read at start-up
    scripts: [],
    currentScriptId: null,
    storageDir: '',
    appVersion: '',
    // updatedAt this instance last knew the on-disk copy of each script to
    // have (from loading it, or from this instance's own last successful
    // save) — scheduleSave sends it along so the main process can tell
    // whether something else (this same app, saved from another machine
    // sharing this folder) wrote a change we never saw. Keyed by scriptId.
    diskUpdatedAt: {},
    // scriptId -> backup filename, set when a save just detected exactly
    // that and backed up the version it would otherwise have clobbered.
    saveConflicts: {},
    updateStatus: null, // null | 'checking' | 'available' | 'available-manual' | 'not-available' | 'downloaded' | 'manual-downloading' | 'manual-ready' | 'error'
    updateVersion: null,
    updateErrorMessage: null,

    // ui
    focusMode: false,
    hideTags: false,
    hideNotes: false,
    zoom: 1,
    inspectorTab: 'categories',
    // Comments: the thread being looked at (its highlight and card light up), a counter
    // the shortcut bumps so the floating comment button opens, who you comment as, and
    // whether resolved threads are listed.
    activeCommentId: null,
    commentRequest: 0,
    commentRequestLine: null, // the line a request came from (its button), else the one you are in
    commentAuthor: 'Me',
    commentsShowResolved: false,
    commentsInMargin: true, // open comments float beside their text, like Google Docs
    filterCategory: null,
    librarySearch: '',
    openTagMenuFor: null,
    synonymMenuFor: null,
    synonymMenuWord: '',
    synonymMenuResults: [],
    synonymMenuLoading: false,
    synonymMenuError: null,
    tagMenuHighlight: 0,
    catAddDraft: false,
    savedFlash: false,
    savedFlashText: 'Saved',
    saveStatus: 'idle', // 'idle' | 'pending' | 'saved' | 'error' — drives the persistent Topbar save indicator
    lastSavedAt: null,
    saveHistoryOpen: false,
    saveHistoryScriptId: null,
    saveHistoryEntries: [],
    saveHistoryLoading: false,
    exportMenuOpen: false,

    sectionJumpOpen: false,
    sectionJumpQuery: '',
    sectionJumpHighlight: 0,
    lineSearchOpen: false,
    lineSearchQuery: '',
    lineSearchHighlight: 0,
    jumpHighlightId: null,
    jumpHighlightLineKey: null,
    jumpOutlineHighlightId: null,

    checkpointDraftOpen: false,
    compareSelection: [],
    diffOpen: false,
    diffData: null,

    selectedLines: [],
    selectedSections: [],
    selectAnchor: null,

    keybinds: { ...DEFAULT_KEYBINDS },
    rebindingActionKey: null,

    contextMenu: null,
    // Spellcheck-via-internet state (see checkSpelling in lib/spellcheck.js)
    // — Electron's native context-menu event never reliably delivered
    // misspelledWord/dictionarySuggestions in real use across several
    // attempts, so this is checked ourselves via a real API instead, keyed
    // the same way synonymMenuFor is (a "for" key guards against a slow/
    // late response clobbering a since-closed or since-reopened check).
    spellCheckFor: null,
    spellCheckWord: '',
    spellCheckLoading: false,
    spellCheckMisspelled: false,
    spellCheckSuggestions: [],
    spellCheckError: null,
    spellCheckInDictionary: false,
    // One-shot bridge from ContextMenu.jsx (a globally-mounted singleton
    // with no direct access to MapView's own local selectedNodeIds state)
    // into MapView — set by requestMapSelection, consumed and cleared by
    // MapView's own effect. Never read/written anywhere else.
    mapSelectRequest: null,
    // The problem frame each script's mind map is focused on (not saved): everything
    // outside it is dimmed. null / missing = no focus.
    mapFocus: {},
    mapViewOpen: false,
    mapSplitOpen: false,
    // Mind map only: hides the topbar, tab bar and timeline above it.
    mapHideBars: false,
    outlineViewOpen: false,
    outlineSplitOpen: false,
    whatsNewOpen: false,
    whatsNewVersion: null,
    whatsNewEntries: [],
    lastSeenVersion: null,
    // App-wide (not per-script) — quick-add presets for mind-map idea
    // nodes. Seeded with "But"/"Therefore" (the South Park writing-method
    // pair) on first use, fully user-editable after.
    ideaNodePresets: [
      { id: 'preset-but', label: 'But', color: '#e2665b', shape: 'rectangle' },
      { id: 'preset-therefore', label: 'Therefore', color: '#4fd1c5', shape: 'rectangle' }
    ],
    takesMenuFor: null,
    leftMarginOpen: true,
    rightMarginOpen: true,
    bookmarksMarginOpen: true,
    pinnedMarginOpen: true,
    leftMarginWidth: 210,
    // The right-hand inspector's width (dragged on its left edge), and
    // whether the left library panel is hidden.
    inspectorWidth: 290,
    // The floating notepad: where it sits (x/y null = bottom-right), its size,
    // text zoom, whether the ruled lines show and whether it's open; and its
    // tabs per script (see lib/scratchNotes.js).
    // `detached`: the pad is out of the app window, on its own spot of the desktop (an owned
    // window, see electron/main/padWindow.js); `win` is where that window was last (screen pixels).
    scratchpad: { open: false, x: null, y: null, w: 360, h: 380, zoom: 1, lines: true, detached: false, win: null },
    scratchPads: {},
    // Where each script's mind map was last left: { [scriptId]: { x, y, zoom } }
    // (the pan offset in screen px, and the zoom). App settings, not the
    // script file: moving around the map isn't an edit, so it shouldn't
    // touch the script's "last edited" time or sync between machines.
    mapViews: {},
    // Where you stopped in the Footage tab, per script:
    // { [scriptId]: { projectId, view, rowId, t, text } } — see FootageTab.jsx.
    footageStops: {},
    sidebarHidden: false,
    rightMarginWidth: 210,
    noteColor: '#f2a65a',
    theme: 'dark',
    editorPageContrast: true,
    // Chosen background variation per theme, e.g. { minecraft: 'cave' } —
    // see src/lib/themeVariants.js.
    themeVariants: {},
    // Liquid Glass: how frosted the glass is, 0 (clear) to 100 (frosted).
    glassFrost: 60,
    // The variation last used in each theme family (themeFamilies.js), so clicking a family card goes back to it.
    themeFamilyPick: {},
    // User-made themes — a theme id here is 'custom:' + this entry's own
    // id, so `theme` can point at either a built-in (a plain id, handled
    // via the data-theme attribute + styles.css) or one of these (handled
    // by setting every CSS variable inline instead, in App.jsx) without
    // the two namespaces ever colliding.
    customThemes: [],

    teleprompterOpen: false,
    teleprompterFontSize: 40,
    teleprompterAutoScroll: false,
    teleprompterSpeed: 1,
    teleprompterShowNotes: false,
    teleprompterWidth: 1300,
    teleprompterAlign: 'left',
    teleprompterFont: '',

    undoStack: [],
    redoStack: [],
    undoScriptId: null,

    // Shared category definitions — see fileStore.js's loadGlobalCategories
    // for why these live in the synced scripts folder, not settings.json.
    globalCategories: [],

    // ---------- persistence ----------
    async init() {
      let loaded
      try {
        loaded = await Promise.all([
          window.bijou.loadAllScripts(),
          window.bijou.loadSettings(),
          window.bijou.getDocsDir(),
          window.bijou.getAppVersion(),
          window.bijou.loadGlobalCategories()
        ])
      } catch (e) {
        // Usually the scripts folder can't be reached (a synced drive that is not connected). Say so,
        // with a way forward, instead of sitting on "Loading…" forever.
        let dir = ''
        try {
          dir = await window.bijou.getDocsDir()
        } catch (_) {
          dir = ''
        }
        const msg = String((e && e.message) || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
        set((s) => {
          s.loadError = { message: msg, dir }
        })
        return
      }
      const [scripts, settings, storageDir, appVersion, globalCategories] = loaded
      set((s) => {
        s.loadError = null
      })
      const sorted = scripts.slice().sort(byLandingOrder)
      set((s) => {
        s.scripts = scripts
        s.currentScriptId = sorted.length ? sorted[0].id : null
        s.loaded = true
        s.storageDir = storageDir
        s.appVersion = appVersion
        s.globalCategories = globalCategories || []
        s.diskUpdatedAt = {}
        scripts.forEach((sc) => {
          s.diskUpdatedAt[sc.id] = sc.updatedAt
        })
        if (settings && settings.noteColor) s.noteColor = settings.noteColor
        if (settings && settings.theme) s.theme = settings.theme
        if (settings && typeof settings.editorPageContrast === 'boolean') s.editorPageContrast = settings.editorPageContrast
        if (settings && typeof settings.mapHideBars === 'boolean') s.mapHideBars = settings.mapHideBars
        if (settings && typeof settings.commentAuthor === 'string' && settings.commentAuthor.trim()) s.commentAuthor = settings.commentAuthor.trim()
        if (settings && typeof settings.commentsInMargin === 'boolean') s.commentsInMargin = settings.commentsInMargin
        if (settings && settings.themeVariants && typeof settings.themeVariants === 'object') s.themeVariants = settings.themeVariants
        if (settings && typeof settings.glassFrost === 'number') s.glassFrost = settings.glassFrost
        if (settings && settings.themeFamilyPick && typeof settings.themeFamilyPick === 'object') s.themeFamilyPick = settings.themeFamilyPick
        if (settings && Array.isArray(settings.customThemes)) s.customThemes = settings.customThemes
        if (settings && typeof settings.zoom === 'number') s.zoom = settings.zoom
        if (settings && settings.leftMarginWidth) s.leftMarginWidth = settings.leftMarginWidth
        if (settings && typeof settings.inspectorWidth === 'number') s.inspectorWidth = settings.inspectorWidth
        if (settings && settings.scratchpad && typeof settings.scratchpad === 'object') s.scratchpad = { ...s.scratchpad, ...settings.scratchpad }
        if (settings && settings.scratchPads && typeof settings.scratchPads === 'object') s.scratchPads = settings.scratchPads
        if (settings && settings.mapViews && typeof settings.mapViews === 'object') s.mapViews = settings.mapViews
        if (settings && settings.footageStops && typeof settings.footageStops === 'object') s.footageStops = settings.footageStops
        // The notepad used to keep a single note per script (scratchNotes);
        // each becomes that script's first tab. The old key is rewritten empty
        // on the next save, in the same write that stores the tabs.
        if (settings && settings.scratchNotes && typeof settings.scratchNotes === 'object') {
          for (const [id, body] of Object.entries(settings.scratchNotes)) {
            if (typeof body === 'string' && body && !s.scratchPads[id]) {
              s.scratchPads[id] = { tabs: [{ id: MAIN_TAB_ID, name: 'Notes', body }], active: MAIN_TAB_ID }
            }
          }
        }
        if (settings && typeof settings.sidebarHidden === 'boolean') s.sidebarHidden = settings.sidebarHidden
        if (settings && settings.rightMarginWidth) s.rightMarginWidth = settings.rightMarginWidth
        if (settings && settings.ideaNodePresets) s.ideaNodePresets = settings.ideaNodePresets
        // Spread saved overrides onto the current defaults rather than
        // replacing wholesale — a saved keybinds object can predate an
        // action added since (e.g. mapLinkNodes), and a plain overwrite
        // would leave that action with no combo at all instead of falling
        // back to its default.
        if (settings && settings.keybinds) s.keybinds = { ...DEFAULT_KEYBINDS, ...settings.keybinds }
        // Booleans need an explicit-presence check, not a truthy check — a
        // saved `false` (the user left a panel closed) is a real, meaningful
        // value, not "unset," so `if (settings.leftMarginOpen)` would wrongly
        // skip applying it and silently reopen the panel every launch.
        if (settings && typeof settings.leftMarginOpen === 'boolean') s.leftMarginOpen = settings.leftMarginOpen
        if (settings && typeof settings.rightMarginOpen === 'boolean') s.rightMarginOpen = settings.rightMarginOpen
        if (settings && typeof settings.bookmarksMarginOpen === 'boolean') s.bookmarksMarginOpen = settings.bookmarksMarginOpen
        if (settings && typeof settings.pinnedMarginOpen === 'boolean') s.pinnedMarginOpen = settings.pinnedMarginOpen
        s.lastSeenVersion = appVersion
      })
      // Registered once per app launch (init() only ever runs once) — fires
      // whenever a script's file changes on disk from outside this app
      // instance, currently only the Premiere extension.
      window.bijou.onExternalScriptChange((script) => get().applyExternalScriptChange(script))
      // Links from outside (the Premiere panel's "show in BijouDocs"). Registered
      // after the library has loaded; linkReady() releases one that was waiting.
      window.bijou.onOpenLink((link) => get().openLink(link))
      window.bijou.linkReady()
      // A missing lastSeenVersion means one of two very different things:
      // either this is a genuinely brand-new install (no scripts yet —
      // showing a changelog before the user has done anything would just
      // be confusing), or it's an existing user whose app simply predates
      // this feature (this project's whole history so far, until now) —
      // for them, skipping the popup silently would mean never showing it
      // for the version that introduced it, which is exactly the "I didn't
      // see anything" gap this branch exists to close. Only the true
      // fresh-install case is skipped; an existing user instead sees just
      // the current version's own entry, since there's no real prior
      // version on file to compute a since-then range from.
      if (settings && settings.lastSeenVersion && settings.lastSeenVersion !== appVersion) {
        const entries = changelogSince(settings.lastSeenVersion, appVersion)
        if (entries.length) {
          set((s) => {
            s.whatsNewOpen = true
            s.whatsNewVersion = appVersion
            s.whatsNewEntries = entries
          })
        }
      } else if ((!settings || !settings.lastSeenVersion) && scripts.length > 0 && CHANGELOG[appVersion]) {
        set((s) => {
          s.whatsNewOpen = true
          s.whatsNewVersion = appVersion
          s.whatsNewEntries = CHANGELOG[appVersion]
        })
      }
      get().saveAppSettings()
      if (sorted.length) get().ensureDailyRollover(sorted[0].id)
    },
    closeWhatsNew() {
      set((s) => {
        s.whatsNewOpen = false
      })
    },
    // Switches which folder scripts are read from/saved to (e.g. a Google
    // Drive/Dropbox/iCloud folder, for syncing scripts across machines).
    // The main process copies over anything the old folder had that the
    // new one doesn't before we reload, so nothing gets stranded.
    async chooseStorageDir() {
      const result = await window.bijou.chooseStorageDir()
      if (result.canceled) return false
      await get().init()
      return true
    },
    async resetStorageDir() {
      await window.bijou.resetStorageDir()
      await get().init()
    },
    revealScriptInFolder(id) {
      window.bijou.revealInFolder(id)
    },
    // Checked ourselves via a real spellcheck API (lib/spellcheck.js) —
    // the word itself is already known at call time, captured from the
    // real right-click the same way synonym lookups are (see
    // captureWordSelection in lineRefs.js). The `key` guard on the
    // resolve stops a slow/late-arriving check from clobbering the menu
    // if the user closed it and right-clicked somewhere else before it
    // came back.
    runSpellCheck(key, word) {
      set((s) => {
        s.spellCheckFor = key
        s.spellCheckWord = word
        s.spellCheckLoading = true
        s.spellCheckMisspelled = false
        s.spellCheckSuggestions = []
        s.spellCheckError = null
        s.spellCheckInDictionary = false
      })
      checkSpelling(word).then(
        (result) => {
          set((s) => {
            if (s.spellCheckFor !== key) return
            s.spellCheckMisspelled = result.misspelled
            s.spellCheckSuggestions = result.suggestions
            s.spellCheckLoading = false
          })
        },
        () => {
          set((s) => {
            if (s.spellCheckFor !== key) return
            s.spellCheckError = "Couldn't check spelling — check your connection."
            s.spellCheckLoading = false
          })
        }
      )
      // Separate from the LanguageTool check above (and never blocks it) —
      // LanguageTool has no idea what's in the user's own local Chromium
      // dictionary, so a remembered word can still legitimately come back
      // "misspelled" from it. Checked independently so the menu can offer
      // "Remove from dictionary" instead of "Add" regardless of what
      // LanguageTool itself thinks.
      window.bijou.listDictionaryWords().then((words) => {
        set((s) => {
          if (s.spellCheckFor !== key) return
          s.spellCheckInDictionary = words.includes(word)
        })
      })
    },
    closeSpellCheck() {
      set((s) => {
        s.spellCheckFor = null
      })
    },
    addWordToDictionary(word) {
      window.bijou.addWordToDictionary(word)
      set((s) => {
        s.spellCheckFor = null
      })
    },
    removeWordFromDictionary(word) {
      window.bijou.removeFromDictionary(word)
      set((s) => {
        s.spellCheckFor = null
      })
    },
    setUpdateStatus(payload) {
      set((s) => {
        s.updateStatus = payload.state
        if (payload.version) s.updateVersion = payload.version
        s.updateErrorMessage = payload.state === 'error' ? payload.message || null : null
      })
      clearTimeout(updateStatusTimer)
      // 'checking' and 'not-available' are transient status text (next to
      // the version number) rather than something that should sit there
      // indefinitely. 'available'/'downloaded' persist until acted on.
      // 'error' persists too (dismissed manually) — long enough to actually
      // read, since it means something real needs attention.
      if (payload.state === 'checking' || payload.state === 'not-available') {
        updateStatusTimer = setTimeout(() => {
          set((s) => {
            if (s.updateStatus === payload.state) s.updateStatus = null
          })
        }, 2500)
      }
    },
    dismissUpdateStatus() {
      set((s) => {
        s.updateStatus = null
      })
    },
    checkForUpdates() {
      window.bijou.checkForUpdatesNow()
    },
    downloadManualUpdate(version) {
      window.bijou.downloadManualUpdate(version)
    },
    installUpdate() {
      window.bijou.installUpdateNow()
    },
    // Persisted app-wide settings are saved as one whole object, so every
    // setter here goes through this rather than calling saveSettings with
    // just its own field — otherwise setting the note color would wipe out
    // a saved margin width, and vice versa.
    saveAppSettings() {
      const s = get()
      window.bijou.saveSettings({
        noteColor: s.noteColor,
        theme: s.theme,
        editorPageContrast: s.editorPageContrast,
        mapHideBars: s.mapHideBars,
        commentAuthor: s.commentAuthor,
        commentsInMargin: s.commentsInMargin,
        themeVariants: s.themeVariants,
        glassFrost: s.glassFrost,
        themeFamilyPick: s.themeFamilyPick,
        customThemes: s.customThemes,
        zoom: s.zoom,
        leftMarginWidth: s.leftMarginWidth,
        inspectorWidth: s.inspectorWidth,
        scratchpad: s.scratchpad,
        scratchPads: s.scratchPads,
        mapViews: s.mapViews,
        footageStops: s.footageStops,
        scratchNotes: {},
        sidebarHidden: s.sidebarHidden,
        rightMarginWidth: s.rightMarginWidth,
        leftMarginOpen: s.leftMarginOpen,
        rightMarginOpen: s.rightMarginOpen,
        bookmarksMarginOpen: s.bookmarksMarginOpen,
        pinnedMarginOpen: s.pinnedMarginOpen,
        ideaNodePresets: s.ideaNodePresets,
        lastSeenVersion: s.lastSeenVersion,
        keybinds: s.keybinds
      })
    },
    setNoteColor(color) {
      set((s) => {
        s.noteColor = color
      })
      get().saveAppSettings()
    },
    setTheme(theme) {
      const fam = familyOfTheme(theme)
      set((s) => {
        s.theme = theme
        if (fam) s.themeFamilyPick[fam.id] = theme
      })
      get().saveAppSettings()
    },
    // Only a CSS variable changes (App.jsx), so dragging the slider repaints the glass and nothing else.
    setGlassFrost(v) {
      const n = Math.max(0, Math.min(100, Math.round(v)))
      set((s) => {
        s.glassFrost = n
      })
      get().saveAppSettings()
    },
    setThemeVariant(theme, variantId) {
      set((s) => {
        s.themeVariants[theme] = variantId
      })
      get().saveAppSettings()
    },
    saveCustomTheme(name, colors) {
      const id = 'custom:' + uid()
      set((s) => {
        s.customThemes.push({ id, name: name || 'My theme', colors })
        s.theme = id
      })
      get().saveAppSettings()
      return id
    },
    updateCustomTheme(id, colors) {
      set((s) => {
        const t = s.customThemes.find((ct) => ct.id === id)
        if (t) t.colors = colors
      })
      get().saveAppSettings()
    },
    renameCustomTheme(id, name) {
      set((s) => {
        const t = s.customThemes.find((ct) => ct.id === id)
        if (t) t.name = name || 'My theme'
      })
      get().saveAppSettings()
    },
    deleteCustomTheme(id) {
      set((s) => {
        s.customThemes = s.customThemes.filter((ct) => ct.id !== id)
        if (s.theme === id) s.theme = 'dark'
      })
      get().saveAppSettings()
    },
    toggleEditorPageContrast() {
      set((s) => {
        s.editorPageContrast = !s.editorPageContrast
      })
      get().saveAppSettings()
    },
    setLeftMarginWidth(width) {
      set((s) => {
        s.leftMarginWidth = Math.max(160, Math.min(420, Math.round(width)))
      })
      get().saveAppSettings()
    },
    // save: false while dragging — saved once on release.
    setInspectorWidth(width, save = true) {
      set((s) => {
        s.inspectorWidth = Math.max(240, Math.min(720, Math.round(width)))
      })
      if (save) get().saveAppSettings()
    },
    toggleScratchpad() {
      set((s) => {
        s.scratchpad.open = !s.scratchpad.open
      })
      get().saveAppSettings()
    },
    closeScratchpad() {
      set((s) => {
        s.scratchpad.open = false
      })
      get().saveAppSettings()
    },
    // Moves the notepad out of the app window onto the desktop (any monitor), or back in.
    detachScratchpad() {
      set((s) => {
        s.scratchpad.detached = true
        s.scratchpad.open = true
      })
      get().saveAppSettings()
    },
    dockScratchpad() {
      set((s) => {
        s.scratchpad.detached = false
        s.scratchpad.open = true
      })
      get().saveAppSettings()
    },
    setPadWindowBounds(b) {
      set((s) => {
        s.scratchpad.win = { x: b.x, y: b.y, width: b.width, height: b.height }
      })
      get().saveAppSettings()
    },
    // What the notepad window changed (its pages, text size, ruled lines): the app window keeps the real copy.
    applyPadFromWindow(p) {
      if (!p || !p.scriptId || !p.book) return
      set((s) => {
        s.scratchPads[p.scriptId] = p.book
        if (p.scratchpad) {
          if (typeof p.scratchpad.zoom === 'number') s.scratchpad.zoom = p.scratchpad.zoom
          if (typeof p.scratchpad.lines === 'boolean') s.scratchpad.lines = p.scratchpad.lines
        }
      })
      get().saveAppSettings()
    },
    // { x, y } and/or { w, h }.
    setScratchpadRect(rect) {
      set((s) => {
        Object.assign(s.scratchpad, rect)
      })
      get().saveAppSettings()
    },
    // step: +0.1 / -0.1 from the current size, or null to reset.
    zoomScratchpad(step) {
      set((s) => {
        s.scratchpad.zoom = step == null ? 1 : Math.round(Math.max(0.7, Math.min(3, s.scratchpad.zoom + step)) * 10) / 10
      })
      get().saveAppSettings()
    },
    toggleScratchpadLines() {
      set((s) => {
        s.scratchpad.lines = !s.scratchpad.lines
      })
      get().saveAppSettings()
    },
    // Typing writes the open tab's body and saves a moment after you stop
    // (and flushScratchpad on blur).
    setScratchText(scriptId, body) {
      set((s) => {
        const pad = scratchPadFor(s, scriptId)
        const tab = pad.tabs.find((t) => t.id === pad.active) || pad.tabs[0]
        tab.body = body
      })
      clearTimeout(scratchSaveTimer)
      scratchSaveTimer = setTimeout(() => get().saveAppSettings(), 600)
    },
    setScratchTab(scriptId, tabId) {
      set((s) => {
        const pad = scratchPadFor(s, scriptId)
        if (pad.tabs.some((t) => t.id === tabId)) pad.active = tabId
      })
      get().saveAppSettings()
    },
    addScratchTab(scriptId) {
      set((s) => {
        const pad = scratchPadFor(s, scriptId)
        const id = uid()
        pad.tabs.push({ id, name: nextTabName(pad.tabs), body: '' })
        pad.active = id
      })
      get().saveAppSettings()
    },
    renameScratchTab(scriptId, tabId, name) {
      const clean = String(name || '').trim().slice(0, 24)
      if (!clean) return
      set((s) => {
        const tab = scratchPadFor(s, scriptId).tabs.find((t) => t.id === tabId)
        if (tab) tab.name = clean
      })
      get().saveAppSettings()
    },
    // Closing the only tab empties it instead (a notepad always has a page).
    closeScratchTab(scriptId, tabId) {
      set((s) => {
        const pad = scratchPadFor(s, scriptId)
        const i = pad.tabs.findIndex((t) => t.id === tabId)
        if (i < 0) return
        if (pad.tabs.length === 1) {
          pad.tabs[0].body = ''
          pad.tabs[0].name = 'Notes'
          return
        }
        pad.tabs.splice(i, 1)
        if (pad.active === tabId) pad.active = pad.tabs[Math.min(i, pad.tabs.length - 1)].id
      })
      get().saveAppSettings()
    },
    flushScratchpad() {
      if (scratchSaveTimer) {
        clearTimeout(scratchSaveTimer)
        scratchSaveTimer = null
        get().saveAppSettings()
      }
    },
    toggleSidebarHidden() {
      set((s) => {
        s.sidebarHidden = !s.sidebarHidden
      })
      get().saveAppSettings()
    },
    setRightMarginWidth(width) {
      set((s) => {
        s.rightMarginWidth = Math.max(160, Math.min(420, Math.round(width)))
      })
      get().saveAppSettings()
    },
    addIdeaNodePreset(label, color, shape) {
      set((s) => {
        s.ideaNodePresets.push({ id: uid(), label, color, shape: shape || 'rectangle' })
      })
      get().saveAppSettings()
    },
    deleteIdeaNodePreset(id) {
      set((s) => {
        s.ideaNodePresets = s.ideaNodePresets.filter((p) => p.id !== id)
        // Whatever chained into it just stops chaining.
        s.ideaNodePresets.forEach((p) => {
          if (p.then === id) p.then = null
        })
      })
      get().saveAppSettings()
    },
    updateIdeaNodePreset(id, patch) {
      set((s) => {
        const preset = s.ideaNodePresets.find((p) => p.id === id)
        if (preset) Object.assign(preset, patch)
      })
      get().saveAppSettings()
    },

    scheduleSave(id, { flash = true, text = 'Saved', delay = 250 } = {}) {
      set((s) => {
        s.saveStatus = 'pending'
      })
      clearTimeout(saveTimers[id])
      saveTimers[id] = setTimeout(() => {
        get().performSave(id, { flash, text })
      }, delay)
    },
    // Shared by the debounced path above and forceSave below — the only
    // difference is forceSave skips the debounce timer and always writes a
    // fresh snapshot regardless of the usual ~5-minute throttle, so it
    // doubles as a deliberate "checkpoint this moment" action.
    async performSave(id, { flash = true, text = 'Saved', forceSnapshot = false } = {}) {
      const script = get().scripts.find((s) => s.id === id)
      if (!script) return
      try {
        const expected = get().diskUpdatedAt[id]
        const result = await window.bijou.saveScript(script, expected != null ? expected : null, { forceSnapshot })
        set((s) => {
          s.diskUpdatedAt[id] = result.updatedAt
          if (result.conflict) s.saveConflicts[id] = result.backupFile
          s.saveStatus = 'saved'
          s.lastSavedAt = Date.now()
        })
        if (flash) get().flashSaved(text)
      } catch (err) {
        console.error('BijouDocs: save failed', err)
        set((s) => {
          s.saveStatus = 'error'
        })
      }
    },
    // The "force save" button — writes right now instead of waiting out the
    // debounce, and always drops a snapshot even if one was taken recently,
    // so it's a reliable way to deliberately checkpoint before doing
    // something risky (not just a reassurance click).
    forceSave(id) {
      clearTimeout(saveTimers[id])
      return get().performSave(id, { flash: true, text: 'Saved', forceSnapshot: true })
    },
    // A script's file changed on disk from outside this app instance —
    // currently only the Premiere extension (premiere-extension/), tagging/
    // noting/checking-off lines directly. See src/lib/externalMerge.js for
    // exactly which fields this is allowed to touch (never anything an
    // in-progress edit in this app's own editor could be holding).
    applyExternalScriptChange(incoming) {
      set((s) => {
        const idx = s.scripts.findIndex((sc) => sc.id === incoming.id)
        if (idx === -1) {
          s.scripts.push(incoming)
        } else {
          mergeExternalScript(s.scripts[idx], incoming)
        }
        s.diskUpdatedAt[incoming.id] = incoming.updatedAt
      })
      if (get().currentScriptId === incoming.id) {
        const nodes = Object.values((incoming.mapLayout && incoming.mapLayout.nodes) || {})
        const fromFootage = nodes.some((n) => n && n.importedFrom === 'bijou-footage' && Date.now() - (n.importedAt || 0) < 10000)
        get().flashSaved(fromFootage ? 'Updated from Bijou Footage' : 'Updated from Premiere')
      }
    },
    dismissSaveConflict(id) {
      set((s) => {
        delete s.saveConflicts[id]
      })
    },
    async openSaveHistory(id) {
      set((s) => {
        s.saveHistoryOpen = true
        s.saveHistoryScriptId = id
        s.saveHistoryEntries = []
        s.saveHistoryLoading = true
      })
      const entries = await window.bijou.getSaveHistory(id)
      set((s) => {
        if (s.saveHistoryScriptId !== id) return // closed/switched before this resolved
        s.saveHistoryEntries = entries
        s.saveHistoryLoading = false
      })
    },
    closeSaveHistory() {
      set((s) => {
        s.saveHistoryOpen = false
        s.saveHistoryScriptId = null
        s.saveHistoryEntries = []
      })
    },
    // Restoring rewrites the script's real file on disk (backing up
    // whatever was there first, so this is itself always undoable the same
    // way) and swaps this instance's in-memory copy for the result — a
    // pushUndo first means an accidental restore can also just be Ctrl+Z'd
    // without needing to go back into history again.
    async restoreFromSaveHistory(id, file) {
      get().pushUndo(id)
      const restored = await window.bijou.restoreFromHistory(id, file)
      set((s) => {
        const idx = s.scripts.findIndex((sc) => sc.id === id)
        if (idx >= 0) s.scripts[idx] = restored
        s.diskUpdatedAt[id] = restored.updatedAt
        s.saveHistoryOpen = false
        s.saveHistoryScriptId = null
        s.saveHistoryEntries = []
      })
      get().flashSaved('Restored')
    },

    flashSaved(text) {
      set((s) => {
        s.savedFlash = true
        s.savedFlashText = text || 'Saved'
      })
      clearTimeout(savedFlashTimer)
      savedFlashTimer = setTimeout(() => {
        set((s) => {
          s.savedFlash = false
        })
      }, 1400)
    },

    // ---------- selectors ----------
    currentScript() {
      const { scripts, currentScriptId } = get()
      return scripts.find((s) => s.id === currentScriptId) || null
    },

    // ---------- undo/redo ----------
    // Snapshots are taken at the *start* of an edit (field focus, or right
    // before a discrete structural mutation), matching the prototype: undo
    // steps back to before-you-started-this-change, not per keystroke.
    pushUndo(scriptId) {
      const script = get().scripts.find((s) => s.id === scriptId)
      if (!script) return
      set((s) => {
        if (s.undoScriptId !== scriptId) {
          s.undoStack = []
          s.redoStack = []
          s.undoScriptId = scriptId
        }
        s.undoStack.push(snapshotScript(script))
        if (s.undoStack.length > MAX_UNDO) s.undoStack.shift()
        s.redoStack = []
      })
    },

    undo() {
      const { undoScriptId, undoStack } = get()
      if (!undoScriptId || !undoStack.length) return
      const script = get().scripts.find((s) => s.id === undoScriptId)
      if (!script) return
      set((s) => {
        const idx = s.scripts.findIndex((sc) => sc.id === undoScriptId)
        s.redoStack.push(snapshotScript(s.scripts[idx]))
        const snap = s.undoStack.pop()
        s.scripts[idx].title = snap.title
        s.scripts[idx].sections = snap.sections
        s.scripts[idx].categories = snap.categories
        s.scripts[idx].pinnedSectionIds = snap.pinnedSectionIds
        s.scripts[idx].mapLayout = snap.mapLayout
        s.scripts[idx].comments = snap.comments || []
        s.scripts[idx].updatedAt = Date.now()
        s.openTagMenuFor = null
      })
      get().scheduleSave(undoScriptId, { text: 'Undo' })
    },

    redo() {
      const { undoScriptId, redoStack } = get()
      if (!undoScriptId || !redoStack.length) return
      const script = get().scripts.find((s) => s.id === undoScriptId)
      if (!script) return
      set((s) => {
        const idx = s.scripts.findIndex((sc) => sc.id === undoScriptId)
        s.undoStack.push(snapshotScript(s.scripts[idx]))
        const snap = s.redoStack.pop()
        s.scripts[idx].title = snap.title
        s.scripts[idx].sections = snap.sections
        s.scripts[idx].categories = snap.categories
        s.scripts[idx].pinnedSectionIds = snap.pinnedSectionIds
        s.scripts[idx].mapLayout = snap.mapLayout
        s.scripts[idx].comments = snap.comments || []
        s.scripts[idx].updatedAt = Date.now()
        s.openTagMenuFor = null
      })
      get().scheduleSave(undoScriptId, { text: 'Redo' })
    },

    // ---------- library ----------
    async openScript(id) {
      set((s) => {
        s.currentScriptId = id
        s.filterCategory = null
        // A globalId-linked category can have drifted from the shared
        // definition since this script was last opened (edited from a
        // different script that was open at the same time) — pull it
        // fresh now rather than leaving it stale until the next relaunch.
        const script = s.scripts.find((sc) => sc.id === id)
        if (script) {
          script.categories.forEach((cat) => {
            if (!cat.globalId) return
            const g = s.globalCategories.find((gc) => gc.id === cat.globalId)
            if (!g) return
            cat.label = g.label
            cat.color = g.color
            cat.spoken = g.spoken
            cat.teleprompterNote = g.teleprompterNote
          })
        }
      })
      get().ensureDailyRollover(id)
    },

    async newScript() {
      const script = await window.bijou.newBlankScript('Untitled script')
      set((s) => {
        s.scripts.push(script)
        s.currentScriptId = script.id
        s.diskUpdatedAt[script.id] = script.updatedAt
      })
      get().scheduleSave(script.id, { flash: false })
    },

    async deleteScript(id) {
      await window.bijou.deleteScript(id)
      set((s) => {
        s.scripts = s.scripts.filter((sc) => sc.id !== id)
        if (s.currentScriptId === id) {
          const sorted = s.scripts.slice().sort(byLandingOrder)
          s.currentScriptId = sorted.length ? sorted[0].id : null
        }
        delete s.diskUpdatedAt[id]
        delete s.saveConflicts[id]
      })
    },

    togglePin(id) {
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === id)
        if (script) {
          script.pinned = !script.pinned
          script.updatedAt = Date.now()
        }
      })
      get().scheduleSave(id, { flash: false })
    },
    // Archiving only tucks a finished script away into the sidebar's
    // Archived group — nothing is deleted, and it stays fully editable.
    toggleArchive(id) {
      let title = ''
      let archived = false
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === id)
        if (!script) return
        script.archived = !script.archived
        script.archivedAt = script.archived ? Date.now() : null
        script.updatedAt = Date.now()
        title = script.title
        archived = script.archived
      })
      get().scheduleSave(id, { flash: false })
      if (title) get().flashSaved((archived ? 'Archived ' : 'Restored ') + '"' + title + '"')
    },
    setScriptDueDate(id, dueDate) {
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === id)
        if (script) {
          script.dueDate = dueDate || null
          script.updatedAt = Date.now()
        }
      })
      get().scheduleSave(id, { flash: false })
    },

    setLibrarySearch(q) {
      set((s) => {
        s.librarySearch = q
      })
    },

    // ---------- title ----------
    setScriptTitle(id, title) {
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === id)
        if (script) script.title = title
      })
    },
    commitScriptTitle(id) {
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === id)
        if (script) script.updatedAt = Date.now()
      })
      get().scheduleSave(id)
    },

    // ---------- simple UI toggles ----------
    toggleFocusMode() {
      set((s) => {
        s.focusMode = !s.focusMode
      })
    },
    toggleHideTags() {
      set((s) => {
        s.hideTags = !s.hideTags
      })
    },
    toggleHideNotes() {
      set((s) => {
        s.hideNotes = !s.hideNotes
      })
    },
    zoomIn() {
      set((s) => {
        s.zoom = Math.min(1.6, Math.round((s.zoom + 0.1) * 100) / 100)
      })
      get().saveAppSettings()
    },
    zoomOut() {
      set((s) => {
        s.zoom = Math.max(0.7, Math.round((s.zoom - 0.1) * 100) / 100)
      })
      get().saveAppSettings()
    },
    collapseAll(scriptId) {
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (!script) return
        const anyOpen = script.sections.some((sec) => !sec.collapsed)
        script.sections.forEach((sec) => {
          sec.collapsed = anyOpen
        })
      })
    },
    setInspectorTab(tab) {
      set((s) => {
        s.inspectorTab = tab
      })
    },
    setFilterCategory(id) {
      set((s) => {
        s.filterCategory = s.filterCategory === id ? null : id
      })
    },
    clearFilter() {
      set((s) => {
        s.filterCategory = null
      })
    },

    // ---------- sections ----------
    // afterSectionId: a section id to insert after, SECTION_AT_START to insert
    // before the first one, or nothing to append.
    addSection(scriptId, afterSectionId) {
      get().pushUndo(scriptId)
      let newId = null
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (!script) return
        const sec = mkSection('New section', [mkLine('', null)])
        newId = sec.id
        let idx = script.sections.length
        if (afterSectionId === SECTION_AT_START) idx = 0
        else if (afterSectionId) {
          const i = script.sections.findIndex((se) => se.id === afterSectionId)
          if (i >= 0) idx = i + 1
        }
        script.sections.splice(idx, 0, sec)
        script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
      return newId
    },

    deleteSection(scriptId, sectionId) {
      get().deleteSections(scriptId, [sectionId])
    },
    // Also clears anything in the mind map or the pinned margin that
    // pointed at these sections — a gap in the original mind-map/pinned
    // batches: deleting a section from the normal editor left its map node
    // and any edges to/from it, or a stale pin, dangling with no section
    // behind them.
    deleteSections(scriptId, sectionIds) {
      get().pushUndo(scriptId)
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (!script) return
        const idSet = new Set(sectionIds)
        script.sections = script.sections.filter((se) => !idSet.has(se.id))
        if (script.sections.length === 0) script.sections.push(mkSection('New section', [mkLine('', null)]))
        idSet.forEach((id) => delete script.mapLayout.nodes[id])
        script.mapLayout.edges = script.mapLayout.edges.filter((e) => !idSet.has(e.from) && !idSet.has(e.to))
        if (idSet.has(script.mapLayout.mainThreadId)) script.mapLayout.mainThreadId = null
        script.pinnedSectionIds = script.pinnedSectionIds.filter((id) => !idSet.has(id))
        script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
    },

    toggleSectionCollapsed(scriptId, sectionId) {
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const sec = script && script.sections.find((se) => se.id === sectionId)
        if (sec) sec.collapsed = !sec.collapsed
      })
    },
    toggleSectionDone(scriptId, sectionId) {
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const sec = script && script.sections.find((se) => se.id === sectionId)
        if (sec) sec.done = !sec.done
        if (script) script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
    },

    moveSection(scriptId, sectionId, dir) {
      get().pushUndo(scriptId)
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (!script) return
        const idx = script.sections.findIndex((se) => se.id === sectionId)
        const newIdx = idx + dir
        if (idx < 0 || newIdx < 0 || newIdx >= script.sections.length) return
        const [moved] = script.sections.splice(idx, 1)
        script.sections.splice(newIdx, 0, moved)
        script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
    },

    setSectionHeading(scriptId, sectionId, heading) {
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const sec = script && script.sections.find((se) => se.id === sectionId)
        if (sec) sec.heading = heading
      })
    },
    commitSectionHeading(scriptId, sectionId) {
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (script) script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId)
    },

    setSectionColor(scriptId, sectionId, color) {
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const sec = script && script.sections.find((se) => se.id === sectionId)
        if (sec) sec.titleColor = color
        if (script) script.updatedAt = Date.now()
      })
    },
    commitSectionColor(scriptId) {
      get().pushUndo(scriptId)
      get().scheduleSave(scriptId, { flash: false })
    },

    // ---------- checklist open (checkpoints-for-this-section panel toggle only) ----------
    toggleSectionChecklistOpen(scriptId, sectionId) {
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const sec = script && script.sections.find((se) => se.id === sectionId)
        if (sec) sec.checklistOpen = !sec.checklistOpen
      })
    },

    // ---------- lines ----------
    // Subsections: turn a line into a small heading for the lines after it (or back).
    toggleSubsection(scriptId, sectionId, lineId) {
      get().pushUndo(scriptId)
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const sec = script && script.sections.find((se) => se.id === sectionId)
        const line = sec && sec.lines.find((l) => l.id === lineId)
        if (!line) return
        if (line.sub) {
          delete line.sub
          delete line.subCollapsed
        } else {
          line.sub = true
          line.indent = 0
        }
        script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
    },
    toggleSubCollapsed(scriptId, sectionId, lineId) {
      get().pushUndo(scriptId)
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const sec = script && script.sections.find((se) => se.id === sectionId)
        const line = sec && sec.lines.find((l) => l.id === lineId)
        if (!line || !line.sub) return
        if (line.subCollapsed) delete line.subCollapsed
        else line.subCollapsed = true
        script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
    },
    // A new, empty subsection heading after a line (or at the end of the section). Returns its line key.
    addSubsection(scriptId, sectionId, afterLineId) {
      get().pushUndo(scriptId)
      let newKey = null
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const sec = script && script.sections.find((se) => se.id === sectionId)
        if (!sec) return
        const line = mkLine('', null)
        line.sub = true
        let idx = sec.lines.length
        if (afterLineId) {
          const i = sec.lines.findIndex((l) => l.id === afterLineId)
          if (i >= 0) idx = i + 1
        }
        sec.lines.splice(idx, 0, line)
        script.updatedAt = Date.now()
        newKey = sectionId + ':' + line.id
      })
      get().scheduleSave(scriptId, { flash: false })
      return newKey
    },
    addLine(scriptId, sectionId, afterLineId) {
      get().pushUndo(scriptId)
      let newKey = null
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const sec = script && script.sections.find((se) => se.id === sectionId)
        if (!sec) return
        const line = mkLine('', null)
        let idx = sec.lines.length
        if (afterLineId) {
          const i = sec.lines.findIndex((l) => l.id === afterLineId)
          if (i >= 0) {
            idx = i + 1
            line.indent = sec.lines[i].indent
          }
        }
        sec.lines.splice(idx, 0, line)
        script.updatedAt = Date.now()
        newKey = sectionId + ':' + line.id
      })
      get().scheduleSave(scriptId, { flash: false })
      return newKey
    },

    deleteLine(scriptId, sectionId, lineId) {
      get().pushUndo(scriptId)
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const sec = script && script.sections.find((se) => se.id === sectionId)
        if (!sec) return
        const line = sec.lines.find((l) => l.id === lineId)
        if (sec.lines.length <= 1) {
          if (line) {
            line.text = ''
            line.categoryId = null
            line.note = ''
          }
        } else {
          sec.lines = sec.lines.filter((l) => l.id !== lineId)
        }
        script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
    },

    // Commits sanitized HTML from the contentEditable on blur.
    commitLineText(scriptId, sectionId, lineId, html) {
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const sec = script && script.sections.find((se) => se.id === sectionId)
        const line = sec && sec.lines.find((l) => l.id === lineId)
        if (line) line.text = sanitizeHtml(html)
        if (script) script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId)
    },

    // ---------- comments ----------
    // A comment thread: { id, sectionId, lineId, quote, author, createdAt, resolved, messages: [{id, author, text, at}] }.
    // Its highlight is a span (data-cmt = the thread id) in the line's own HTML, so it moves with the text.
    // The caller has already wrapped the text and saved the line (and pushed the undo step).
    addComment(scriptId, { commentId, sectionId, lineId, quote, text }) {
      const me = get().commentAuthor || 'Me'
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (!script) return
        if (!script.comments) script.comments = []
        const now = Date.now()
        script.comments.push({
          id: commentId,
          sectionId,
          lineId,
          quote: (quote || '').slice(0, 400),
          author: me,
          createdAt: now,
          resolved: false,
          messages: [{ id: uid(), author: me, text, at: now }]
        })
        script.updatedAt = now
      })
      get().scheduleSave(scriptId)
    },
    replyToComment(scriptId, threadId, text) {
      const t = (text || '').trim()
      if (!t) return
      get().pushUndo(scriptId)
      const me = get().commentAuthor || 'Me'
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const th = script && (script.comments || []).find((c) => c.id === threadId)
        if (!th) return
        th.messages.push({ id: uid(), author: me, text: t, at: Date.now() })
        script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId)
    },
    toggleCommentResolved(scriptId, threadId) {
      get().pushUndo(scriptId)
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const th = script && (script.comments || []).find((c) => c.id === threadId)
        if (!th) return
        th.resolved = !th.resolved
        if (th.resolved) th.resolvedAt = Date.now()
        else delete th.resolvedAt
        script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId)
    },
    // Removes a thread and takes its highlight off the text.
    deleteComment(scriptId, threadId) {
      get().pushUndo(scriptId)
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (!script) return
        const th = (script.comments || []).find((c) => c.id === threadId)
        if (!th) return
        script.comments = script.comments.filter((c) => c.id !== threadId)
        script.sections.forEach((sec) =>
          sec.lines.forEach((l) => {
            if (l.text && l.text.indexOf(threadId) >= 0) l.text = unwrapComment(l.text, threadId)
          })
        )
        if (s.activeCommentId === threadId) s.activeCommentId = null
        script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId)
    },
    // Removes one message; the last message of a thread takes the thread with it.
    deleteCommentMessage(scriptId, threadId, messageId) {
      const script = get().scripts.find((sc) => sc.id === scriptId)
      const th = script && (script.comments || []).find((c) => c.id === threadId)
      if (!th) return
      if (th.messages.length <= 1) {
        get().deleteComment(scriptId, threadId)
        return
      }
      get().pushUndo(scriptId)
      set((s) => {
        const sc = s.scripts.find((x) => x.id === scriptId)
        const t = sc.comments.find((c) => c.id === threadId)
        t.messages = t.messages.filter((m) => m.id !== messageId)
        sc.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId)
    },
    setActiveComment(id) {
      set((s) => {
        s.activeCommentId = id || null
      })
    },
    // Opens the Comments tab on a thread (clicking its highlight, or finishing a new comment).
    focusComment(id) {
      set((s) => {
        s.activeCommentId = id || null
        s.inspectorTab = 'comments'
      })
    },
    requestComment(lineKey) {
      set((s) => {
        s.commentRequestLine = lineKey || null
        s.commentRequest += 1
      })
    },
    setCommentAuthor(name) {
      set((s) => {
        s.commentAuthor = name
      })
      get().saveAppSettings()
    },
    toggleCommentsInMargin() {
      set((s) => {
        s.commentsInMargin = !s.commentsInMargin
      })
      get().saveAppSettings()
    },
    toggleCommentsShowResolved() {
      set((s) => {
        s.commentsShowResolved = !s.commentsShowResolved
      })
    },

    setLineTag(scriptId, sectionId, lineId, categoryId) {
      get().pushUndo(scriptId)
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const sec = script && script.sections.find((se) => se.id === sectionId)
        const line = sec && sec.lines.find((l) => l.id === lineId)
        if (line) line.categoryId = categoryId || null
        if (script) script.updatedAt = Date.now()
      })
      set((s) => {
        s.openTagMenuFor = null
      })
      get().scheduleSave(scriptId)
    },

    toggleLineNote(scriptId, sectionId, lineId) {
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const sec = script && script.sections.find((se) => se.id === sectionId)
        const line = sec && sec.lines.find((l) => l.id === lineId)
        if (line) line.noteOpen = !line.noteOpen
      })
    },
    // An explicit "set closed" rather than toggleLineNote's flip — needed
    // because a line's note can now be open in two mounted views at once
    // (the main editor stays mounted underneath the Teleprompter, not
    // unmounted by it), each with its own NoteBox instance and its own
    // outside-click-to-close effect. Two toggle() calls on the same real
    // click would cancel out (open->closed->open again); two closeLineNote()
    // calls are idempotent. NoteBox.jsx uses this for its own self-closing
    // paths (outside click, Enter, Escape) — the various "open" call sites
    // (note-trigger button, note-preview click) keep using toggleLineNote,
    // since they only ever fire while a note is currently closed anyway.
    closeLineNote(scriptId, sectionId, lineId) {
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const sec = script && script.sections.find((se) => se.id === sectionId)
        const line = sec && sec.lines.find((l) => l.id === lineId)
        if (line) line.noteOpen = false
      })
    },
    setLineNote(scriptId, sectionId, lineId, note) {
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const sec = script && script.sections.find((se) => se.id === sectionId)
        const line = sec && sec.lines.find((l) => l.id === lineId)
        if (line) line.note = note
      })
    },
    commitLineNote(scriptId, sectionId, lineId) {
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (script) script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId)
    },
    clearAndCloseNote(scriptId, sectionId, lineId) {
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const sec = script && script.sections.find((se) => se.id === sectionId)
        const line = sec && sec.lines.find((l) => l.id === lineId)
        if (line) {
          line.noteOpen = false
          line.note = ''
        }
      })
      get().scheduleSave(scriptId, { flash: false })
    },

    toggleLineDone(scriptId, sectionId, lineId) {
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const sec = script && script.sections.find((se) => se.id === sectionId)
        const line = sec && sec.lines.find((l) => l.id === lineId)
        if (line) line.done = !line.done
        if (script) script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
    },
    toggleLineBookmark(scriptId, sectionId, lineId) {
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const sec = script && script.sections.find((se) => se.id === sectionId)
        const line = sec && sec.lines.find((l) => l.id === lineId)
        if (line) line.bookmarked = !line.bookmarked
        if (script) script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
    },
    // "Where I left off" in the script itself, line-granularity — separate
    // from the Outline's own resumeOutlineNodeId since the two views work
    // at different granularity (a specific line vs. a whole outline item).
    // Toggles: marking the already-marked line clears it.
    toggleResumeLine(scriptId, sectionId, lineId) {
      const key = sectionId + ':' + lineId
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (!script) return
        script.resumeLineKey = script.resumeLineKey === key ? null : key
        script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
    },
    toggleResumeOutlineNode(scriptId, nodeId) {
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (!script) return
        script.resumeOutlineNodeId = script.resumeOutlineNodeId === nodeId ? null : nodeId
        script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
    },

    indentLine(scriptId, sectionId, lineId, dir) {
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const sec = script && script.sections.find((se) => se.id === sectionId)
        const line = sec && sec.lines.find((l) => l.id === lineId)
        if (line) line.indent = dir > 0 ? Math.min(6, line.indent + 1) : Math.max(0, line.indent - 1)
        if (script) script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
    },

    // Enter: splits the line's content at the caret — text before stays put,
    // text after moves to a new line right below it (beforeHtml/afterHtml
    // come from splitting the live contentEditable DOM, so a caret at the
    // very start yields an empty current line and pushes the whole line
    // down, same as any normal text editor).
    splitLineOnEnter(scriptId, sectionId, lineId, beforeHtml, afterHtml) {
      let newKey = null
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const sec = script && script.sections.find((se) => se.id === sectionId)
        if (!sec) return
        const idx = sec.lines.findIndex((l) => l.id === lineId)
        if (idx < 0) return
        if (beforeHtml !== undefined) sec.lines[idx].text = sanitizeHtml(beforeHtml)
        // Enter in a folded subsection heading opens it, so the new line is not hidden.
        if (sec.lines[idx].sub && sec.lines[idx].subCollapsed) delete sec.lines[idx].subCollapsed
        const line = mkLine(afterHtml !== undefined ? sanitizeHtml(afterHtml) : '', null)
        line.indent = sec.lines[idx].indent
        sec.lines.splice(idx + 1, 0, line)
        script.updatedAt = Date.now()
        newKey = sectionId + ':' + line.id
      })
      get().scheduleSave(scriptId, { flash: false })
      return newKey
    },

    // Backspace at start of an empty line (with siblings): delete it, focus
    // the line above (or the new first line).
    deleteEmptyLineBackspace(scriptId, sectionId, lineId) {
      get().pushUndo(scriptId)
      let focusKey = null
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const sec = script && script.sections.find((se) => se.id === sectionId)
        if (!sec) return
        const idx = sec.lines.findIndex((l) => l.id === lineId)
        if (idx < 0) return
        focusKey = idx > 0 ? sectionId + ':' + sec.lines[idx - 1].id : null
        sec.lines.splice(idx, 1)
        if (!focusKey && sec.lines.length > 0) focusKey = sectionId + ':' + sec.lines[0].id
        script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
      return focusKey
    },

    // Backspace at start of a non-empty line (idx>0): merge into the
    // previous line's text, delete this one, caret lands at the join point.
    mergeLineIntoPrevious(scriptId, sectionId, lineId, currentHtml) {
      get().pushUndo(scriptId)
      let result = null
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const sec = script && script.sections.find((se) => se.id === sectionId)
        if (!sec) return
        const idx = sec.lines.findIndex((l) => l.id === lineId)
        if (idx <= 0) return
        const prev = sec.lines[idx - 1]
        // A blank line directly above is just spacing, not a sentence to
        // weld onto — backspacing here should close that gap (delete the
        // blank line), not merge the current sentence's text into it and
        // leave the two run together as if they'd always been one line.
        if (stripHtmlToText(prev.text).trim() === '') {
          sec.lines.splice(idx - 1, 1)
          script.updatedAt = Date.now()
          result = { key: sectionId + ':' + lineId, offset: 0 }
          return
        }
        const prevLen = stripHtmlToText(prev.text).length
        prev.text = (prev.text || '') + sanitizeHtml(currentHtml || '')
        sec.lines.splice(idx, 1)
        script.updatedAt = Date.now()
        result = { key: sectionId + ':' + prev.id, offset: prevLen }
      })
      get().scheduleSave(scriptId, { flash: false })
      return result
    },

    // Delete key: always removes the whole current line (not char-delete),
    // focus lands at the end of the line above.
    deleteWholeLine(scriptId, sectionId, lineId) {
      get().pushUndo(scriptId)
      let focusKey = null
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const sec = script && script.sections.find((se) => se.id === sectionId)
        if (!sec) return
        const idx = sec.lines.findIndex((l) => l.id === lineId)
        if (idx < 0) return
        if (sec.lines.length > 1) {
          focusKey = idx > 0 ? sectionId + ':' + sec.lines[idx - 1].id : null
          sec.lines.splice(idx, 1)
          if (!focusKey && sec.lines.length > 0) focusKey = sectionId + ':' + sec.lines[0].id
        } else {
          const line = sec.lines[0]
          line.text = ''
          line.categoryId = null
          line.note = ''
          line.struck = false
          line.noteOpen = false
          focusKey = sectionId + ':' + line.id
        }
        script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
      return focusKey
    },

    // Outdent via Backspace at indent>0, caret at start.
    outdentLine(scriptId, sectionId, lineId) {
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const sec = script && script.sections.find((se) => se.id === sectionId)
        const line = sec && sec.lines.find((l) => l.id === lineId)
        if (line) line.indent = Math.max(0, line.indent - 1)
        if (script) script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
    },

    // ---------- categories ----------
    openAddCategoryDraft() {
      set((s) => {
        s.catAddDraft = true
      })
    },
    cancelAddCategoryDraft() {
      set((s) => {
        s.catAddDraft = false
      })
    },
    confirmAddCategory(scriptId, name, color, isGlobal) {
      get().pushUndo(scriptId)
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (!script) return
        const label = name || 'New category'
        const col = color || '#7FA9F2'
        if (isGlobal) {
          const globalId = uid()
          s.globalCategories.push({ id: globalId, label, color: col, spoken: true })
          script.categories.push({ id: uid(), globalId, label, color: col, spoken: true })
        } else {
          script.categories.push({ id: uid(), label, color: col, spoken: true })
        }
        s.catAddDraft = false
      })
      if (isGlobal) get().saveGlobalCategoriesFile()
      get().scheduleSave(scriptId, { flash: false })
    },
    // Links an existing script-local category to a shared definition —
    // creates the shared entry from the local one's current label/color,
    // future edits to either then flow through setCategoryColor/Label's
    // globalId mirroring below.
    promoteCategoryToGlobal(scriptId, categoryId) {
      get().pushUndo(scriptId)
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const cat = script && script.categories.find((c) => c.id === categoryId)
        if (!cat || cat.globalId) return
        const globalId = uid()
        cat.globalId = globalId
        s.globalCategories.push({
          id: globalId,
          label: cat.label,
          color: cat.color,
          spoken: cat.spoken !== false,
          teleprompterNote: !!cat.teleprompterNote
        })
        script.updatedAt = Date.now()
      })
      get().saveGlobalCategoriesFile()
      get().scheduleSave(scriptId, { flash: false })
    },
    // Detaches a local category from its shared definition — it keeps its
    // current label/color but stops following future edits made elsewhere.
    // The shared definition itself is untouched (other scripts may still
    // use it).
    unlinkCategoryFromGlobal(scriptId, categoryId) {
      get().pushUndo(scriptId)
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const cat = script && script.categories.find((c) => c.id === categoryId)
        if (cat) delete cat.globalId
        if (script) script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
    },
    // Adds a local, globalId-linked copy of an existing shared category to
    // this script — the "use this global category here too" action.
    addExistingGlobalCategoryToScript(scriptId, globalId) {
      get().pushUndo(scriptId)
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const g = s.globalCategories.find((gc) => gc.id === globalId)
        if (!script || !g) return
        if (script.categories.some((c) => c.globalId === globalId)) return
        script.categories.push({
          id: uid(),
          globalId: g.id,
          label: g.label,
          color: g.color,
          spoken: g.spoken !== false,
          teleprompterNote: !!g.teleprompterNote
        })
        script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
    },
    saveGlobalCategoriesFile() {
      window.bijou.saveGlobalCategories(get().globalCategories)
    },
    setCategoryColor(scriptId, categoryId, color) {
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const cat = script && script.categories.find((c) => c.id === categoryId)
        if (cat) {
          cat.color = color
          // A globalId-linked category is a live-shared definition, not a
          // one-time copy — editing it here should update every other
          // script that also uses it, the next time each one loads/saves.
          if (cat.globalId) {
            const g = s.globalCategories.find((gc) => gc.id === cat.globalId)
            if (g) g.color = color
          }
        }
        if (script) script.updatedAt = Date.now()
      })
    },
    commitCategoryColor(scriptId) {
      get().pushUndo(scriptId)
      get().saveGlobalCategoriesFile()
      get().scheduleSave(scriptId, { flash: false })
    },
    setCategoryLabel(scriptId, categoryId, label) {
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const cat = script && script.categories.find((c) => c.id === categoryId)
        if (cat) {
          cat.label = label
          if (cat.globalId) {
            const g = s.globalCategories.find((gc) => gc.id === cat.globalId)
            if (g) g.label = label
          }
        }
      })
    },
    commitCategoryLabel(scriptId) {
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (script) script.updatedAt = Date.now()
      })
      get().saveGlobalCategoriesFile()
      get().scheduleSave(scriptId)
    },
    // Whether lines tagged with this category count toward the spoken-word
    // runtime and appear in the teleprompter (e.g. On-Screen Text is not
    // spoken by default; a brand-new category defaults to spoken).
    toggleCategorySpoken(scriptId, categoryId) {
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const cat = script && script.categories.find((c) => c.id === categoryId)
        if (cat) cat.spoken = !(cat.spoken !== false)
        if (script) script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
    },
    // Only meaningful for a silent (spoken:false) category — instead of
    // being skipped in the teleprompter entirely, its lines show as a
    // small italicized note (a stage direction), not full-size spoken text.
    toggleCategoryTeleprompterNote(scriptId, categoryId) {
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const cat = script && script.categories.find((c) => c.id === categoryId)
        if (cat) cat.teleprompterNote = !cat.teleprompterNote
        if (script) script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
    },
    deleteCategory(scriptId, categoryId) {
      get().pushUndo(scriptId)
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (!script) return
        script.categories = script.categories.filter((c) => c.id !== categoryId)
        script.sections.forEach((sec) => sec.lines.forEach((l) => {
          if (l.categoryId === categoryId) l.categoryId = null
        }))
        script.updatedAt = Date.now()
        if (s.filterCategory === categoryId) s.filterCategory = null
      })
      get().scheduleSave(scriptId, { flash: false })
    },

    // ---------- tag menu ----------
    openTagMenu(key) {
      set((s) => {
        s.openTagMenuFor = s.openTagMenuFor === key ? null : key
        s.tagMenuHighlight = 0
      })
    },
    closeTagMenu() {
      set((s) => {
        s.openTagMenuFor = null
      })
    },

    // ---------- synonym lookup ----------
    // `word` is already known at call time (captured from the live
    // selection right when the lookup was triggered — see
    // captureWordSelection in lineRefs.js) — this just handles showing
    // the popup and fetching. The `key` guard on both resolve branches
    // stops a slow/late-arriving fetch from clobbering the menu if the
    // user closed it and opened a different one before it came back.
    openSynonymMenu(key, word) {
      set((s) => {
        s.synonymMenuFor = key
        s.synonymMenuWord = word
        s.synonymMenuResults = []
        s.synonymMenuLoading = true
        s.synonymMenuError = null
      })
      fetchSynonyms(word).then(
        (results) => {
          set((s) => {
            if (s.synonymMenuFor !== key) return
            s.synonymMenuResults = results
            s.synonymMenuLoading = false
          })
        },
        () => {
          set((s) => {
            if (s.synonymMenuFor !== key) return
            s.synonymMenuError = "Couldn't look that up — check your connection."
            s.synonymMenuLoading = false
          })
        }
      )
    },
    closeSynonymMenu() {
      set((s) => {
        s.synonymMenuFor = null
      })
    },
    setTagMenuHighlight(i) {
      set((s) => {
        s.tagMenuHighlight = i
      })
    },

    // ---------- tabs ----------
    navigateTab(scriptId, tabId) {
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (!script) return
        if (!script.tabHistory) {
          script.tabHistory = [script.activeTabId]
          script.tabHistoryIndex = 0
        }
        if (tabId === script.activeTabId) return
        script.tabHistory = script.tabHistory.slice(0, script.tabHistoryIndex + 1)
        script.tabHistory.push(tabId)
        script.tabHistoryIndex = script.tabHistory.length - 1
        script.activeTabId = tabId
      })
      get().scheduleSave(scriptId, { flash: false })
    },
    openSectionTab(scriptId, sectionId) {
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (script && !script.openTabs.includes(sectionId)) script.openTabs.push(sectionId)
      })
      get().navigateTab(scriptId, sectionId)
    },
    closeTab(scriptId, tabId) {
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (!script) return
        script.openTabs = script.openTabs.filter((id) => id !== tabId)
        if (script.activeTabId === tabId) script.activeTabId = 'all'
      })
      get().scheduleSave(scriptId, { flash: false })
    },
    setActiveTab(scriptId, tabId) {
      get().navigateTab(scriptId, tabId)
    },
    tabBack(scriptId) {
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (!script || !script.tabHistory || script.tabHistoryIndex <= 0) return
        script.tabHistoryIndex -= 1
        script.activeTabId = script.tabHistory[script.tabHistoryIndex]
      })
    },
    tabForward(scriptId) {
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (!script || !script.tabHistory || script.tabHistoryIndex >= script.tabHistory.length - 1) return
        script.tabHistoryIndex += 1
        script.activeTabId = script.tabHistory[script.tabHistoryIndex]
      })
    },
    cycleTabs(scriptId, dir) {
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (!script) return
        const ids = ['all'].concat(script.openTabs)
        const idx = ids.indexOf(script.activeTabId)
        script.activeTabId = ids[(idx + dir + ids.length) % ids.length]
      })
    },

    // ---------- section jump / line search ----------
    toggleSectionJump() {
      set((s) => {
        s.sectionJumpOpen = !s.sectionJumpOpen
        s.sectionJumpHighlight = 0
      })
    },
    closeSectionJump() {
      set((s) => {
        s.sectionJumpOpen = false
      })
    },
    setSectionJumpQuery(q) {
      set((s) => {
        s.sectionJumpQuery = q
        s.sectionJumpHighlight = 0
      })
    },
    setSectionJumpHighlight(i) {
      set((s) => {
        s.sectionJumpHighlight = i
      })
    },
    toggleLineSearch() {
      set((s) => {
        s.lineSearchOpen = !s.lineSearchOpen
        s.lineSearchHighlight = 0
      })
    },
    closeLineSearch() {
      set((s) => {
        s.lineSearchOpen = false
      })
    },
    setLineSearchQuery(q) {
      set((s) => {
        s.lineSearchQuery = q
        s.lineSearchHighlight = 0
      })
    },
    setLineSearchHighlight(i) {
      set((s) => {
        s.lineSearchHighlight = i
      })
    },
    jumpToSection(scriptId, sectionId, openAsTab) {
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const sec = script && script.sections.find((se) => se.id === sectionId)
        if (sec) sec.collapsed = false
      })
      if (openAsTab) {
        get().openSectionTab(scriptId, sectionId)
      } else {
        get().navigateTab(scriptId, 'all')
        set((s) => {
          s.jumpHighlightId = sectionId
        })
        setTimeout(() => {
          set((s) => {
            s.jumpHighlightId = null
          })
        }, 1200)
      }
      set((s) => {
        s.sectionJumpOpen = false
        s.sectionJumpQuery = ''
      })
    },
    // A bijoudocs:// link: show this script, and the section / line in it.
    async openLink({ scriptId, sectionId, lineId }) {
      const script = get().scripts.find((sc) => sc.id === scriptId)
      if (!script) {
        get().flashSaved("That script isn't in this library")
        return
      }
      set((s) => {
        // Map / outline views replace the editor, which is where the line is.
        s.mapViewOpen = false
        s.mapSplitOpen = false
        s.outlineViewOpen = false
        s.outlineSplitOpen = false
      })
      if (get().currentScriptId !== scriptId) await get().openScript(scriptId)
      if (sectionId && lineId) get().jumpToLine(scriptId, sectionId, lineId)
      else if (sectionId) get().jumpToSection(scriptId, sectionId, false)
    },
    jumpToLine(scriptId, sectionId, lineId) {
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const sec = script && script.sections.find((se) => se.id === sectionId)
        if (sec) sec.collapsed = false
      })
      const script = get().scripts.find((sc) => sc.id === scriptId)
      if (script && script.activeTabId !== 'all' && script.activeTabId !== sectionId) {
        get().navigateTab(scriptId, 'all')
      }
      const key = sectionId + ':' + lineId
      set((s) => {
        s.jumpHighlightLineKey = key
        s.lineSearchOpen = false
        s.lineSearchQuery = ''
      })
      setTimeout(() => {
        set((s) => {
          s.jumpHighlightLineKey = null
        })
      }, 1200)
    },
    // Scrolls straight to the script's resume-point line (see
    // toggleResumeLine) — a no-op if none is set, so the keybind/button
    // calling this is always safe to press regardless of state.
    jumpToResumeLine(scriptId) {
      const script = get().scripts.find((sc) => sc.id === scriptId)
      if (!script || !script.resumeLineKey) return
      const [secId, lineId] = script.resumeLineKey.split(':')
      get().jumpToLine(scriptId, secId, lineId)
    },
    // Outline equivalent — no real "line" to reuse jumpToLine's machinery
    // for, so this is its own small flash-highlight, same 1.2s timing.
    jumpToResumeOutlineNode(scriptId) {
      const script = get().scripts.find((sc) => sc.id === scriptId)
      if (!script || !script.resumeOutlineNodeId) return
      set((s) => {
        s.jumpOutlineHighlightId = script.resumeOutlineNodeId
      })
      setTimeout(() => {
        set((s) => {
          s.jumpOutlineHighlightId = null
        })
      }, 1200)
    },

    // ---------- section checklist items ----------
    addCheckItem(scriptId, sectionId, text) {
      if (!text || !text.trim()) return
      get().pushUndo(scriptId)
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const sec = script && script.sections.find((se) => se.id === sectionId)
        if (!sec) return
        sec.checklist.push({ id: uid(), text: text.trim(), done: false })
        script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
    },
    toggleCheckItem(scriptId, sectionId, itemId) {
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const sec = script && script.sections.find((se) => se.id === sectionId)
        const item = sec && sec.checklist.find((i) => i.id === itemId)
        if (item) item.done = !item.done
      })
      get().scheduleSave(scriptId, { flash: false })
    },
    setCheckItemText(scriptId, sectionId, itemId, text) {
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const sec = script && script.sections.find((se) => se.id === sectionId)
        const item = sec && sec.checklist.find((i) => i.id === itemId)
        if (item) item.text = text
      })
    },
    commitCheckItemText(scriptId) {
      get().scheduleSave(scriptId)
    },
    deleteCheckItem(scriptId, sectionId, itemId) {
      get().pushUndo(scriptId)
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const sec = script && script.sections.find((se) => se.id === sectionId)
        if (!sec) return
        sec.checklist = sec.checklist.filter((i) => i.id !== itemId)
        script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
    },
    promoteCheckItem(scriptId, sectionId, itemId) {
      get().pushUndo(scriptId)
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const sec = script && script.sections.find((se) => se.id === sectionId)
        if (!sec) return
        const item = sec.checklist.find((i) => i.id === itemId)
        if (!item) return
        sec.lines.push(mkLine(item.text, item.categoryId || null))
        sec.checklist = sec.checklist.filter((i) => i.id !== itemId)
        script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
    },

    // ---------- version-history checkpoints ----------
    openCheckpointDraft() {
      set((s) => {
        s.checkpointDraftOpen = true
      })
    },
    confirmCheckpoint(scriptId, name) {
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (!script) return
        script.checkpoints.push({ id: uid(), name: name || 'Checkpoint', at: Date.now(), snapshot: JSON.parse(JSON.stringify(script.sections)) })
        s.checkpointDraftOpen = false
      })
      get().scheduleSave(scriptId, { flash: false })
    },
    restoreCheckpoint(scriptId, checkpointId) {
      get().pushUndo(scriptId)
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const cp = script && script.checkpoints.find((c) => c.id === checkpointId)
        if (!cp || !script) return
        script.sections = JSON.parse(JSON.stringify(cp.snapshot))
        script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId)
    },
    toggleCompare(checkpointId) {
      set((s) => {
        const idx = s.compareSelection.indexOf(checkpointId)
        if (idx >= 0) s.compareSelection.splice(idx, 1)
        else {
          if (s.compareSelection.length >= 2) s.compareSelection.shift()
          s.compareSelection.push(checkpointId)
        }
      })
    },
    compareCheckpoints(scriptId) {
      const script = get().scripts.find((sc) => sc.id === scriptId)
      const sel = get().compareSelection
      if (!script || sel.length !== 2) return
      const cpA = script.checkpoints.find((c) => c.id === sel[0])
      const cpB = script.checkpoints.find((c) => c.id === sel[1])
      if (!cpA || !cpB) return
      const chrono = cpA.at <= cpB.at ? [cpA, cpB] : [cpB, cpA]
      const diff = diffWords(flattenText(chrono[0].snapshot), flattenText(chrono[1].snapshot))
      set((s) => {
        s.diffData = { a: chrono[0].name, b: chrono[1].name, diff }
        s.diffOpen = true
      })
    },
    closeDiff() {
      set((s) => {
        s.diffOpen = false
      })
    },

    // ---------- drag-and-drop reordering ----------
    // `position` is 'before' | 'after' the target — driven by which half of
    // the target the pointer was over (see src/hooks/useDropIndicator.js).
    reorderLine(scriptId, sectionId, fromLineId, toLineId, position = 'before') {
      if (fromLineId === toLineId) return
      get().pushUndo(scriptId)
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const sec = script && script.sections.find((se) => se.id === sectionId)
        if (!sec) return
        const fromIdx = sec.lines.findIndex((l) => l.id === fromLineId)
        if (fromIdx < 0) return
        // A subsection heading carries the lines under it (up to the next heading).
        let count = 1
        if (sec.lines[fromIdx].sub) {
          while (fromIdx + count < sec.lines.length && !sec.lines[fromIdx + count].sub) count++
        }
        if (sec.lines.slice(fromIdx, fromIdx + count).some((l) => l.id === toLineId)) return
        const moved = sec.lines.splice(fromIdx, count)
        const toIdx = sec.lines.findIndex((l) => l.id === toLineId)
        const insertIdx = toIdx < 0 ? sec.lines.length : position === 'after' ? toIdx + 1 : toIdx
        sec.lines.splice(insertIdx, 0, ...moved)
        script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
    },
    reorderSection(scriptId, fromSectionId, toSectionId, position = 'before') {
      if (fromSectionId === toSectionId) return
      get().pushUndo(scriptId)
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (!script) return
        const fromIdx = script.sections.findIndex((se) => se.id === fromSectionId)
        if (fromIdx < 0) return
        const [moved] = script.sections.splice(fromIdx, 1)
        const toIdx = script.sections.findIndex((se) => se.id === toSectionId)
        const insertIdx = toIdx < 0 ? script.sections.length : position === 'after' ? toIdx + 1 : toIdx
        script.sections.splice(insertIdx, 0, moved)
        script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
    },
    reorderCheckItem(scriptId, sectionId, fromItemId, toItemId, position = 'before') {
      get().pushUndo(scriptId)
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const sec = script && script.sections.find((se) => se.id === sectionId)
        if (!sec) return
        const fromIdx = sec.checklist.findIndex((i) => i.id === fromItemId)
        if (fromIdx < 0) return
        const [moved] = sec.checklist.splice(fromIdx, 1)
        const toIdx = sec.checklist.findIndex((i) => i.id === toItemId)
        const insertIdx = toIdx < 0 ? sec.checklist.length : position === 'after' ? toIdx + 1 : toIdx
        sec.checklist.splice(insertIdx, 0, moved)
        script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
    },
    moveLineToChecklist(scriptId, fromSectionId, lineId, toSectionId) {
      get().pushUndo(scriptId)
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const fromSec = script && script.sections.find((se) => se.id === fromSectionId)
        const toSec = script && script.sections.find((se) => se.id === toSectionId)
        if (!fromSec || !toSec) return
        const idx = fromSec.lines.findIndex((l) => l.id === lineId)
        if (idx < 0) return
        const [moved] = fromSec.lines.splice(idx, 1)
        // The tag, note, done state and any Premiere marker link come along.
        toSec.checklist.push({
          id: uid(),
          text: stripHtmlToText(moved.text),
          done: !!moved.done,
          ...(moved.categoryId ? { categoryId: moved.categoryId } : {}),
          ...(moved.note ? { note: moved.note } : {}),
          ...(moved.marker ? { marker: moved.marker } : {})
        })
        script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
    },
    moveCheckItemToLine(scriptId, fromSectionId, itemId, toSectionId, beforeLineId) {
      get().pushUndo(scriptId)
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const fromSec = script && script.sections.find((se) => se.id === fromSectionId)
        const toSec = script && script.sections.find((se) => se.id === toSectionId)
        if (!fromSec || !toSec) return
        const itemIdx = fromSec.checklist.findIndex((i) => i.id === itemId)
        if (itemIdx < 0) return
        const item = fromSec.checklist[itemIdx]
        const toLineIdx = beforeLineId ? toSec.lines.findIndex((l) => l.id === beforeLineId) : -1
        toSec.lines.splice(toLineIdx >= 0 ? toLineIdx : toSec.lines.length, 0, mkLine(item.text, null))
        fromSec.checklist.splice(itemIdx, 1)
        script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
    },
    moveCheckItemToSectionEnd(scriptId, fromSectionId, itemId, toSectionId) {
      get().pushUndo(scriptId)
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const fromSec = script && script.sections.find((se) => se.id === fromSectionId)
        const toSec = script && script.sections.find((se) => se.id === toSectionId)
        if (!fromSec || !toSec) return
        const itemIdx = fromSec.checklist.findIndex((i) => i.id === itemId)
        if (itemIdx < 0) return
        const item = fromSec.checklist[itemIdx]
        toSec.lines.push(mkLine(item.text, null))
        fromSec.checklist.splice(itemIdx, 1)
        script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
    },

    // ---------- export / import ----------
    toggleExportMenu() {
      set((s) => {
        s.exportMenuOpen = !s.exportMenuOpen
      })
    },
    closeExportMenu() {
      set((s) => {
        s.exportMenuOpen = false
      })
    },
    async exportScript(scriptId, format) {
      const script = get().scripts.find((sc) => sc.id === scriptId)
      if (!script) return
      const { content, ext } = buildExportContent(script, format)
      const filtersByFormat = {
        txt: [{ name: 'Text', extensions: ['txt'] }],
        md: [{ name: 'Markdown', extensions: ['md'] }],
        json: [{ name: 'JSON', extensions: ['json'] }]
      }
      const defaultName = script.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.' + ext
      await window.bijou.exportFile({ defaultName, content, filters: filtersByFormat[format] })
      set((s) => {
        s.exportMenuOpen = false
      })
    },
    async importScript() {
      const result = await window.bijou.importFile()
      if (!result || result.canceled) return
      let newScript = result.script
      if (!newScript) {
        const parsed = parseImportedText(result.text)
        newScript = {
          id: uid(),
          title: parsed.title,
          updatedAt: Date.now(),
          pinned: false,
          dueDate: null,
          dailyBaseline: null,
          workLogHistory: [],
          timestampLog: [],
          projectChecklist: [],
          sections: parsed.sections,
          categories: defaultCategories(),
          openTabs: [],
          activeTabId: 'all',
          checkpoints: [],
          pinnedSectionIds: [],
          mapLayout: { nodes: {}, edges: [], mainThreadId: null, hideSummaries: false, hideOutlines: false }
        }
      }
      set((s) => {
        s.scripts.push(newScript)
        s.currentScriptId = newScript.id
        s.diskUpdatedAt[newScript.id] = newScript.updatedAt
      })
      get().scheduleSave(newScript.id, { flash: false })
    },

    // ---------- selection ----------
    setSelectedLines(keys) {
      set((s) => {
        s.selectedLines = keys
      })
    },
    setSelectAnchor(key) {
      set((s) => {
        s.selectAnchor = key
      })
    },
    toggleLineSelected(key) {
      set((s) => {
        const idx = s.selectedLines.indexOf(key)
        if (idx >= 0) s.selectedLines.splice(idx, 1)
        else s.selectedLines.push(key)
        s.selectAnchor = key
      })
    },
    toggleSectionSelected(id) {
      set((s) => {
        const idx = s.selectedSections.indexOf(id)
        if (idx >= 0) s.selectedSections.splice(idx, 1)
        else s.selectedSections.push(id)
      })
    },
    clearLineSelection() {
      set((s) => {
        s.selectedLines = []
        s.selectAnchor = null
      })
    },
    clearAllSelection() {
      set((s) => {
        s.selectedLines = []
        s.selectedSections = []
        s.selectAnchor = null
      })
    },
    // Shift-click / shift+ctrl-click range select, and drag-select: picks
    // every line between anchor and target (inclusive) in document order.
    rangeSelectLines(scriptId, anchorKey, targetKey) {
      const script = get().scripts.find((sc) => sc.id === scriptId)
      if (!script) return
      const list = buildNavList(script).filter((it) => it.type === 'line').map((it) => it.key)
      const aIdx = list.indexOf(anchorKey)
      const bIdx = list.indexOf(targetKey)
      if (aIdx < 0 || bIdx < 0) return
      const lo = Math.min(aIdx, bIdx)
      const hi = Math.max(aIdx, bIdx)
      set((s) => {
        s.selectedLines = list.slice(lo, hi + 1)
        s.selectAnchor = anchorKey
      })
    },
    // Shift+Up/Down while editing a line: starts a 1-line selection if none
    // exists, otherwise grows/shrinks from whichever end isn't the anchor.
    extendLineSelection(scriptId, key, dir) {
      const script = get().scripts.find((sc) => sc.id === scriptId)
      if (!script) return
      const list = buildNavList(script).filter((it) => it.type === 'line').map((it) => it.key)
      set((s) => {
        if (!s.selectedLines.length) {
          s.selectAnchor = key
          const curIdx = list.indexOf(key)
          const nextIdx = curIdx + dir
          if (nextIdx < 0 || nextIdx >= list.length) return
          const lo = Math.min(curIdx, nextIdx)
          const hi = Math.max(curIdx, nextIdx)
          s.selectedLines = list.slice(lo, hi + 1)
        } else {
          const anchorIdx = list.indexOf(s.selectAnchor || key)
          const selIdxs = s.selectedLines.map((k) => list.indexOf(k)).filter((i) => i >= 0)
          if (!selIdxs.length) return
          let lo = Math.min(...selIdxs)
          let hi = Math.max(...selIdxs)
          if (dir > 0) {
            if (anchorIdx === lo) hi = Math.min(list.length - 1, hi + 1)
            else lo = Math.min(hi, lo + 1)
          } else {
            if (anchorIdx === hi) lo = Math.max(0, lo - 1)
            else hi = Math.max(lo, hi - 1)
          }
          s.selectedLines = list.slice(lo, hi + 1)
        }
      })
    },

    // ---------- struck-through ----------
    toggleStruckForLines(scriptId, keys) {
      if (!keys.length) return
      get().pushUndo(scriptId)
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (!script) return
        const anyUnstruck = keys.some((k) => {
          const [secId, lineId] = k.split(':')
          const sec = script.sections.find((se) => se.id === secId)
          const line = sec && sec.lines.find((l) => l.id === lineId)
          return line && !line.struck
        })
        keys.forEach((k) => {
          const [secId, lineId] = k.split(':')
          const sec = script.sections.find((se) => se.id === secId)
          const line = sec && sec.lines.find((l) => l.id === lineId)
          if (line) line.struck = anyUnstruck
        })
        script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
    },
    // Marks a mind-map node itself as "cut" (a card-level visual, distinct
    // from toggleStruckForSection above, which strikes a section's actual
    // lines) — for planning: a whole branch/idea can be crossed out on the
    // map without touching any real script content underneath it.
    toggleStruckForMapNodes(scriptId, nodeIds) {
      if (!nodeIds.length) return
      get().pushUndo(scriptId)
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (!script) return
        const nodes = script.mapLayout.nodes
        const anyUnstruck = nodeIds.some((id) => nodes[id] && !nodes[id].struck)
        nodeIds.forEach((id) => {
          if (nodes[id]) nodes[id].struck = anyUnstruck
        })
      })
      get().scheduleSave(scriptId, { flash: false })
    },
    toggleStruckForSection(scriptId, sectionId) {
      get().pushUndo(scriptId)
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const sec = script && script.sections.find((se) => se.id === sectionId)
        if (!sec) return
        const anyUnstruck = sec.lines.some((l) => !l.struck)
        sec.lines.forEach((l) => {
          l.struck = anyUnstruck
        })
        script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
    },

    // ---------- selection delete / move ----------
    deleteSelection(scriptId) {
      get().pushUndo(scriptId)
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (!script) return
        if (s.selectedSections.length) {
          const remaining = script.sections.filter((se) => !s.selectedSections.includes(se.id))
          script.sections = remaining.length > 0 ? remaining : [mkSection('New section', [mkLine('', null)])]
          script.openTabs = script.openTabs.filter((id) => !s.selectedSections.includes(id))
          if (s.selectedSections.includes(script.activeTabId)) script.activeTabId = 'all'
          s.selectedSections = []
        }
        s.selectedLines.forEach((key) => {
          const [secId, lineId] = key.split(':')
          const sec = script.sections.find((se) => se.id === secId)
          if (sec) sec.lines = sec.lines.filter((l) => l.id !== lineId)
        })
        s.selectedLines = []
        script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
    },
    moveSelectedLines(scriptId, dir) {
      const { selectedLines } = get()
      if (!selectedLines.length) return
      const secId = selectedLines[0].split(':')[0]
      if (!selectedLines.every((k) => k.split(':')[0] === secId)) return
      get().pushUndo(scriptId)
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const sec = script && script.sections.find((se) => se.id === secId)
        if (!sec) return
        const ids = selectedLines.map((k) => k.split(':')[1])
        const indices = ids.map((id) => sec.lines.findIndex((l) => l.id === id)).filter((i) => i >= 0).sort((a, b) => a - b)
        if (!indices.length) return
        if (dir < 0 && indices[0] === 0) return
        if (dir > 0 && indices[indices.length - 1] === sec.lines.length - 1) return
        if (dir < 0) {
          const moved = sec.lines[indices[0] - 1]
          sec.lines.splice(indices[0] - 1, 1)
          sec.lines.splice(indices[indices.length - 1], 0, moved)
        } else {
          const moved = sec.lines[indices[indices.length - 1] + 1]
          sec.lines.splice(indices[indices.length - 1] + 1, 1)
          sec.lines.splice(indices[0], 0, moved)
        }
        script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
    },
    moveSelectedSections(scriptId, dir) {
      const { selectedSections } = get()
      if (!selectedSections.length) return
      get().pushUndo(scriptId)
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (!script) return
        const indices = selectedSections.map((id) => script.sections.findIndex((se) => se.id === id)).filter((i) => i >= 0).sort((a, b) => a - b)
        if (!indices.length) return
        if (dir < 0 && indices[0] === 0) return
        if (dir > 0 && indices[indices.length - 1] === script.sections.length - 1) return
        if (dir < 0) {
          const moved = script.sections[indices[0] - 1]
          script.sections.splice(indices[0] - 1, 1)
          script.sections.splice(indices[indices.length - 1], 0, moved)
        } else {
          const moved = script.sections[indices[indices.length - 1] + 1]
          script.sections.splice(indices[indices.length - 1] + 1, 1)
          script.sections.splice(indices[0], 0, moved)
        }
        script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
    },

    // ---------- clipboard (in-memory, not the OS clipboard) ----------
    hasClipboard() {
      return clipboardLines.length > 0
    },
    // Is `text` (what a paste is about to insert) still the copied lines?
    clipboardMatches(text) {
      return clipboardText === null || normalizeClip(text) === normalizeClip(clipboardText)
    },
    copyLineToClipboard(scriptId, sectionId, lineId) {
      const script = get().scripts.find((sc) => sc.id === scriptId)
      const sec = script && script.sections.find((se) => se.id === sectionId)
      const line = sec && sec.lines.find((l) => l.id === lineId)
      if (!line) return 0
      setClipboardLines([cleanLineCopy(line)])
      return 1
    },
    copySelectionToClipboard(scriptId) {
      const { selectedLines } = get()
      const script = get().scripts.find((sc) => sc.id === scriptId)
      if (!script || !selectedLines.length) return 0
      setClipboardLines(
        selectedLines
          .map((k) => {
            const [secId, lineId] = k.split(':')
            const sec = script.sections.find((se) => se.id === secId)
            const line = sec && sec.lines.find((l) => l.id === lineId)
            return line ? cleanLineCopy(line) : null
          })
          .filter(Boolean)
      )
      return clipboardLines.length
    },
    cutSelectionToClipboard(scriptId) {
      const count = get().copySelectionToClipboard(scriptId)
      if (!count) return 0
      get().pushUndo(scriptId)
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (!script) return
        s.selectedLines.forEach((key) => {
          const [secId, lineId] = key.split(':')
          const sec = script.sections.find((se) => se.id === secId)
          if (sec) sec.lines = sec.lines.filter((l) => l.id !== lineId)
        })
        s.selectedLines = []
        script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
      return count
    },
    pasteClipboard(scriptId, { atLineKey, afterSelected } = {}) {
      if (!clipboardLines.length) return null
      get().pushUndo(scriptId)
      let newKeys = []
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (!script) return
        let sec = null
        let insertIdx = 0
        let replaceEmptyIdx = -1
        if (atLineKey) {
          const [secId, lineId] = atLineKey.split(':')
          sec = script.sections.find((se) => se.id === secId)
          if (!sec) return
          const tIdx = sec.lines.findIndex((l) => l.id === lineId)
          if (tIdx < 0) return
          if (stripHtmlToText(sec.lines[tIdx].text).trim() === '') {
            replaceEmptyIdx = tIdx
            insertIdx = tIdx
          } else insertIdx = tIdx + 1
        } else if (afterSelected && s.selectedLines.length) {
          const lastKey = s.selectedLines[s.selectedLines.length - 1]
          const [secId, lineId] = lastKey.split(':')
          sec = script.sections.find((se) => se.id === secId)
          insertIdx = sec ? sec.lines.findIndex((l) => l.id === lineId) + 1 : 0
        } else {
          sec = script.sections[0]
          insertIdx = sec ? sec.lines.length : 0
        }
        if (!sec) return
        const clones = clipboardLines.map((l) => {
          const c = JSON.parse(JSON.stringify(l))
          c.id = uid()
          c.noteOpen = false
          return c
        })
        if (replaceEmptyIdx >= 0) sec.lines.splice(replaceEmptyIdx, 1)
        sec.lines.splice(insertIdx, 0, ...clones)
        script.updatedAt = Date.now()
        newKeys = clones.map((c) => sec.id + ':' + c.id)
        s.selectedLines = newKeys
      })
      get().scheduleSave(scriptId)
      return newKeys
    },

    // ---------- rebindable keyboard shortcuts ----------
    startRebind(actionId) {
      set((s) => {
        s.rebindingActionKey = actionId
      })
    },
    cancelRebind() {
      set((s) => {
        s.rebindingActionKey = null
      })
    },
    setKeybind(actionId, combo) {
      set((s) => {
        s.keybinds[actionId] = combo
        s.rebindingActionKey = null
      })
      get().saveAppSettings()
    },

    // ---------- right-click context menu ----------
    openContextMenu(menu) {
      set((s) => {
        s.contextMenu = menu
      })
    },
    closeContextMenu() {
      set((s) => {
        s.contextMenu = null
      })
    },
    duplicateLine(scriptId, sectionId, lineId) {
      get().pushUndo(scriptId)
      let newKey = null
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const sec = script && script.sections.find((se) => se.id === sectionId)
        if (!sec) return
        const idx = sec.lines.findIndex((l) => l.id === lineId)
        if (idx < 0) return
        const clone = cleanLineCopy(sec.lines[idx])
        clone.id = uid()
        clone.noteOpen = false
        sec.lines.splice(idx + 1, 0, clone)
        script.updatedAt = Date.now()
        newKey = sectionId + ':' + clone.id
      })
      get().scheduleSave(scriptId, { flash: false })
      return newKey
    },
    // Duplicates every given line in one combined pushUndo/set/save — used
    // by the "duplicate selection" keybind for a multi-line selection, so
    // one keypress is one undo step, not one per line (see duplicateLine).
    duplicateLines(scriptId, lineKeys) {
      if (!lineKeys.length) return []
      get().pushUndo(scriptId)
      const newKeys = []
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (!script) return
        lineKeys.forEach((key) => {
          const [sectionId, lineId] = key.split(':')
          const sec = script.sections.find((se) => se.id === sectionId)
          if (!sec) return
          const idx = sec.lines.findIndex((l) => l.id === lineId)
          if (idx < 0) return
          const clone = cleanLineCopy(sec.lines[idx])
          clone.id = uid()
          clone.noteOpen = false
          sec.lines.splice(idx + 1, 0, clone)
          newKeys.push(sectionId + ':' + clone.id)
        })
        script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
      return newKeys
    },

    // ---------- teleprompter / recording mode ----------
    openTeleprompter() {
      set((s) => {
        s.teleprompterOpen = true
      })
    },
    closeTeleprompter() {
      set((s) => {
        s.teleprompterOpen = false
        s.teleprompterAutoScroll = false
      })
    },
    setTeleprompterFontSize(size) {
      set((s) => {
        s.teleprompterFontSize = Math.max(20, Math.min(72, size))
      })
    },
    toggleTeleprompterAutoScroll() {
      set((s) => {
        s.teleprompterAutoScroll = !s.teleprompterAutoScroll
      })
    },
    setTeleprompterSpeed(speed) {
      set((s) => {
        s.teleprompterSpeed = Math.max(0.25, Math.min(3, speed))
      })
    },
    toggleTeleprompterShowNotes() {
      set((s) => {
        s.teleprompterShowNotes = !s.teleprompterShowNotes
      })
    },
    setTeleprompterWidth(width) {
      set((s) => {
        s.teleprompterWidth = Math.max(500, Math.min(1800, width))
      })
    },
    setTeleprompterAlign(align) {
      set((s) => {
        s.teleprompterAlign = align
      })
    },
    setTeleprompterFont(font) {
      set((s) => {
        s.teleprompterFont = font
      })
    },

    // ---------- video map / story-beat board ----------
    toggleMapView() {
      set((s) => {
        s.mapViewOpen = !s.mapViewOpen
        if (s.mapViewOpen) s.outlineViewOpen = false
      })
    },
    toggleMapHideBars() {
      set((s) => {
        s.mapHideBars = !s.mapHideBars
      })
      get().saveAppSettings()
    },
    toggleMapSplit() {
      set((s) => {
        s.mapSplitOpen = !s.mapSplitOpen
      })
    },
    // A flattened, linear read/edit of the same map data — see
    // src/lib/mapGraph.js's flattenMapOrder for how it's ordered. Mutually
    // exclusive with the map view itself, same as a single view switcher.
    toggleOutlineView() {
      set((s) => {
        s.outlineViewOpen = !s.outlineViewOpen
        if (s.outlineViewOpen) s.mapViewOpen = false
      })
    },
    toggleOutlineSplit() {
      set((s) => {
        s.outlineSplitOpen = !s.outlineSplitOpen
      })
    },
    setSectionBeatSummary(scriptId, sectionId, text) {
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const sec = script && script.sections.find((se) => se.id === sectionId)
        if (sec) sec.beatSummary = text
      })
    },
    commitSectionBeatSummary(scriptId, sectionId) {
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (script) script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId)
    },

    // A freeform planning layer, separate from the script's real section
    // order — dragging or connecting nodes here never reorders the actual
    // script (that's still only ever done in the editor itself).
    // Any section missing a node position (brand new, or never opened the
    // map before) gets one lazily, cascaded straight down a single column
    // — a mind map "typically" reads top-to-bottom, and a vertical default
    // is easy to branch sideways from later, unlike a grid.
    ensureMapNodes(scriptId) {
      let repaired = false
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (!script) return
        let i = Object.keys(script.mapLayout.nodes).length
        script.sections.forEach((sec) => {
          if (script.mapLayout.nodes[sec.id]) return
          script.mapLayout.nodes[sec.id] = { x: 60, y: 60 + i * 190, collapsed: false }
          i++
        })
        // Nodes that lost their position (saved as null) move below the map.
        const lost = Object.values(script.mapLayout.nodes).filter((n) => !hasPosition(n))
        lost.forEach((n, k) => {
          Object.assign(n, spotBelowMap(script.mapLayout.nodes, k))
          repaired = true
        })
        if (migrateProblemFrames(script.mapLayout.nodes)) repaired = true
        if (syncFramesIn(script.mapLayout.nodes)) repaired = true
      })
      if (repaired) get().scheduleSave(scriptId, { flash: false })
    },
    setMapNodePosition(scriptId, sectionId, x, y) {
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const node = script && script.mapLayout.nodes[sectionId]
        if (node && Number.isFinite(x) && Number.isFinite(y)) {
          node.x = x
          node.y = y
        }
      })
      get().scheduleSave(scriptId, { flash: false })
    },
    // Moves nodes by a fixed step (arrow keys). A run of presses within a
    // moment of each other is one undo step, not one per press.
    nudgeMapNodes(scriptId, nodeIds, dx, dy) {
      const now = Date.now()
      const key = scriptId + ':' + nodeIds.join(',')
      if (key !== lastNudge.key || now - lastNudge.at > 700) get().pushUndo(scriptId)
      lastNudge = { key, at: now }
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (!script) return
        const moving = new Set(nodeIds)
        descendantIds(script.mapLayout.nodes, nodeIds.filter((id) => script.mapLayout.nodes[id] && script.mapLayout.nodes[id].type === 'problem')).forEach((id) => moving.add(id))
        moving.forEach((id) => {
          const node = script.mapLayout.nodes[id]
          if (node && Number.isFinite(node.x) && Number.isFinite(node.y)) {
            node.x += dx
            node.y += dy
          }
        })
        syncFramesIn(script.mapLayout.nodes)
        script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
    },
    addSectionFromMap(scriptId, x, y) {
      const newId = get().addSection(scriptId)
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (!script || !newId) return
        const at = Number.isFinite(x) && Number.isFinite(y) ? { x, y } : spotBelowMap(script.mapLayout.nodes)
        script.mapLayout.nodes[newId] = { ...at, collapsed: false }
      })
      get().scheduleSave(scriptId, { flash: false })
      return newId
    },
    // Extends a thread from its current end: new section, positioned one
    // step further out in whichever direction the node was already
    // trending (so continuing a vertical thread keeps going down, etc.),
    // pre-connected with an edge from the node it grew out of.
    addConnectedSectionFromMap(scriptId, fromId, dir) {
      const script = get().scripts.find((sc) => sc.id === scriptId)
      const fromNode = script && script.mapLayout.nodes[fromId]
      if (!fromNode) return null
      const offsets = { up: [0, -190], down: [0, 190], left: [-280, 0], right: [280, 0] }
      const [dx, dy] = offsets[dir] || offsets.down
      const newId = get().addSectionFromMap(scriptId, fromNode.x + dx, fromNode.y + dy)
      if (newId) get().addMapEdge(scriptId, fromId, newId)
      return newId
    },
    // Both this and toggleMapHideOutlines below explicitly scheduleSave
    // — without it, the toggle only changed in-memory state and relied
    // on some *other*, unrelated action happening to also trigger a
    // save before the app closed to ever reach disk; close the app
    // right after toggling and it silently reverted next launch. Caught
    // as a real bug report ("my hide-outlines toggle isn't remembered"),
    // not assumed — same fix applies to hideSummaries, which had the
    // identical gap from the start (never separately reported, since
    // it's less often toggled in isolation right before closing).
    toggleMapHideSummaries(scriptId) {
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (script) script.mapLayout.hideSummaries = !script.mapLayout.hideSummaries
      })
      get().scheduleSave(scriptId, { flash: false })
    },
    // A view preference, same shape as hideSummaries above — turns off
    // idea nodes' colored accent border for a calmer, uniform look once
    // a map has enough of them that the colors themselves become the
    // noise. Deliberately doesn't touch the small status dot each node
    // (idea or section) shows next to its title — that stays colored
    // either way, since it's the one place a node's category is still
    // visible at a glance without the louder full border. Purely a
    // rendering flag: node.color/bgColor are untouched, so switching
    // back reveals every node's real border color exactly as it was.
    toggleMapHideOutlines(scriptId) {
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (script) script.mapLayout.hideOutlines = !script.mapLayout.hideOutlines
      })
      get().scheduleSave(scriptId, { flash: false })
    },
    // The note you flagged as "where I stopped" in the Footage tab (null clears it).
    setFootageStop(scriptId, stop) {
      if (!scriptId) return
      set((s) => {
        if (stop) s.footageStops[scriptId] = stop
        else delete s.footageStops[scriptId]
      })
      get().saveAppSettings()
    },
    // The map reports where it is a moment after you stop panning/zooming
    // (and when it closes), never during a drag. Only writes when it moved.
    setMapView(scriptId, view) {
      if (!scriptId || !view || !Number.isFinite(view.x) || !Number.isFinite(view.y) || !Number.isFinite(view.zoom)) return
      // Zoom keeps 4 decimals: positions on a big map are thousands of px
      // from the origin, so a coarser zoom would drift the view visibly.
      const r = (n, d) => Math.round(n * d) / d
      const next = { x: r(view.x, 100), y: r(view.y, 100), zoom: r(view.zoom, 10000) }
      const cur = get().mapViews[scriptId]
      if (cur && cur.x === next.x && cur.y === next.y && cur.zoom === next.zoom) return
      set((s) => {
        s.mapViews[scriptId] = next
      })
      get().saveAppSettings()
    },
    toggleMapNodeCollapsed(scriptId, sectionId) {
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const node = script && script.mapLayout.nodes[sectionId]
        if (node) node.collapsed = !node.collapsed
      })
      get().scheduleSave(scriptId, { flash: false })
    },
    addMapEdge(scriptId, fromId, toId) {
      if (fromId === toId) return
      get().pushUndo(scriptId)
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (!script) return
        const exists = script.mapLayout.edges.some((e) => e.from === fromId && e.to === toId)
        if (exists) return
        script.mapLayout.edges.push({ id: uid(), from: fromId, to: toId })
        script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
    },
    setMapEdgeBendOffset(scriptId, edgeId, bendOffset) {
      // No pushUndo here — this fires on every mousemove tick while the
      // user drags an edge's reroute handle. The caller pushes one
      // snapshot at mousedown instead, same fix as setIdeaNodeColor's
      // color-drag undo-spam bug.
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const edge = script && script.mapLayout.edges.find((e) => e.id === edgeId)
        if (edge) edge.bendOffset = bendOffset
        if (script) script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
    },
    removeMapEdge(scriptId, edgeId) {
      get().pushUndo(scriptId)
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (!script) return
        script.mapLayout.edges = script.mapLayout.edges.filter((e) => e.id !== edgeId)
        script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
    },
    // Quick alternate way to disconnect: clicking (or starting to drag) a
    // node's connector dot when it already has a line attached removes
    // that line immediately, instead of having to click the edge itself
    // and then its × marker.
    removeMapEdgesByIds(scriptId, edgeIds) {
      if (!edgeIds.length) return
      get().pushUndo(scriptId)
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (!script) return
        script.mapLayout.edges = script.mapLayout.edges.filter((e) => !edgeIds.includes(e.id))
        script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
    },
    // Toggling the current main thread off again clears it — a script
    // doesn't have to have one designated at all.
    setMapMainThread(scriptId, sectionId) {
      get().pushUndo(scriptId)
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (!script) return
        script.mapLayout.mainThreadId = script.mapLayout.mainThreadId === sectionId ? null : sectionId
        script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
    },

    // ---------- mind-map idea nodes (freeform notes, not real sections) ----------
    // Live only in mapLayout.nodes, marked with type:'idea' — nodes without
    // an explicit type are implicitly sections (all the ones that predate
    // this feature). They share the exact same position/edge/connector
    // machinery as section nodes, just carry their own title/text/color
    // instead of pointing at a real section.
    addIdeaNode(scriptId, x, y, opts = {}) {
      get().pushUndo(scriptId)
      let newId = null
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (!script) return
        newId = uid()
        const at = Number.isFinite(x) && Number.isFinite(y) ? { x, y } : spotBelowMap(script.mapLayout.nodes)
        script.mapLayout.nodes[newId] = {
          x: at.x,
          y: at.y,
          collapsed: false,
          type: 'idea',
          title: opts.title || '',
          text: opts.text || '',
          color: opts.color || null,
          bgColor: opts.bgColor || null,
          shape: opts.shape || 'rectangle'
        }
        syncFramesIn(script.mapLayout.nodes, new Set([newId]))
        script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
      return newId
    },
    // Mirrors addConnectedSectionFromMap, but for growing a thread with a
    // blank idea node instead of a new section.
    // Spawns a preset's idea node and, if the preset chains into others, each
    // of those below it (the same step a "grow down" node takes), linked
    // top to bottom. One undo step for the lot. Returns the new node ids,
    // the preset's own first.
    addIdeaNodeChain(scriptId, x, y, presetId) {
      const chain = presetChain(get().ideaNodePresets, presetId)
      if (!chain.length) return []
      get().pushUndo(scriptId)
      const ids = []
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (!script) return
        const at = Number.isFinite(x) && Number.isFinite(y) ? { x, y } : spotBelowMap(script.mapLayout.nodes)
        chain.forEach((p, i) => {
          const id = uid()
          script.mapLayout.nodes[id] = {
            x: at.x,
            y: at.y + i * 190,
            collapsed: false,
            type: 'idea',
            title: p.label,
            text: '',
            color: p.color || null,
            bgColor: null,
            shape: p.shape || 'rectangle'
          }
          if (i > 0) script.mapLayout.edges.push({ id: uid(), from: ids[i - 1], to: id })
          ids.push(id)
        })
        syncFramesIn(script.mapLayout.nodes, new Set(ids))
        script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
      return ids
    },
    addConnectedIdeaNodeFromMap(scriptId, fromId, dir) {
      const script = get().scripts.find((sc) => sc.id === scriptId)
      const fromNode = script && script.mapLayout.nodes[fromId]
      if (!fromNode) return null
      const offsets = { up: [0, -190], down: [0, 190], left: [-280, 0], right: [280, 0] }
      const [dx, dy] = offsets[dir] || offsets.down
      const newId = get().addIdeaNode(scriptId, fromNode.x + dx, fromNode.y + dy)
      if (newId) {
        get().addMapEdge(scriptId, fromId, newId)
        get().growFrameFor(scriptId, fromId, [newId])
      }
      return newId
    },
    setIdeaNodeTitle(scriptId, nodeId, title) {
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const node = script && script.mapLayout.nodes[nodeId]
        if (node) node.title = title
      })
    },
    commitIdeaNodeTitle(scriptId) {
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (script) script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
    },
    setIdeaNodeText(scriptId, nodeId, text) {
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const node = script && script.mapLayout.nodes[nodeId]
        if (node) node.text = text
      })
    },
    commitIdeaNodeText(scriptId) {
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (script) script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
    },
    // Switches an idea node to another preset's look: its title, colour and
    // shape (the text is left alone). One undo step.
    applyIdeaNodePreset(scriptId, nodeId, presetId) {
      const preset = get().ideaNodePresets.find((p) => p.id === presetId)
      if (!preset) return
      get().pushUndo(scriptId)
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const node = script && script.mapLayout.nodes[nodeId]
        if (!node) return
        node.title = preset.label
        node.color = preset.color || null
        node.shape = preset.shape || 'rectangle'
        script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
    },
    setIdeaNodeColor(scriptId, nodeId, color) {
      // No pushUndo here on purpose — a native <input type="color"> fires
      // onChange continuously while the user drags inside the OS picker,
      // and pushing a snapshot on every one of those (potentially hundreds
      // per drag) made a single Ctrl+Z only undo one tiny color tick.
      // The caller pushes one snapshot at focus-time instead, same pattern
      // as the title/text fields above.
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const node = script && script.mapLayout.nodes[nodeId]
        if (node) node.color = color
        if (script) script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
    },
    setIdeaNodeBgColor(scriptId, nodeId, bgColor) {
      // Same no-pushUndo-here reasoning as setIdeaNodeColor above.
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const node = script && script.mapLayout.nodes[nodeId]
        if (node) node.bgColor = bgColor
        if (script) script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
    },
    setIdeaNodeShape(scriptId, nodeId, shape) {
      get().pushUndo(scriptId)
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const node = script && script.mapLayout.nodes[nodeId]
        if (node) node.shape = shape
        if (script) script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
    },
    // A user-initiated resize (dragging an edge/corner handle) — undo-
    // tracked like any other deliberate action. Stored separately from
    // node.width/height (see syncMapNodeMeasuredSize): this is a floor
    // applied live via CSS min-width/min-height, not a value that gets
    // silently overwritten the next time content is measured — content
    // can still grow the node past it, and shrinking text never erases
    // a manual resize the way overwriting one shared field would. Despite
    // the generic name, works for any node type — section/chapter/idea —
    // since they all share the same mapLayout.nodes[id] storage shape.
    setMapNodeSize(scriptId, nodeId, width, height) {
      // No pushUndo here — this fires on every mousemove tick while the
      // user drags a resize handle. MapView.jsx's handleResizeMouseDown
      // already pushes one snapshot at mousedown, same fix as
      // setMapEdgeBendOffset/setIdeaNodeColor before it. (Caught this
      // exact regression via a real drag-simulated test before shipping
      // — undo stack grew by 5 across 5 mousemove ticks instead of
      // staying at 1, the same bug shape as those two earlier fixes.)
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const node = script && script.mapLayout.nodes[nodeId]
        if (node) {
          node.manualWidth = width
          node.manualHeight = height
        }
        if (script) script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
    },
    // Passive sync only — called from a ResizeObserver as a node's real
    // rendered size changes with its content (grows *or* shrinks,
    // freely), so the connector-anchor math (sideAnchor/pickSides in
    // MapView.jsx) has an accurate size to work from instead of an
    // assumed constant. Shared by every node type's own ResizeObserver
    // (section/chapter/idea, both idea branches). This is a plain
    // "here's the current measurement" cache, not a user action — never
    // pushes undo. It's always accurate to trust as-is (not maxed
    // against anything) because the *rendering* itself already respects
    // node.manualWidth/manualHeight as a CSS min-width/min-height floor,
    // so what gets measured here can never be smaller than that floor
    // in the first place.
    syncMapNodeMeasuredSize(scriptId, nodeId, width, height) {
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const node = script && script.mapLayout.nodes[nodeId]
        if (node) {
          node.width = width
          node.height = height
        }
      })
    },
    toggleIdeaNodeTitleBold(scriptId, nodeId) {
      get().pushUndo(scriptId)
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const node = script && script.mapLayout.nodes[nodeId]
        if (node) node.titleBold = !node.titleBold
        if (script) script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
    },

    // ---------- mind-map chapter nodes (group headers, not real sections) ----------
    // A label + a number, e.g. "The Desert" #1 and a separate, unconnected
    // "The Desert" #2 elsewhere on the map — deliberately NOT required to
    // connect to each other. Grouping into the Outline is entirely by
    // (label, number), not by any edge between chapter nodes themselves;
    // a chapter's *members* are still whatever's connected to it via the
    // normal edge mechanism, same as any other thread (see
    // flattenMapOrder in lib/mapGraph.js).
    addChapterNode(scriptId, x, y) {
      get().pushUndo(scriptId)
      let newId = null
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (!script) return
        newId = uid()
        const at = Number.isFinite(x) && Number.isFinite(y) ? { x, y } : spotBelowMap(script.mapLayout.nodes)
        script.mapLayout.nodes[newId] = { ...at, collapsed: false, type: 'chapter', label: '', number: 1 }
        script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
      return newId
    },
    // ---------- problems: labelled frames around idea nodes ----------
    // Which problem the map is focused on (null = none): everything outside it is dimmed.
    setMapFocus(scriptId, problemId) {
      set((s) => {
        s.mapFocus[scriptId] = problemId || null
      })
    },
    // Re-works which frame each node sits in, after something moved or was resized.
    // After a drag or resize: re-file the nodes that were moved (a frame's own contents moved
    // with it, so they are not), and let a resized frame take in what it now covers.
    syncFrames(scriptId, ids, absorbFrameId) {
      let changed = false
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (!script) return
        const nodes = script.mapLayout.nodes
        let evalIds = null
        if (ids && ids.length) {
          const moved = new Set(ids)
          evalIds = new Set(ids.filter((id) => !(nodes[id] && nodes[id].parent && moved.has(nodes[id].parent))))
        }
        changed = syncFramesIn(nodes, evalIds, absorbFrameId)
        if (changed) script.updatedAt = Date.now()
      })
      if (changed) get().scheduleSave(scriptId, { flash: false })
    },
    // Takes nodes out of the problem they are in.
    releaseFromProblem(scriptId, ids) {
      const script = get().scripts.find((sc) => sc.id === scriptId)
      if (!script) return
      const inFrame = ids.filter((id) => script.mapLayout.nodes[id] && script.mapLayout.nodes[id].parent)
      if (!inFrame.length) return
      get().pushUndo(scriptId)
      set((s) => {
        const sc = s.scripts.find((x) => x.id === scriptId)
        inFrame.forEach((id) => {
          delete sc.mapLayout.nodes[id].parent
          delete sc.mapLayout.nodes[id].exit
        })
        syncFramesIn(sc.mapLayout.nodes)
        sc.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
    },
    // An empty frame, centred where asked; it takes in whatever it covers.
    addProblemNode(scriptId, x, y) {
      get().pushUndo(scriptId)
      let newId = null
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (!script) return
        newId = uid()
        const at = Number.isFinite(x) && Number.isFinite(y) ? { x: x - FRAME_W / 2 + 110, y: y - 40 } : spotBelowMap(script.mapLayout.nodes)
        script.mapLayout.nodes[newId] = { ...at, collapsed: false, type: 'problem', label: '', summary: '', compress: false, manualWidth: FRAME_W, manualHeight: FRAME_H }
        syncFramesIn(script.mapLayout.nodes, null, newId)
        script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
      return newId
    },
    // Draws a frame around the selected idea nodes (and problems). Returns its id, or null.
    groupIntoProblem(scriptId, ids) {
      const script = get().scripts.find((sc) => sc.id === scriptId)
      if (!script) return null
      const nodes = script.mapLayout.nodes
      const group = ids.filter((id) => nodes[id] && (nodes[id].type === 'idea' || nodes[id].type === 'problem') && hasPosition(nodes[id]))
      if (!group.length) return null
      get().pushUndo(scriptId)
      const newId = uid()
      set((s) => {
        const sc = s.scripts.find((x) => x.id === scriptId)
        if (!sc) return
        const ns = sc.mapLayout.nodes
        const minX = Math.min(...group.map((id) => ns[id].x))
        const minY = Math.min(...group.map((id) => ns[id].y))
        const maxX = Math.max(...group.map((id) => ns[id].x + boxOf(ns[id]).w))
        const maxY = Math.max(...group.map((id) => ns[id].y + boxOf(ns[id]).h))
        ns[newId] = {
          x: minX - PAD_L,
          y: minY - PAD_T,
          collapsed: false,
          type: 'problem',
          label: '',
          summary: '',
          compress: false,
          manualWidth: maxX - minX + PAD_L + PAD_R,
          manualHeight: maxY - minY + PAD_T + PAD_B
        }
        // They keep whatever frame they were all in (the new frame goes inside it too).
        const parents = new Set(group.map((id) => ns[id].parent || null))
        const common = parents.size === 1 ? [...parents][0] : null
        if (common && ns[common]) ns[newId].parent = common
        group.forEach((id) => (ns[id].parent = newId))
        syncFramesIn(ns)
        sc.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
      return newId
    },
    // Takes the frame away; the nodes it held stay where they are.
    ungroupProblem(scriptId, problemId) {
      const script = get().scripts.find((sc) => sc.id === scriptId)
      const prob = script && script.mapLayout.nodes[problemId]
      if (!prob || prob.type !== 'problem') return []
      get().pushUndo(scriptId)
      const freed = Object.keys(script.mapLayout.nodes).filter((id) => script.mapLayout.nodes[id].parent === problemId)
      set((s) => {
        const sc = s.scripts.find((x) => x.id === scriptId)
        if (!sc) return
        delete sc.mapLayout.nodes[problemId]
        sc.mapLayout.edges = sc.mapLayout.edges.filter((e) => e.from !== problemId && e.to !== problemId)
        if (sc.mapLayout.mainThreadId === problemId) sc.mapLayout.mainThreadId = null
        syncFramesIn(sc.mapLayout.nodes)
        sc.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
      return freed
    },
    // Fold a frame into one small card (what is inside is hidden, not changed) or open it again.
    toggleProblemFolded(scriptId, nodeId) {
      get().pushUndo(scriptId)
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const node = script && script.mapLayout.nodes[nodeId]
        if (!node || node.type !== 'problem') return
        if (node.folded) delete node.folded
        else node.folded = true
        script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
    },
    // A node was just added next to one inside a frame: stretch that frame (and any
    // frame around it) to take the new node(s) in. No undo step of its own — it rides
    // on the add's.
    growFrameFor(scriptId, sourceId, newIds) {
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (!script) return
        const ns = script.mapLayout.nodes
        const src = ns[sourceId]
        let fid = src && src.parent
        if (!fid || !ns[fid]) return
        newIds.forEach((id) => {
          if (ns[id]) ns[id].parent = fid // the new nodes belong to the same problem
        })
        let boxes = newIds.filter((id) => ns[id] && hasPosition(ns[id])).map((id) => ({ x: ns[id].x, y: ns[id].y, ...boxOf(ns[id]) }))
        let guard = 0
        while (fid && ns[fid] && guard++ < 20) {
          const f = ns[fid]
          const fs = frameSize(f)
          let x1 = f.x
          let y1 = f.y
          let x2 = f.x + fs.w
          let y2 = f.y + fs.h
          boxes.forEach((b) => {
            x1 = Math.min(x1, b.x - PAD_L)
            y1 = Math.min(y1, b.y - PAD_T)
            x2 = Math.max(x2, b.x + b.w + PAD_R)
            y2 = Math.max(y2, b.y + b.h + PAD_B)
          })
          f.x = x1
          f.y = y1
          f.manualWidth = x2 - x1
          f.manualHeight = y2 - y1
          boxes = [{ x: f.x, y: f.y, w: f.manualWidth, h: f.manualHeight }]
          fid = f.parent
        }
        syncFramesIn(ns)
        script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
    },
    // Re-wraps a frame around what is in it.
    fitFrameToContents(scriptId, frameId) {
      const script = get().scripts.find((sc) => sc.id === scriptId)
      const ns = script && script.mapLayout.nodes
      if (!ns || !ns[frameId] || !Object.values(ns).some((n) => n.parent === frameId)) return
      get().pushUndo(scriptId)
      set((s) => {
        const sc = s.scripts.find((x) => x.id === scriptId)
        const nodes = sc.mapLayout.nodes
        const inside = Object.values(nodes).filter((n) => n.parent === frameId && hasPosition(n))
        if (!inside.length) return
        const minX = Math.min(...inside.map((n) => n.x))
        const minY = Math.min(...inside.map((n) => n.y))
        const maxX = Math.max(...inside.map((n) => n.x + boxOf(n).w))
        const maxY = Math.max(...inside.map((n) => n.y + boxOf(n).h))
        const f = nodes[frameId]
        f.x = minX - PAD_L
        f.y = minY - PAD_T
        f.manualWidth = maxX - minX + PAD_L + PAD_R
        f.manualHeight = maxY - minY + PAD_T + PAD_B
        syncFramesIn(nodes)
        sc.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
    },
    setProblemField(scriptId, nodeId, key, value) {
      if (key !== 'label' && key !== 'summary') return
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const node = script && script.mapLayout.nodes[nodeId]
        if (node && node.type === 'problem') node[key] = value
      })
    },
    commitProblemField(scriptId) {
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (script) script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
    },
    // Told as one line in the Outline (the summary) instead of everything inside.
    toggleProblemCompress(scriptId, nodeId) {
      get().pushUndo(scriptId)
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const node = script && script.mapLayout.nodes[nodeId]
        if (!node || node.type !== 'problem') return
        node.compress = !node.compress
        script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
    },
    // Marks a node as the way out of the frame it sits in (the one line that
    // closes the problem) — only one per frame; marking it again clears it.
    toggleWayOut(scriptId, nodeId) {
      const script = get().scripts.find((sc) => sc.id === scriptId)
      const node = script && script.mapLayout.nodes[nodeId]
      if (!node || !node.parent || !script.mapLayout.nodes[node.parent]) return
      get().pushUndo(scriptId)
      set((s) => {
        const sc = s.scripts.find((x) => x.id === scriptId)
        const ns = sc.mapLayout.nodes
        const me = ns[nodeId]
        const had = !!me.exit
        Object.keys(ns).forEach((id) => {
          if (ns[id].parent === me.parent) delete ns[id].exit
        })
        if (!had) me.exit = true
        sc.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
    },
    setChapterNodeLabel(scriptId, nodeId, label) {
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const node = script && script.mapLayout.nodes[nodeId]
        if (node) node.label = label
      })
    },
    commitChapterNodeLabel(scriptId) {
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (script) script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
    },
    // Renames every chapter node in an Outline group at once (they share one
    // heading because they share a label). One undo step.
    renameChapterGroup(scriptId, nodeIds, label) {
      get().pushUndo(scriptId)
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (!script) return
        nodeIds.forEach((id) => {
          const node = script.mapLayout.nodes[id]
          if (node && node.type === 'chapter') node.label = label
        })
        script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
    },
    // Folds an Outline group's items away under its heading (or opens it).
    toggleChapterGroupCollapsed(scriptId, nodeIds) {
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (!script) return
        const first = script.mapLayout.nodes[nodeIds[0]]
        const next = !(first && first.outlineCollapsed)
        nodeIds.forEach((id) => {
          const node = script.mapLayout.nodes[id]
          if (node) node.outlineCollapsed = next
        })
        script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
    },
    setChapterNodeNumber(scriptId, nodeId, number) {
      get().pushUndo(scriptId)
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const node = script && script.mapLayout.nodes[nodeId]
        if (node) node.number = number
        if (script) script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
    },

    // Selects every node reachable from `seedIds`, following edges only
    // 'forward' (from->to), only 'backward' (to->from), or 'both' — the
    // right-click / keybind "select everything connected after/before/
    // around this node" actions. Always includes the seeds themselves, so
    // the result can be deleted or dragged as one group immediately.
    selectConnectedNodes(scriptId, seedIds, direction) {
      const script = get().scripts.find((sc) => sc.id === scriptId)
      if (!script || !seedIds.length) return seedIds || []
      const edges = script.mapLayout.edges
      const visited = new Set(seedIds)
      const queue = [...seedIds]
      while (queue.length) {
        const current = queue.shift()
        edges.forEach((e) => {
          const neighbors = []
          if ((direction === 'forward' || direction === 'both') && e.from === current) neighbors.push(e.to)
          if ((direction === 'backward' || direction === 'both') && e.to === current) neighbors.push(e.from)
          neighbors.forEach((n) => {
            if (!visited.has(n) && script.mapLayout.nodes[n]) {
              visited.add(n)
              queue.push(n)
            }
          })
        })
      }
      return Array.from(visited)
    },
    // Lets ContextMenu.jsx (which has no direct access to MapView's own
    // local selectedNodeIds) ask MapView to apply a computed selection —
    // see mapSelectRequest above.
    requestMapSelection(scriptId, ids) {
      set((s) => {
        s.mapSelectRequest = { scriptId, ids, token: uid() }
      })
    },
    clearMapSelectRequest() {
      set((s) => {
        s.mapSelectRequest = null
      })
    },

    // Connects a multi-node map selection into one directed chain, in
    // whatever order they're currently selected — one keypress instead of
    // dragging N-1 edges by hand. Skips any consecutive pair that's already
    // linked. One pushUndo for the whole chain, same reasoning as
    // duplicateLines/duplicateSections: a single user action, single undo
    // step, not one per edge.
    linkMapNodesInOrder(scriptId, ids) {
      if (ids.length < 2) return
      get().pushUndo(scriptId)
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (!script) return
        for (let i = 0; i < ids.length - 1; i++) {
          const fromId = ids[i]
          const toId = ids[i + 1]
          const exists = script.mapLayout.edges.some((e) => e.from === fromId && e.to === toId)
          if (!exists) script.mapLayout.edges.push({ id: uid(), from: fromId, to: toId })
        }
        script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
    },
    // Same chain, but ordered by where the nodes sit — left to right, or
    // top to bottom, whichever way the selection is spread more (the same
    // rule as alignMapNodesToLine). A drag-box selection has no meaningful
    // "selection order", so this is the one that reads as intended there.
    linkMapNodesByPosition(scriptId, ids) {
      const script = get().scripts.find((sc) => sc.id === scriptId)
      if (!script) return
      const placed = ids.filter((id) => script.mapLayout.nodes[id])
      if (placed.length < 2) return
      const ns = placed.map((id) => script.mapLayout.nodes[id])
      const spread = (k) => Math.max(...ns.map((n) => n[k])) - Math.min(...ns.map((n) => n[k]))
      const [a, b] = spread('x') >= spread('y') ? ['x', 'y'] : ['y', 'x']
      const ordered = placed.slice().sort((p, q) => {
        const np = script.mapLayout.nodes[p]
        const nq = script.mapLayout.nodes[q]
        return np[a] - nq[a] || np[b] - nq[b]
      })
      get().linkMapNodesInOrder(scriptId, ordered)
    },
    // Removes every connection between two nodes of the selection (either
    // direction); connections to nodes outside it stay.
    unlinkMapNodes(scriptId, ids) {
      const set_ = new Set(ids)
      const script = get().scripts.find((sc) => sc.id === scriptId)
      if (!script || !script.mapLayout.edges.some((e) => set_.has(e.from) && set_.has(e.to))) return
      get().pushUndo(scriptId)
      set((s) => {
        const sc = s.scripts.find((x) => x.id === scriptId)
        if (!sc) return
        sc.mapLayout.edges = sc.mapLayout.edges.filter((e) => !(set_.has(e.from) && set_.has(e.to)))
        sc.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
    },
    // Three separate "straighten out a selection" moves, each its own
    // right-click action rather than one combined behavior — the user asked
    // for all three as distinct options, not one auto-layout.
    alignMapNodesToLine(scriptId, ids) {
      if (ids.length < 2) return
      get().pushUndo(scriptId)
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (!script) return
        const nodes = ids.map((id) => script.mapLayout.nodes[id]).filter(Boolean)
        if (nodes.length < 2) return
        const xs = nodes.map((n) => n.x)
        const ys = nodes.map((n) => n.y)
        const xSpread = Math.max(...xs) - Math.min(...xs)
        const ySpread = Math.max(...ys) - Math.min(...ys)
        // Whichever axis they're already more spread along is the one that
        // reads as "a row"/"a column" — snap the *other* axis flat onto it.
        if (xSpread >= ySpread) {
          const avgY = ys.reduce((a, b) => a + b, 0) / ys.length
          nodes.forEach((n) => { n.y = avgY })
        } else {
          const avgX = xs.reduce((a, b) => a + b, 0) / xs.length
          nodes.forEach((n) => { n.x = avgX })
        }
        script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
    },
    snapMapNodesToGrid(scriptId, ids) {
      if (!ids.length) return
      const gridSize = 20
      get().pushUndo(scriptId)
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (!script) return
        ids.forEach((id) => {
          const n = script.mapLayout.nodes[id]
          if (!n) return
          n.x = Math.round(n.x / gridSize) * gridSize
          n.y = Math.round(n.y / gridSize) * gridSize
        })
        script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
    },
    spaceMapNodesEvenly(scriptId, ids) {
      if (ids.length < 2) return
      get().pushUndo(scriptId)
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (!script) return
        const nodes = ids.map((id) => script.mapLayout.nodes[id]).filter(Boolean)
        if (nodes.length < 2) return
        const xs = nodes.map((n) => n.x)
        const ys = nodes.map((n) => n.y)
        const xSpread = Math.max(...xs) - Math.min(...xs)
        const ySpread = Math.max(...ys) - Math.min(...ys)
        const horizontal = xSpread >= ySpread
        const sorted = nodes.slice().sort((a, b) => (horizontal ? a.x - b.x : a.y - b.y))
        const first = horizontal ? sorted[0].x : sorted[0].y
        const last = horizontal ? sorted[sorted.length - 1].x : sorted[sorted.length - 1].y
        const step = (last - first) / (sorted.length - 1)
        sorted.forEach((n, i) => {
          if (horizontal) n.x = first + step * i
          else n.y = first + step * i
        })
        script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
    },
    deleteIdeaNodes(scriptId, nodeIds) {
      if (!nodeIds.length) return
      get().pushUndo(scriptId)
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (!script) return
        const idSet = new Set(nodeIds)
        idSet.forEach((id) => delete script.mapLayout.nodes[id])
        script.mapLayout.edges = script.mapLayout.edges.filter((e) => !idSet.has(e.from) && !idSet.has(e.to))
        if (idSet.has(script.mapLayout.mainThreadId)) script.mapLayout.mainThreadId = null
        syncFramesIn(script.mapLayout.nodes)
        script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
    },
    // A single map selection can mix section nodes and idea nodes — this
    // deletes both kinds in one pushUndo/set/save instead of calling
    // deleteSections + deleteIdeaNodes back to back, which would push two
    // separate undo snapshots for what the user experiences as one delete
    // (and so need two Ctrl+Z presses to undo, not one).
    deleteMapSelection(scriptId, sectionIds, ideaIds) {
      if (!sectionIds.length && !ideaIds.length) return
      get().pushUndo(scriptId)
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (!script) return
        const idSet = new Set([...sectionIds, ...ideaIds])
        if (sectionIds.length) {
          const secSet = new Set(sectionIds)
          script.sections = script.sections.filter((se) => !secSet.has(se.id))
          if (script.sections.length === 0) script.sections.push(mkSection('New section', [mkLine('', null)]))
          script.pinnedSectionIds = script.pinnedSectionIds.filter((id) => !secSet.has(id))
        }
        idSet.forEach((id) => delete script.mapLayout.nodes[id])
        script.mapLayout.edges = script.mapLayout.edges.filter((e) => !idSet.has(e.from) && !idSet.has(e.to))
        if (idSet.has(script.mapLayout.mainThreadId)) script.mapLayout.mainThreadId = null
        syncFramesIn(script.mapLayout.nodes)
        script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
    },
    // Deletes a single node from the Outline tab. Unlike deleteMapSelection
    // above (which just removes the node, leaving any thread through it
    // broken), this bridges around the gap first — every node that had an
    // edge INTO the deleted one gets connected directly to every node it
    // had an edge OUT to, so a chain the node was part of stays one
    // continuous thread instead of splitting in two. A node with only
    // incoming or only outgoing edges (the start/end of a thread) has
    // nothing to bridge, so it's just removed same as before.
    deleteOutlineNode(scriptId, nodeId) {
      get().pushUndo(scriptId)
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (!script) return
        const edges = script.mapLayout.edges
        const incoming = edges.filter((e) => e.to === nodeId).map((e) => e.from)
        const outgoing = edges.filter((e) => e.from === nodeId).map((e) => e.to)
        const isIdea = script.mapLayout.nodes[nodeId] && script.mapLayout.nodes[nodeId].type
        if (isIdea) {
          delete script.mapLayout.nodes[nodeId]
        } else {
          script.sections = script.sections.filter((se) => se.id !== nodeId)
          if (script.sections.length === 0) script.sections.push(mkSection('New section', [mkLine('', null)]))
          script.pinnedSectionIds = script.pinnedSectionIds.filter((id) => id !== nodeId)
          delete script.mapLayout.nodes[nodeId]
        }
        script.mapLayout.edges = script.mapLayout.edges.filter((e) => e.from !== nodeId && e.to !== nodeId)
        incoming.forEach((prevId) => {
          outgoing.forEach((nextId) => {
            if (prevId === nextId || !script.mapLayout.nodes[prevId] || !script.mapLayout.nodes[nextId]) return
            const exists = script.mapLayout.edges.some((e) => e.from === prevId && e.to === nextId)
            if (!exists) script.mapLayout.edges.push({ id: uid(), from: prevId, to: nextId })
          })
        })
        if (script.mapLayout.mainThreadId === nodeId) script.mapLayout.mainThreadId = null
        script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
    },
    duplicateIdeaNode(scriptId, nodeId) {
      get().pushUndo(scriptId)
      let newId = null
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const node = script && script.mapLayout.nodes[nodeId]
        if (!node) return
        newId = uid()
        const isFrame = node.type === 'problem'
        // A frame is copied with what is inside it, set beside the original so the copy's
        // contents don't sit in both frames; anything else is nudged down and right.
        const shift = isFrame ? { x: frameSize(node).w + 60, y: 0 } : { x: 30, y: 30 }
        const copy = { ...JSON.parse(JSON.stringify(node)), x: node.x + shift.x, y: node.y + shift.y }
        delete copy.exit // a problem has one way out; the copy is not it
        if (isFrame) delete copy.parent // set beside the original; filed by where it lands
        script.mapLayout.nodes[newId] = copy
        if (isFrame) {
          const inside = [...descendantIds(script.mapLayout.nodes, [nodeId])].filter((id) => id !== newId)
          const idMap = { [nodeId]: newId }
          inside.forEach((id) => (idMap[id] = uid()))
          inside.forEach((id) => {
            const n = JSON.parse(JSON.stringify(script.mapLayout.nodes[id]))
            n.x += shift.x
            n.y += shift.y
            if (idMap[n.parent]) n.parent = idMap[n.parent]
            else delete n.parent
            script.mapLayout.nodes[idMap[id]] = n
          })
          script.mapLayout.edges
            .filter((e) => idMap[e.from] && idMap[e.to] && e.from !== nodeId && e.to !== nodeId)
            .forEach((e) => script.mapLayout.edges.push({ id: uid(), from: idMap[e.from], to: idMap[e.to] }))
        }
        syncFramesIn(script.mapLayout.nodes, new Set([newId]))
        script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
      return newId
    },
    // Appends a full copy of a section (fresh ids throughout, including
    // every line) at the end of the real script, with its own map node
    // near the original's — a quick way to spin off a variant beat without
    // touching the one it came from.
    duplicateSection(scriptId, sectionId) {
      get().pushUndo(scriptId)
      let newId = null
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const sec = script && script.sections.find((se) => se.id === sectionId)
        if (!sec) return
        const clone = cleanSectionCopy(sec)
        clone.id = uid()
        clone.lines = clone.lines.map((l) => ({ ...l, id: uid() }))
        script.sections.push(clone)
        const origNode = script.mapLayout.nodes[sectionId]
        script.mapLayout.nodes[clone.id] = origNode
          ? { x: origNode.x + 30, y: origNode.y + 30, collapsed: false }
          : { x: 60, y: 60, collapsed: false }
        script.updatedAt = Date.now()
        newId = clone.id
      })
      get().scheduleSave(scriptId, { flash: false })
      return newId
    },
    // Bulk sibling of duplicateSection, one combined pushUndo/set/save for
    // the whole batch — used by the "duplicate selection" keybind so a
    // multi-section selection is still a single undo step (see duplicateLines
    // for the same reasoning on the line side).
    duplicateSections(scriptId, sectionIds) {
      if (!sectionIds.length) return []
      get().pushUndo(scriptId)
      const newIds = []
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (!script) return
        sectionIds.forEach((sectionId) => {
          const sec = script.sections.find((se) => se.id === sectionId)
          if (!sec) return
          const clone = cleanSectionCopy(sec)
          clone.id = uid()
          clone.lines = clone.lines.map((l) => ({ ...l, id: uid() }))
          script.sections.push(clone)
          const origNode = script.mapLayout.nodes[sectionId]
          script.mapLayout.nodes[clone.id] = origNode
            ? { x: origNode.x + 30, y: origNode.y + 30, collapsed: false }
            : { x: 60, y: 60, collapsed: false }
          newIds.push(clone.id)
        })
        script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
      return newIds
    },

    // ---------- pinned section references (editor margin) ----------
    // Not a copy — the same section id rendered a second time in the
    // margin, so edits there are edits to the real section.
    pinSection(scriptId, sectionId) {
      get().pushUndo(scriptId)
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (!script) return
        if (!script.pinnedSectionIds.includes(sectionId)) script.pinnedSectionIds.push(sectionId)
      })
      get().scheduleSave(scriptId, { flash: false })
    },
    unpinSection(scriptId, sectionId) {
      get().pushUndo(scriptId)
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (!script) return
        script.pinnedSectionIds = script.pinnedSectionIds.filter((id) => id !== sectionId)
      })
      get().scheduleSave(scriptId, { flash: false })
    },

    // ---------- A/B line takes ----------
    // A "take" is a past version of a line's text. `line.text` is always the
    // one currently shown everywhere else (teleprompter, export, word
    // count) — recording a new take archives the current text and clears
    // the line for a fresh version; using an old take swaps it back in
    // (archiving whatever was current in its place, so nothing is lost).
    recordNewTake(scriptId, sectionId, lineId) {
      get().pushUndo(scriptId)
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const sec = script && script.sections.find((se) => se.id === sectionId)
        const line = sec && sec.lines.find((l) => l.id === lineId)
        if (!line) return
        line.takes.push(line.text)
        line.text = ''
        script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
    },
    useTake(scriptId, sectionId, lineId, takeIndex) {
      get().pushUndo(scriptId)
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const sec = script && script.sections.find((se) => se.id === sectionId)
        const line = sec && sec.lines.find((l) => l.id === lineId)
        if (!line || takeIndex < 0 || takeIndex >= line.takes.length) return
        const picked = line.takes[takeIndex]
        line.takes[takeIndex] = line.text
        line.text = picked
        script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId)
    },
    deleteTake(scriptId, sectionId, lineId, takeIndex) {
      get().pushUndo(scriptId)
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const sec = script && script.sections.find((se) => se.id === sectionId)
        const line = sec && sec.lines.find((l) => l.id === lineId)
        if (!line) return
        line.takes.splice(takeIndex, 1)
      })
      get().scheduleSave(scriptId, { flash: false })
    },
    openTakesMenu(key) {
      set((s) => {
        s.takesMenuFor = s.takesMenuFor === key ? null : key
      })
    },
    closeTakesMenu() {
      set((s) => {
        s.takesMenuFor = null
      })
    },

    // ---------- daily work log ----------
    // Rolls the previous baseline into history and starts a fresh one
    // whenever the calendar date has moved on since the script was last
    // opened. Word-count delta only (no "scenes completed" — dropped per
    // the user's own call, since that would've depended on the per-section
    // done-tracking feature).
    ensureDailyRollover(scriptId) {
      const script = get().scripts.find((sc) => sc.id === scriptId)
      if (!script) return
      const todayKey = new Date().toISOString().slice(0, 10)
      if (script.dailyBaseline && script.dailyBaseline.date === todayKey) return
      const words = totalWordCountAll(script)
      set((s) => {
        const sc = s.scripts.find((x) => x.id === scriptId)
        if (!sc) return
        if (sc.dailyBaseline) {
          sc.workLogHistory.push({ date: sc.dailyBaseline.date, words: words - sc.dailyBaseline.words })
          if (sc.workLogHistory.length > 30) sc.workLogHistory.shift()
        }
        sc.dailyBaseline = { date: todayKey, words }
      })
      get().scheduleSave(scriptId, { flash: false })
    },

    // ---------- margin panels ----------
    // Open/closed state persists across launches (the user's explicit ask:
    // "if I have it open, and I open [the app], it should be open") — same
    // saveAppSettings() whole-object pattern as noteColor/margin widths/etc.
    toggleLeftMargin() {
      set((s) => {
        s.leftMarginOpen = !s.leftMarginOpen
      })
      get().saveAppSettings()
    },
    toggleRightMargin() {
      set((s) => {
        s.rightMarginOpen = !s.rightMarginOpen
      })
      get().saveAppSettings()
    },
    toggleBookmarksMargin() {
      set((s) => {
        s.bookmarksMarginOpen = !s.bookmarksMarginOpen
      })
      get().saveAppSettings()
    },
    togglePinnedMargin() {
      set((s) => {
        s.pinnedMarginOpen = !s.pinnedMarginOpen
      })
      get().saveAppSettings()
    },

    // ---------- video-timestamp log (left margin) ----------
    addTimestampEntry(scriptId, time) {
      get().pushUndo(scriptId)
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (!script) return
        script.timestampLog.push({ id: uid(), time: time || '', note: '' })
        script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
    },
    setTimestampEntryField(scriptId, entryId, field, value) {
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const entry = script && script.timestampLog.find((t) => t.id === entryId)
        if (entry) entry[field] = value
      })
    },
    commitTimestampEntry(scriptId) {
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (script) script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId)
    },
    deleteTimestampEntry(scriptId, entryId) {
      get().pushUndo(scriptId)
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (!script) return
        script.timestampLog = script.timestampLog.filter((t) => t.id !== entryId)
        script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
    },

    // ---------- project-wide checklist (right margin) ----------
    // Distinct from the per-section "checkpoints" checklist — this one is
    // one list for the whole script, always visible in the margin.
    addProjectChecklistItem(scriptId, text) {
      if (!text || !text.trim()) return
      get().pushUndo(scriptId)
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (!script) return
        script.projectChecklist.push({ id: uid(), text: text.trim(), done: false })
        script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
    },
    toggleProjectChecklistItem(scriptId, itemId) {
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const item = script && script.projectChecklist.find((i) => i.id === itemId)
        if (item) item.done = !item.done
        if (script) script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
    },
    setProjectChecklistItemText(scriptId, itemId, text) {
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const item = script && script.projectChecklist.find((i) => i.id === itemId)
        if (item) item.text = text
      })
    },
    commitProjectChecklistItemText(scriptId) {
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (script) script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId)
    },
    deleteProjectChecklistItem(scriptId, itemId) {
      get().pushUndo(scriptId)
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (!script) return
        script.projectChecklist = script.projectChecklist.filter((i) => i.id !== itemId)
        script.updatedAt = Date.now()
      })
      get().scheduleSave(scriptId, { flash: false })
    }
  }))
)
