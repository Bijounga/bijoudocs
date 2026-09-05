import { useEffect } from 'react'
import { useStore } from '../state/store.js'
import { comboFromEvent, COLOR_PALETTE } from '../lib/keybinds.js'
import { focusLineEnd, getLineEl, placeCaretEnd, wasOutlineLastFocused } from '../state/lineRefs.js'

let colorCycleIndex = 0

// Commits whatever's currently in a line's contentEditable DOM into the
// store, used after document.execCommand mutates it directly (bold/strike/
// color) — mirrors the prototype's commitLineFromEl(active).
function commitActiveLine(st, scriptId, lineKey) {
  const el = getLineEl(lineKey)
  if (!el) return
  const [secId, lineId] = lineKey.split(':')
  st.commitLineText(scriptId, secId, lineId, el.innerHTML)
}

// Undo/redo change the store immediately, but LineText's own sync effect
// deliberately skips writing into a still-focused element (so it never
// clobbers active typing) — so if you undo a bold/italic/underline/color
// edit without first clicking away from that same line, the store reverts
// correctly but the line visually keeps showing the un-undone formatting,
// looking exactly like Ctrl+Z "did nothing". Force the one focused element
// straight from the just-updated store right after undo/redo specifically,
// since the user just explicitly asked to see a change, not type one.
function forceSyncFocusedElement(st) {
  const active = document.activeElement
  if (!active || !active.dataset) return
  const script = st.scripts.find((s) => s.id === st.currentScriptId)
  if (!script) return
  const lineKey = active.dataset.lineKey
  if (lineKey) {
    const [secId, lineId] = lineKey.split(':')
    const sec = script.sections.find((se) => se.id === secId)
    const line = sec && sec.lines.find((l) => l.id === lineId)
    if (line && active.innerHTML !== (line.text || '')) {
      active.innerHTML = line.text || ''
      placeCaretEnd(active)
    }
    return
  }
  const headingFor = active.dataset.headingFor
  if (headingFor) {
    const sec = script.sections.find((se) => se.id === headingFor)
    if (sec && active.value !== sec.heading) active.value = sec.heading
  }
}

