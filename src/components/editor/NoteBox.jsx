import React, { useEffect, useRef } from 'react'
import { useStore } from '../../state/store.js'
import { focusLineEnd } from '../../state/lineRefs.js'

export default function NoteBox({ scriptId, sectionId, line, indent }) {
  const pushUndo = useStore((s) => s.pushUndo)
  const setLineNote = useStore((s) => s.setLineNote)
  const commitLineNote = useStore((s) => s.commitLineNote)
  const clearAndCloseNote = useStore((s) => s.clearAndCloseNote)
  const toggleLineNote = useStore((s) => s.toggleLineNote)

  const key = sectionId + ':' + line.id
  const rootRef = useRef(null)

  // Click anywhere outside this note closes it back to the collapsed
  // preview — same "click outside to dismiss" pattern as the tag menu.
  // Excludes the note-trigger button and the right-click context menu's
  // "Close note" item, both of which already call toggleLineNote
  // themselves; without the exclusion, this listener would close it and
  // then their own onClick would immediately reopen it.
  useEffect(() => {
    function onMouseDown(e) {
      if (rootRef.current && rootRef.current.contains(e.target)) return
      if (e.target.closest('.note-trigger') || e.target.closest('.context-menu')) return
      commitLineNote(scriptId, sectionId, line.id)
      toggleLineNote(scriptId, sectionId, line.id)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [scriptId, sectionId, line.id, commitLineNote, toggleLineNote])

  function handleKeyDown(e) {
    // Plain Enter closes the note back to its preview; Shift+Enter falls
    // through to the textarea's own default behavior (insert a newline).
    if (
      (e.key === 'Enter' && !e.shiftKey) ||
      e.key === 'Escape' ||
      (e.key === 'ArrowUp' && e.target.selectionStart === 0 && e.target.selectionEnd === 0)
    ) {
      e.preventDefault()
      toggleLineNote(scriptId, sectionId, line.id)
      focusLineEnd(key)
      return
    }
    if ((e.key === 'Backspace' || e.key === 'Delete') && e.target.value.trim() === '') {
      e.preventDefault()
      clearAndCloseNote(scriptId, sectionId, line.id)
      focusLineEnd(key)
    }
  }

  return (
    <div className="note-box" ref={rootRef} style={{ marginLeft: indent * 22 }}>
      <textarea
        placeholder="Add a note for this line..."
        value={line.note}
        data-note-key={key}
        onFocus={() => pushUndo(scriptId)}
        onChange={(e) => setLineNote(scriptId, sectionId, line.id, e.target.value)}
        onBlur={() => commitLineNote(scriptId, sectionId, line.id)}
        onKeyDown={handleKeyDown}
      />
    </div>
  )
}
