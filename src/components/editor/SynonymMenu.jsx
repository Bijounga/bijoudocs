import React from 'react'
import { useStore } from '../../state/store.js'
import { consumeSynonymSelection, getLineEl } from '../../state/lineRefs.js'

// Anchored the same way TagMenu is — a plain absolutely-positioned popup
// inside the line's own `.line` (position: relative) container, opened by
// either the findSynonyms keybind or the line's right-click menu, both of
// which already captured the word + a live Range via captureWordSelection
// before calling openSynonymMenu (see lineRefs.js/store.js) — this only
// ever reads the *results* of that, and handles putting a picked word
// back into the line.
export default function SynonymMenu({ scriptId, sectionId, lineId }) {
  const word = useStore((s) => s.synonymMenuWord)
  const results = useStore((s) => s.synonymMenuResults)
  const loading = useStore((s) => s.synonymMenuLoading)
  const error = useStore((s) => s.synonymMenuError)
  const closeSynonymMenu = useStore((s) => s.closeSynonymMenu)
  const commitLineText = useStore((s) => s.commitLineText)
  const pushUndo = useStore((s) => s.pushUndo)

  const key = sectionId + ':' + lineId

  function pick(synonym) {
    pushUndo(scriptId)
    const range = consumeSynonymSelection(key)
    const el = getLineEl(key)
    closeSynonymMenu()
    if (!el || !range) return
    el.focus()
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(range)
    document.execCommand('insertText', false, synonym)
    commitLineText(scriptId, sectionId, lineId, el.innerHTML)
  }

  return (
    <div className="synonym-menu">
      <div className="synonym-menu-title">Synonyms for “{word}”</div>
      {loading && <div className="synonym-menu-status">Looking up…</div>}
      {!loading && error && <div className="synonym-menu-status">{error}</div>}
      {!loading && !error && results.length === 0 && <div className="synonym-menu-status">No synonyms found.</div>}
      {!loading && !error && results.length > 0 && (
        <div className="synonym-menu-list">
          {results.map((s) => (
            <button key={s} className="synonym-menu-chip" onClick={() => pick(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
