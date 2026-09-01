import React, { useState } from 'react'
import { useStore } from '../../state/store.js'
import { SHORTCUT_META } from '../../lib/keybinds.js'
import Icon from '../icons.jsx'

export default function ShortcutsTab() {
  const keybinds = useStore((s) => s.keybinds)
  const rebindingActionKey = useStore((s) => s.rebindingActionKey)
  const startRebind = useStore((s) => s.startRebind)
  const [query, setQuery] = useState('')

  const q = query.trim().toLowerCase()
  const filtered = q
    ? SHORTCUT_META.filter(
        (m) => m.label.toLowerCase().includes(q) || m.desc.toLowerCase().includes(q) || (keybinds[m.id] || '').toLowerCase().includes(q)
      )
    : SHORTCUT_META

  return (
    <>
      <div className="search-wrap" style={{ marginBottom: 10 }}>
        <Icon name="search" />
        <input placeholder="Search keybinds" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      {filtered.length === 0 && <div className="sj-empty">No shortcuts match.</div>}
      {filtered.map((m) => {
        const combo = keybinds[m.id]
        const listening = rebindingActionKey === m.id
        return (
          <div className="sc-row" key={m.id}>
            <div>
              <div className="sc-label">{m.label}</div>
              <div className="sc-desc">{m.desc}</div>
            </div>
            <button className={'kbd-pill' + (listening ? ' listening' : '')} onClick={() => startRebind(m.id)}>
              {listening ? 'Press keys…' : combo}
            </button>
          </div>
        )
      })}
      <div className="insp-hint">
        Also built in, not rebindable: Ctrl+Z / Ctrl+Shift+Z undo and redo. Left/Right/Up/Down move between lines and
        section titles once your cursor hits the edge of one; Shift+Up/Down while typing extends a line selection
        without needing the mouse. In a note, Enter exits and selects the line, Escape or Up-at-the-top just exits.
        With a line selected, Enter or Space jumps back into editing it, cursor at the end. Tab/Shift+Tab indents.
        Backspace merges into the line above, or outdents, or deletes an empty line; Delete always removes the whole
        current line and moves you to the end of the one above. Every line and section has a grip handle on hover —
        click it to select (shift-click or click-drag also work), drag it to reorder, or drag a line onto a
        checkpoint (or a checkpoint anywhere in a section) to convert between the two. With a selection active,
        Backspace/Delete removes it, Ctrl+X cuts, Ctrl+C copies, Ctrl+Shift+Up/Down moves it. Click into any line and
        press Ctrl+V to paste under it (or in place of it, if empty). Click a pasted image to cycle its size. In
        either search box, arrow keys move through results and Enter jumps to the highlighted one. Double-click a
        title, or use its new-tab button, to open it as its own tab.
      </div>
    </>
  )
}
