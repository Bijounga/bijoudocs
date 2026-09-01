import React, { useRef } from 'react'
import { useStore } from '../../state/store.js'

// A manual log of real recorded-video timestamps — BijouDocs has no video
// player to pull these from automatically, so it's just a running list you
// jot notes against after a take ("2:14 — flubbed this line, redo").
export default function TimestampLogPanel({ scriptId, script }) {
  const pushUndo = useStore((s) => s.pushUndo)
  const addTimestampEntry = useStore((s) => s.addTimestampEntry)
  const setTimestampEntryField = useStore((s) => s.setTimestampEntryField)
  const commitTimestampEntry = useStore((s) => s.commitTimestampEntry)
  const deleteTimestampEntry = useStore((s) => s.deleteTimestampEntry)
  const timeInputRef = useRef(null)

  function submitAdd() {
    addTimestampEntry(scriptId, timeInputRef.current.value)
    timeInputRef.current.value = ''
    timeInputRef.current.focus()
  }

  return (
    <>
      {script.timestampLog.length === 0 && (
        <div className="margin-empty">No timestamps yet — note real recorded times here as you film.</div>
      )}
      {script.timestampLog.map((entry) => (
        <div className="timestamp-row" key={entry.id}>
          <input
            type="text"
            className="timestamp-time"
            placeholder="0:00"
            value={entry.time}
            onFocus={() => pushUndo(scriptId)}
            onChange={(e) => setTimestampEntryField(scriptId, entry.id, 'time', e.target.value)}
            onBlur={() => commitTimestampEntry(scriptId)}
          />
          <input
            type="text"
            className="timestamp-note"
            placeholder="Note…"
            value={entry.note}
            onFocus={() => pushUndo(scriptId)}
            onChange={(e) => setTimestampEntryField(scriptId, entry.id, 'note', e.target.value)}
            onBlur={() => commitTimestampEntry(scriptId)}
          />
          <button className="check-item-btn del" onClick={() => deleteTimestampEntry(scriptId, entry.id)} title="Delete">
            &times;
          </button>
        </div>
      ))}
      <div className="checklist-add">
        <input
          type="text"
          ref={timeInputRef}
          placeholder="Timestamp, e.g. 2:14"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              submitAdd()
            }
          }}
        />
        <button onClick={submitAdd}>+</button>
      </div>
    </>
  )
}
