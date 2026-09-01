import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { mkLine, mkSection, defaultCategories } from '../lib/model.js'
import { sanitizeHtml, stripHtmlToText } from '../lib/html.js'
import { uid } from '../lib/id.js'
import { diffWords, flattenText } from '../lib/diff.js'
import { buildExportContent, parseImportedText } from '../lib/exportImport.js'
import { DEFAULT_KEYBINDS } from '../lib/keybinds.js'
import { buildNavList } from '../lib/navigation.js'
import { totalWordCountAll } from '../lib/timecode.js'

const MAX_UNDO = 60
const saveTimers = {}
let savedFlashTimer = null
let updateStatusTimer = null
// In-memory only, like the prototype's own `clipboardLines` — never persisted.
let clipboardLines = []

function snapshotScript(script) {
  return {
    title: script.title,
    sections: JSON.parse(JSON.stringify(script.sections)),
    categories: JSON.parse(JSON.stringify(script.categories)),
    pinnedSectionIds: JSON.parse(JSON.stringify(script.pinnedSectionIds)),
    mapLayout: JSON.parse(JSON.stringify(script.mapLayout))
  }
}

export const useStore = create(
  immer((set, get) => ({
    loaded: false,
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
    filterCategory: null,
    librarySearch: '',
    openTagMenuFor: null,
    tagMenuHighlight: 0,
    catAddDraft: false,
    savedFlash: false,
    savedFlashText: 'Saved',
    exportMenuOpen: false,

    sectionJumpOpen: false,
    sectionJumpQuery: '',
    sectionJumpHighlight: 0,
    lineSearchOpen: false,
    lineSearchQuery: '',
    lineSearchHighlight: 0,
    jumpHighlightId: null,
    jumpHighlightLineKey: null,

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
    mapViewOpen: false,
    takesMenuFor: null,
    leftMarginOpen: true,
    rightMarginOpen: true,
    bookmarksMarginOpen: true,
    pinnedMarginOpen: true,
    leftMarginWidth: 210,
    rightMarginWidth: 210,
    noteColor: '#f2a65a',

    teleprompterOpen: false,
    teleprompterFontSize: 40,
    teleprompterAutoScroll: false,
    teleprompterSpeed: 1,

    undoStack: [],
    redoStack: [],
    undoScriptId: null,

    // ---------- persistence ----------
    async init() {
      const [scripts, settings, storageDir, appVersion] = await Promise.all([
        window.bijou.loadAllScripts(),
        window.bijou.loadSettings(),
        window.bijou.getDocsDir(),
        window.bijou.getAppVersion()
      ])
      const sorted = scripts.slice().sort((a, b) => b.updatedAt - a.updatedAt)
      set((s) => {
        s.scripts = scripts
        s.currentScriptId = sorted.length ? sorted[0].id : null
        s.loaded = true
        s.storageDir = storageDir
        s.appVersion = appVersion
        s.diskUpdatedAt = {}
        scripts.forEach((sc) => {
          s.diskUpdatedAt[sc.id] = sc.updatedAt
        })
        if (settings && settings.noteColor) s.noteColor = settings.noteColor
        if (settings && settings.leftMarginWidth) s.leftMarginWidth = settings.leftMarginWidth
        if (settings && settings.rightMarginWidth) s.rightMarginWidth = settings.rightMarginWidth
      })
      if (sorted.length) get().ensureDailyRollover(sorted[0].id)
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
      window.bijou.saveSettings({ noteColor: s.noteColor, leftMarginWidth: s.leftMarginWidth, rightMarginWidth: s.rightMarginWidth })
    },
    setNoteColor(color) {
      set((s) => {
        s.noteColor = color
      })
      get().saveAppSettings()
    },
    setLeftMarginWidth(width) {
      set((s) => {
        s.leftMarginWidth = Math.max(160, Math.min(420, Math.round(width)))
      })
      get().saveAppSettings()
    },
    setRightMarginWidth(width) {
      set((s) => {
        s.rightMarginWidth = Math.max(160, Math.min(420, Math.round(width)))
      })
      get().saveAppSettings()
    },

    scheduleSave(id, { flash = true, text = 'Saved', delay = 250 } = {}) {
      clearTimeout(saveTimers[id])
      saveTimers[id] = setTimeout(async () => {
        const script = get().scripts.find((s) => s.id === id)
        if (!script) return
        try {
          const expected = get().diskUpdatedAt[id]
          const result = await window.bijou.saveScript(script, expected != null ? expected : null)
          set((s) => {
            s.diskUpdatedAt[id] = result.updatedAt
            if (result.conflict) s.saveConflicts[id] = result.backupFile
          })
          if (flash) get().flashSaved(text)
        } catch (err) {
          console.error('BijouDocs: save failed', err)
        }
      }, delay)
    },
    dismissSaveConflict(id) {
      set((s) => {
        delete s.saveConflicts[id]
      })
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
          const sorted = s.scripts.slice().sort((a, b) => b.updatedAt - a.updatedAt)
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
    },
    zoomOut() {
      set((s) => {
        s.zoom = Math.max(0.7, Math.round((s.zoom - 0.1) * 100) / 100)
      })
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
    addSection(scriptId, afterSectionId) {
      get().pushUndo(scriptId)
      let newId = null
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (!script) return
        const sec = mkSection('New section', [mkLine('', null)])
        newId = sec.id
        let idx = script.sections.length
        if (afterSectionId) {
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
    confirmAddCategory(scriptId, name, color) {
      get().pushUndo(scriptId)
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (!script) return
        script.categories.push({ id: uid(), label: name || 'New category', color: color || '#7FA9F2', spoken: true })
        s.catAddDraft = false
      })
      get().scheduleSave(scriptId, { flash: false })
    },
    setCategoryColor(scriptId, categoryId, color) {
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const cat = script && script.categories.find((c) => c.id === categoryId)
        if (cat) cat.color = color
        if (script) script.updatedAt = Date.now()
      })
    },
    commitCategoryColor(scriptId) {
      get().pushUndo(scriptId)
      get().scheduleSave(scriptId, { flash: false })
    },
    setCategoryLabel(scriptId, categoryId, label) {
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const cat = script && script.categories.find((c) => c.id === categoryId)
        if (cat) cat.label = label
      })
    },
    commitCategoryLabel(scriptId) {
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (script) script.updatedAt = Date.now()
      })
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
        sec.lines.push(mkLine(item.text, null))
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
        const [moved] = sec.lines.splice(fromIdx, 1)
        const toIdx = sec.lines.findIndex((l) => l.id === toLineId)
        const insertIdx = toIdx < 0 ? sec.lines.length : position === 'after' ? toIdx + 1 : toIdx
        sec.lines.splice(insertIdx, 0, moved)
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
        toSec.checklist.push({ id: uid(), text: stripHtmlToText(moved.text), done: false })
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
          mapLayout: { nodes: {}, edges: [], mainThreadId: null, hideSummaries: false }
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
    copyLineToClipboard(scriptId, sectionId, lineId) {
      const script = get().scripts.find((sc) => sc.id === scriptId)
      const sec = script && script.sections.find((se) => se.id === sectionId)
      const line = sec && sec.lines.find((l) => l.id === lineId)
      if (!line) return 0
      clipboardLines = [JSON.parse(JSON.stringify(line))]
      return 1
    },
    copySelectionToClipboard(scriptId) {
      const { selectedLines } = get()
      const script = get().scripts.find((sc) => sc.id === scriptId)
      if (!script || !selectedLines.length) return 0
      clipboardLines = selectedLines
        .map((k) => {
          const [secId, lineId] = k.split(':')
          const sec = script.sections.find((se) => se.id === secId)
          const line = sec && sec.lines.find((l) => l.id === lineId)
          return line ? JSON.parse(JSON.stringify(line)) : null
        })
        .filter(Boolean)
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
        const clone = JSON.parse(JSON.stringify(sec.lines[idx]))
        clone.id = uid()
        clone.noteOpen = false
        sec.lines.splice(idx + 1, 0, clone)
        script.updatedAt = Date.now()
        newKey = sectionId + ':' + clone.id
      })
      get().scheduleSave(scriptId, { flash: false })
      return newKey
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

    // ---------- video map / story-beat board ----------
    toggleMapView() {
      set((s) => {
        s.mapViewOpen = !s.mapViewOpen
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
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (!script) return
        let i = Object.keys(script.mapLayout.nodes).length
        script.sections.forEach((sec) => {
          if (script.mapLayout.nodes[sec.id]) return
          script.mapLayout.nodes[sec.id] = { x: 60, y: 60 + i * 190, collapsed: false }
          i++
        })
      })
    },
    setMapNodePosition(scriptId, sectionId, x, y) {
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        const node = script && script.mapLayout.nodes[sectionId]
        if (node) {
          node.x = x
          node.y = y
        }
      })
      get().scheduleSave(scriptId, { flash: false })
    },
    addSectionFromMap(scriptId, x, y) {
      const newId = get().addSection(scriptId)
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (script && newId) script.mapLayout.nodes[newId] = { x, y, collapsed: false }
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
    toggleMapHideSummaries(scriptId) {
      set((s) => {
        const script = s.scripts.find((sc) => sc.id === scriptId)
        if (script) script.mapLayout.hideSummaries = !script.mapLayout.hideSummaries
      })
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
    toggleLeftMargin() {
      set((s) => {
        s.leftMarginOpen = !s.leftMarginOpen
      })
    },
    toggleRightMargin() {
      set((s) => {
        s.rightMarginOpen = !s.rightMarginOpen
      })
    },
    toggleBookmarksMargin() {
      set((s) => {
        s.bookmarksMarginOpen = !s.bookmarksMarginOpen
      })
    },
    togglePinnedMargin() {
      set((s) => {
        s.pinnedMarginOpen = !s.pinnedMarginOpen
      })
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
