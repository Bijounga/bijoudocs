import React, { useRef } from 'react'
import { useStore } from '../../state/store.js'

// One persistent to-do list for the whole script — distinct from the
// per-section "checkpoints" checklists, always visible in the margin.
export default function ProjectChecklistPanel({ scriptId, script }) {
  const pushUndo = useStore((s) => s.pushUndo)
  const addProjectChecklistItem = useStore((s) => s.addProjectChecklistItem)
  const toggleProjectChecklistItem = useStore((s) => s.toggleProjectChecklistItem)
  const setProjectChecklistItemText = useStore((s) => s.setProjectChecklistItemText)
  const commitProjectChecklistItemText = useStore((s) => s.commitProjectChecklistItemText)
  const deleteProjectChecklistItem = useStore((s) => s.deleteProjectChecklistItem)
  const addInputRef = useRef(null)

  function submitAdd() {
    addProjectChecklistItem(scriptId, addInputRef.current.value)
    addInputRef.current.value = ''
    addInputRef.current.focus()
  }

  return (
    <>
      {script.projectChecklist.length === 0 && (
        <div className="margin-empty">Nothing yet — a running to-do list for the whole script.</div>
      )}
      {script.projectChecklist.map((item) => (
        <div className={'checklist-item' + (item.done ? ' done' : '')} key={item.id}>
          <input type="checkbox" checked={item.done} onChange={() => toggleProjectChecklistItem(scriptId, item.id)} />
          <input
            type="text"
            value={item.text}
            onFocus={() => pushUndo(scriptId)}
            onChange={(e) => setProjectChecklistItemText(scriptId, item.id, e.target.value)}
            onBlur={() => commitProjectChecklistItemText(scriptId)}
          />
          <button className="check-item-btn del" onClick={() => deleteProjectChecklistItem(scriptId, item.id)} title="Delete">
            &times;
          </button>
        </div>
      ))}
      <div className="checklist-add">
        <input
          type="text"
          ref={addInputRef}
          placeholder="Add a to-do"
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
