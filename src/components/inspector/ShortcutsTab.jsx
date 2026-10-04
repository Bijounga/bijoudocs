import React, { useState } from 'react'
import { useStore } from '../../state/store.js'
import { SHORTCUT_META } from '../../lib/keybinds.js'
import Icon from '../icons.jsx'
import HelpTip from '../HelpTip.jsx'
import DictionaryPanel from './DictionaryPanel.jsx'

// Built-in, non-rebindable keys and gestures — listed the same way as the
// rebindable ones above them, with the detail in each row's tooltip.
const BUILT_IN = [
  { keys: 'Ctrl+Z', label: 'Undo' },
  { keys: 'Ctrl+Shift+Z', label: 'Redo' },
  { keys: '↑ ↓ ← →', label: 'Move between lines', desc: 'Once the cursor reaches the edge of a line or section title.' },
  { keys: 'Shift+↑ ↓', label: 'Extend line selection', desc: 'While typing — no mouse needed.' },
  { keys: 'Tab', label: 'Indent', desc: 'Shift+Tab outdents.' },
  {
    keys: 'Backspace',
    label: 'Merge with line above',
    desc: 'At the start of a line: merges it into the line above, outdents it, or deletes it if empty.'
  },
  { keys: 'Delete', label: 'Delete line', desc: 'Removes the whole current line and moves to the end of the one above.' },
  { keys: 'Enter', label: 'Edit selected line', desc: 'Space works too — the cursor lands at the end.' },
  { keys: 'Enter / Esc', label: 'Leave a note', desc: 'Enter also selects the line; Up at the top of a note just exits.' },
  { keys: 'Ctrl+X / C', label: 'Cut / copy selection', desc: 'Backspace or Delete removes the selection.' },
  { keys: 'Ctrl+Shift+↑ ↓', label: 'Move selection' },
  { keys: 'Ctrl+V', label: 'Paste under a line', desc: 'Or in place of it, if the line is empty.' },
  { keys: '↑ ↓ Enter', label: 'Search results', desc: 'In either search box: move through results, Enter jumps.' },
  {
    keys: 'Grip',
    label: 'Select / reorder',
    desc:
      'Every line and section has a grip handle on hover — click to select (shift-click or drag also work), drag to reorder, or drag a line onto the section checkpoints (or a checkpoint back into the section) to convert it.'
  },
  { keys: 'Dbl-click', label: 'Open as a tab', desc: 'Double-click a section title, or use its new-tab button.' },
  { keys: 'Click', label: 'Resize a pasted image', desc: 'Each click cycles its size.' }
]

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
  const builtIn = q
    ? BUILT_IN.filter((b) => (b.label + ' ' + (b.desc || '') + ' ' + b.keys).toLowerCase().includes(q))
    : BUILT_IN

  return (
    <>
      <div className="search-wrap" style={{ marginBottom: 10 }}>
        <Icon name="search" />
        <input placeholder="Search keybinds" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      {filtered.length === 0 && builtIn.length === 0 && <div className="sj-empty">No shortcuts match.</div>}
      {filtered.map((m) => {
        const combo = keybinds[m.id]
        const listening = rebindingActionKey === m.id
        return (
          <div className="sc-row" key={m.id} title={m.desc}>
            <div className="sc-label">{m.label}</div>
            <button
              className={'kbd-pill' + (listening ? ' listening' : '')}
              onClick={() => startRebind(m.id)}
              title="Click, then press a new key combination"
            >
              {listening ? 'Press keys…' : combo}
            </button>
          </div>
        )
      })}
      {builtIn.length > 0 && <div className="insp-section-title">Built in</div>}
      {builtIn.map((b) => (
        <div className="sc-row" key={b.label} title={b.desc}>
          <div className="sc-label">{b.label}</div>
          <span className="kbd-pill static">{b.keys}</span>
        </div>
      ))}
      <div className="insp-section-title">
        Dictionary
        <HelpTip text={'Words remembered via "Add to dictionary" on a misspelled word — no red underline for them. Forget one to bring the underline back.'} />
      </div>
      <DictionaryPanel />
    </>
  )
}