// One global keydown listener for the whole rebindable-shortcut system,
// selection actions (delete/move/copy/cut/paste), and the tag-menu's
// keyboard navigation — mirrors the prototype's single onGlobalKeyDown.
// Installed once; always reads fresh state via useStore.getState() so it
// never closes over stale values.
export function useGlobalKeydown() {
  useEffect(() => {
    function onKeyDown(e) {
      const st = useStore.getState()

      // Teleprompter is a full takeover with its own keydown listener
      // (Escape/Space/+/-) — don't let shortcuts fire underneath it.
      if (st.teleprompterOpen) return

      if (st.rebindingActionKey) {
        if (e.key === 'Escape') {
          st.cancelRebind()
          return
        }
        if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return
        e.preventDefault()
        st.setKeybind(st.rebindingActionKey, comboFromEvent(e))
        return
      }

      const combo = comboFromEvent(e)
      const active = document.activeElement
      const activeLineKey = active && active.dataset ? active.dataset.lineKey : null
      const activeHeadingFor = active && active.dataset ? active.dataset.headingFor : null
      const activeNoteKey = active && active.dataset ? active.dataset.noteKey : null
      const activeNodeId = active && active.dataset ? active.dataset.nodeId : null
      const editing = !!(
        active &&
        (activeLineKey || active.tagName === 'TEXTAREA' || (active.tagName === 'INPUT' && active.type === 'text'))
      )

      if (combo === 'ctrl+z') {
        e.preventDefault()
        st.undo()
        forceSyncFocusedElement(useStore.getState())
        return
      }
      if (combo === 'ctrl+shift+z') {
        e.preventDefault()
        st.redo()
        forceSyncFocusedElement(useStore.getState())
        return
      }

      const script = st.scripts.find((s) => s.id === st.currentScriptId)
      if (!script) return

      if ((st.selectedLines.length || st.selectedSections.length) && (combo === 'ctrl+shift+arrowup' || combo === 'ctrl+shift+arrowdown') && !editing) {
        e.preventDefault()
        const dir = combo === 'ctrl+shift+arrowup' ? -1 : 1
        if (st.selectedSections.length) st.moveSelectedSections(script.id, dir)
        else st.moveSelectedLines(script.id, dir)
        return
      }

      if ((st.selectedLines.length || st.selectedSections.length) && (e.key === 'Backspace' || e.key === 'Delete') && !editing) {
        e.preventDefault()
        st.deleteSelection(script.id)
        return
      }

      if (st.selectedLines.length && e.key === 'Enter' && !editing) {
        e.preventDefault()
        const lastKey = st.selectedLines[st.selectedLines.length - 1]
        const [noteSecId, noteLineId] = lastKey.split(':')
        st.clearLineSelection()
        const sec = script.sections.find((s) => s.id === noteSecId)
        const line = sec && sec.lines.find((l) => l.id === noteLineId)
        if (line && !line.noteOpen) {
          st.toggleLineNote(script.id, noteSecId, noteLineId)
          setTimeout(() => {
            const ta = document.querySelector('[data-note-key="' + lastKey + '"]')
            if (ta) ta.focus()
          }, 0)
        } else {
          focusLineEnd(lastKey)
        }
        return
      }
      if (st.selectedLines.length && e.key === ' ' && !editing) {
        e.preventDefault()
        const lastKey = st.selectedLines[st.selectedLines.length - 1]
        st.clearLineSelection()
        focusLineEnd(lastKey)
        return
      }

      if (st.selectedLines.length && combo === 'ctrl+c' && !editing) {
        e.preventDefault()
        const n = st.copySelectionToClipboard(script.id)
        st.flashSaved('Copied ' + n + ' line' + (n === 1 ? '' : 's'))
        return
      }

      if (st.selectedLines.length && combo === 'ctrl+x' && !editing) {
        e.preventDefault()
        const n = st.cutSelectionToClipboard(script.id)
        st.flashSaved('Cut ' + n + ' line' + (n === 1 ? '' : 's'))
        return
      }

      if (combo === 'ctrl+v' && st.hasClipboard()) {
        e.preventDefault()
        let opts = {}
        if (activeLineKey) opts = { atLineKey: activeLineKey }
        else if (st.selectedLines.length) opts = { afterSelected: true }
        const newKeys = st.pasteClipboard(script.id, opts)
        if (newKeys && newKeys.length) st.flashSaved('Pasted ' + newKeys.length + ' line' + (newKeys.length === 1 ? '' : 's'))
        return
      }

      if (combo === st.keybinds.duplicate) {
        e.preventDefault()
        if (st.selectedLines.length) {
          const n = st.selectedLines.length
          const newKeys = st.duplicateLines(script.id, st.selectedLines)
          st.setSelectedLines(newKeys)
          st.flashSaved('Duplicated ' + n + ' line' + (n === 1 ? '' : 's'))
        } else if (st.selectedSections.length) {
          const n = st.selectedSections.length
          st.duplicateSections(script.id, st.selectedSections)
          st.flashSaved('Duplicated ' + n + ' section' + (n === 1 ? '' : 's'))
        } else if (activeLineKey) {
          const [secId, lineId] = activeLineKey.split(':')
          const newKey = st.duplicateLine(script.id, secId, lineId)
          if (newKey) focusLineEnd(newKey)
        } else if (activeHeadingFor) {
          st.duplicateSection(script.id, activeHeadingFor)
        }
        return
      }

      if (combo === st.keybinds.strike && st.selectedLines.length) {
        e.preventDefault()
        st.toggleStruckForLines(script.id, st.selectedLines)
        return
      }
      if (combo === st.keybinds.strike && activeHeadingFor) {
        e.preventDefault()
        st.toggleStruckForSection(script.id, activeHeadingFor)
        return
      }

      if (combo === st.keybinds.focusMode) {
        e.preventDefault()
        st.toggleFocusMode()
        return
      }
      if (combo === st.keybinds.hideTags) {
        e.preventDefault()
        st.toggleHideTags()
        return
      }
      if (combo === st.keybinds.hideNotes) {
        e.preventDefault()
        st.toggleHideNotes()
        return
      }

      if (combo === st.keybinds.newSection) {
        e.preventDefault()
        const afterSectionId = activeLineKey ? activeLineKey.split(':')[0] : activeHeadingFor || null
        const newId = st.addSection(script.id, afterSectionId)
        setTimeout(() => {
          const t = document.querySelector('[data-heading-for="' + newId + '"]')
          if (t) {
            t.focus()
            t.select()
          }
        }, 0)
        return
      }

      if (combo === st.keybinds.checklistToggle) {
        e.preventDefault()
        let secId = null
        if (activeLineKey) secId = activeLineKey.split(':')[0]
        else if (activeHeadingFor) secId = activeHeadingFor
        else if (script.activeTabId !== 'all') secId = script.activeTabId
        if (secId) st.toggleSectionChecklistOpen(script.id, secId)
        return
      }

      if (combo === st.keybinds.search) {
        e.preventDefault()
        st.toggleLineSearch()
        return
      }

      if (combo === st.keybinds.tabBack) {
        e.preventDefault()
        st.tabBack(script.id)
        return
      }
      if (combo === st.keybinds.tabForward) {
        e.preventDefault()
        st.tabForward(script.id)
        return
      }
      if (combo === 'ctrl+tab') {
        e.preventDefault()
        st.cycleTabs(script.id, 1)
        return
      }
      if (combo === 'ctrl+shift+tab') {
        e.preventDefault()
        st.cycleTabs(script.id, -1)
        return
      }

      if (st.openTagMenuFor) {
        const tagKey = st.openTagMenuFor
        const total = script.categories.length + 1
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          st.setTagMenuHighlight((st.tagMenuHighlight + 1) % total)
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          st.setTagMenuHighlight((st.tagMenuHighlight - 1 + total) % total)
          return
        }
        if (e.key === 'Enter') {
          e.preventDefault()
          const [secId, lineId] = tagKey.split(':')
          const catId = st.tagMenuHighlight === script.categories.length ? null : script.categories[st.tagMenuHighlight].id
          st.setLineTag(script.id, secId, lineId, catId)
          focusLineEnd(tagKey)
          return
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          st.closeTagMenu()
          focusLineEnd(tagKey)
          return
        }
        const n = parseInt(e.key, 10)
        if (!isNaN(n) && n >= 1 && n <= script.categories.length) {
          e.preventDefault()
          const [secId, lineId] = tagKey.split(':')
          st.setLineTag(script.id, secId, lineId, script.categories[n - 1].id)
          focusLineEnd(tagKey)
          return
        }
      }

      // Note keybind pressed while typing inside the note itself (not the
      // line) — the line-scoped block below never sees this, since a note
      // textarea carries data-note-key, not data-line-key, so without this
      // it silently did nothing instead of closing the note back up.
      if (combo === st.keybinds.noteLine && activeNoteKey) {
        e.preventDefault()
        const [noteSecId, noteLineId] = activeNoteKey.split(':')
        st.toggleLineNote(script.id, noteSecId, noteLineId)
        focusLineEnd(activeNoteKey)
        return
      }

      // Both resume-point actions work from either the script (a focused
      // line) or the Outline (a focused item's title/text field, tagged
      // with data-node-id) — checked here, before the script-only gate
      // below, since the Outline case never has an activeLineKey at all.
      if (combo === st.keybinds.markResumePoint) {
        if (activeLineKey) {
          e.preventDefault()
          const [markSecId, markLineId] = activeLineKey.split(':')
          st.toggleResumeLine(script.id, markSecId, markLineId)
          return
        }
        if (activeNodeId) {
          e.preventDefault()
          st.toggleResumeOutlineNode(script.id, activeNodeId)
          return
        }
      }
      if (combo === st.keybinds.jumpToResumePoint) {
        e.preventDefault()
        // Split mode (script + Outline side by side) leaves outlineViewOpen
        // true regardless of which side the user's actually working in —
        // disambiguate by whichever pane was last really focused.
        const isOutline = st.outlineViewOpen && (!st.outlineSplitOpen || wasOutlineLastFocused() !== false)
        if (isOutline) {
          st.jumpToResumeOutlineNode(script.id)
        } else {
          if (st.mapViewOpen) st.toggleMapView()
          st.jumpToResumeLine(script.id)
        }
        return
      }

      if (!activeLineKey) return
      const [secId, lineId] = activeLineKey.split(':')

      if (combo === st.keybinds.bold) {
        e.preventDefault()
        document.execCommand('bold')
        commitActiveLine(st, script.id, activeLineKey)
        return
      }
      if (combo === st.keybinds.italic) {
        e.preventDefault()
        document.execCommand('italic')
        commitActiveLine(st, script.id, activeLineKey)
        return
      }
      if (combo === st.keybinds.underline) {
        e.preventDefault()
        // Chromium's own default Ctrl+U handling would do this same
        // execCommand call for free, but silently — never routing through
        // commitActiveLine, so the change never reached the store and
        // Ctrl+Z had nothing to undo. Handling it ourselves (same pattern
        // as bold/italic/strike) fixes that.
        document.execCommand('underline')
        commitActiveLine(st, script.id, activeLineKey)
        return
      }
      if (combo === st.keybinds.strike) {
        e.preventDefault()
        document.execCommand('strikeThrough')
        commitActiveLine(st, script.id, activeLineKey)
        return
      }
      if (combo === st.keybinds.color) {
        e.preventDefault()
        document.execCommand('foreColor', false, COLOR_PALETTE[colorCycleIndex % COLOR_PALETTE.length])
        colorCycleIndex++
        commitActiveLine(st, script.id, activeLineKey)
        return
      }
      if (combo === st.keybinds.tagLine) {
        e.preventDefault()
        st.openTagMenu(activeLineKey)
        focusLineEnd(activeLineKey)
        return
      }
      if (combo === st.keybinds.clearTag) {
        e.preventDefault()
        st.setLineTag(script.id, secId, lineId, null)
        focusLineEnd(activeLineKey)
        return
      }
      if (combo === st.keybinds.clearNote) {
        e.preventDefault()
        // clearAndCloseNote itself doesn't push undo (its other call site,
        // NoteBox's own backspace-when-empty, relies on the note's
        // focus-time snapshot already covering it) — but this keybind can
        // fire from the line, with no such snapshot guaranteed yet, so a
        // stray press would otherwise destroy a note with no way back.
        st.pushUndo(script.id)
        st.clearAndCloseNote(script.id, secId, lineId)
        focusLineEnd(activeLineKey)
        return
      }
      if (combo === st.keybinds.noteLine) {
        e.preventDefault()
        const wasOpen = (() => {
          const sec = script.sections.find((s) => s.id === secId)
          const line = sec && sec.lines.find((l) => l.id === lineId)
          return line && line.noteOpen
        })()
        st.toggleLineNote(script.id, secId, lineId)
        if (!wasOpen) {
          setTimeout(() => {
            const ta = document.querySelector('[data-note-key="' + activeLineKey + '"]')
            if (ta) ta.focus()
          }, 0)
        } else {
          focusLineEnd(activeLineKey)
        }
        return
      }
      if (combo === st.keybinds.selectLine) {
        e.preventDefault()
        st.toggleLineSelected(activeLineKey)
        active.blur()
        return
      }
      if (combo === st.keybinds.newTake) {
        e.preventDefault()
        commitActiveLine(st, script.id, activeLineKey)
        st.recordNewTake(script.id, secId, lineId)
        // Clear the DOM directly instead of blur+refocus: the line-text sync
        // effect skips a still-focused element, but blurring-then-refocusing
        // the *same* element fires a real focus event, which triggers a
        // second, redundant pushUndo on top of recordNewTake's own — made
        // Ctrl+Z need two presses to undo one take instead of one.
        const el = getLineEl(activeLineKey)
        if (el) {
          el.innerHTML = ''
          placeCaretEnd(el)
        }
        return
      }
      if (combo === st.keybinds.bookmark) {
        e.preventDefault()
        st.toggleLineBookmark(script.id, secId, lineId)
        return
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])
}
