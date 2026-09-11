import React, { useEffect, useState } from 'react'
import Icon from '../icons.jsx'

// Manages Chromium's own spellchecker custom-dictionary — the words
// "Add to dictionary" (in the right-click spelling menu) has remembered.
// That menu can only ever add a word; this is the other half, letting you
// see and un-remember specific ones. Plain session state, not app data —
// no store action needed, just the two IPC calls in preload.
export default function DictionaryPanel() {
  const [words, setWords] = useState(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    window.bijou.listDictionaryWords().then(setWords)
  }, [])

  function forget(word) {
    window.bijou.removeFromDictionary(word)
    setWords((prev) => prev.filter((w) => w !== word))
  }

  const q = query.trim().toLowerCase()
  const filtered = words ? (q ? words.filter((w) => w.toLowerCase().includes(q)) : words) : null

  return (
    <div className="dict-panel">
      <div className="sc-desc" style={{ marginBottom: 8 }}>
        Words remembered via "Add to dictionary" on a misspelled word — stops the red squiggly underline for that
        word. Forgetting one here brings the underline back.
      </div>
      {words && words.length > 3 && (
        <div className="search-wrap" style={{ marginBottom: 8 }}>
          <Icon name="search" />
          <input placeholder="Search remembered words" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      )}
      {words === null && <div className="sj-empty">Loading…</div>}
      {words && words.length === 0 && <div className="sj-empty">No words remembered yet.</div>}
      {filtered && filtered.length === 0 && words.length > 0 && <div className="sj-empty">No matches.</div>}
      {filtered && filtered.length > 0 && (
        <div className="dict-word-list">
          {filtered.map((w) => (
            <div className="dict-word-row" key={w}>
              <span>{w}</span>
              <button className="dict-word-forget" title={'Forget "' + w + '"'} onClick={() => forget(w)}>
                <Icon name="x" size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
