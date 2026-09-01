import React, { useRef } from 'react'
import { useStore } from '../../state/store.js'
import Icon from '../icons.jsx'
import { useDropIndicator } from '../../hooks/useDropIndicator.js'

function ChecklistItemRow({ scriptId, sec, item }) {
  const toggleCheckItem = useStore((s) => s.toggleCheckItem)
  const setCheckItemText = useStore((s) => s.setCheckItemText)
  const commitCheckItemText = useStore((s) => s.commitCheckItemText)
  const promoteCheckItem = useStore((s) => s.promoteCheckItem)
  const deleteCheckItem = useStore((s) => s.deleteCheckItem)
  const pushUndo = useStore((s) => s.pushUndo)
  const reorderCheckItem = useStore((s) => s.reorderCheckItem)
  const moveLineToChecklist = useStore((s) => s.moveLineToChecklist)
  const dropIndicator = useDropIndicator()

  return (
    <div
      className={'checklist-item' + (item.done ? ' done' : '') + (dropIndicator.edge ? ' drop-indicator-' + dropIndicator.edge : '')}
      data-sec={sec.id}
      data-item-id={item.id}
      onDragOver={(e) => {
        dropIndicator.onDragOver(e, (ev) => ev.dataTransfer.types.includes('application/x-checkitem') || ev.dataTransfer.types.includes('application/x-line'))
      }}
      onDragLeave={dropIndicator.onDragLeave}
      onDrop={(e) => {
        const edge = dropIndicator.edge
        dropIndicator.clear()
        const lineData = e.dataTransfer.getData('application/x-line')
        if (lineData) {
          e.preventDefault()
          e.stopPropagation()
          const { sec: fromSecId, line: fromLineId } = JSON.parse(lineData)
          moveLineToChecklist(scriptId, fromSecId, fromLineId, sec.id)
          return
        }
        const checkData = e.dataTransfer.getData('application/x-checkitem')
        if (checkData) {
          e.preventDefault()
          e.stopPropagation()
          const { sec: fromSecId, item: fromItemId } = JSON.parse(checkData)
          if (fromSecId === sec.id && fromItemId !== item.id) {
            reorderCheckItem(scriptId, sec.id, fromItemId, item.id, edge || 'before')
          }
        }
      }}
    >
      <span
        className="check-drag-handle"
        draggable="true"
        onDragStart={(e) => {
          e.dataTransfer.setData('application/x-checkitem', JSON.stringify({ sec: sec.id, item: item.id }))
          e.dataTransfer.effectAllowed = 'move'
        }}
        title="Drag to reorder, or drop onto a line to insert it there"
      >
        <Icon name="grip" size={10} />
      </span>
      <input type="checkbox" checked={item.done} onChange={() => toggleCheckItem(scriptId, sec.id, item.id)} />
      <input
        type="text"
        value={item.text}
        onFocus={() => pushUndo(scriptId)}
        onChange={(e) => setCheckItemText(scriptId, sec.id, item.id, e.target.value)}
        onBlur={() => commitCheckItemText(scriptId)}
      />
      <button className="check-item-btn" onClick={() => promoteCheckItem(scriptId, sec.id, item.id)} title="Turn into a script line">
        &rarr;
      </button>
      <button className="check-item-btn del" onClick={() => deleteCheckItem(scriptId, sec.id, item.id)} title="Delete">
        &times;
      </button>
    </div>
  )
}

export default function ChecklistPanel({ scriptId, sec }) {
  const addCheckItem = useStore((s) => s.addCheckItem)
  const addInputRef = useRef(null)

  function submitAdd() {
    const val = addInputRef.current.value
    addCheckItem(scriptId, sec.id, val)
    addInputRef.current.value = ''
    addInputRef.current.focus()
  }

  return (
    <div className="checklist-panel">
      <div className="checklist-label">Checkpoints for this section</div>
      <div className="checklist-items">
        {sec.checklist.length === 0 && (
          <div className="checklist-empty">Nothing yet — jokes, facts, tangents you might want to use.</div>
        )}
        {sec.checklist.map((item) => (
          <ChecklistItemRow key={item.id} scriptId={scriptId} sec={sec} item={item} />
        ))}
      </div>
      <div className="checklist-add">
        <input
          type="text"
          ref={addInputRef}
          placeholder="Add a checkpoint"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              submitAdd()
            }
          }}
        />
        <button onClick={submitAdd}>+</button>
      </div>
    </div>
  )
}
