import React from 'react'
import { useStore } from '../../state/store.js'
import { useDropIndicator } from '../../hooks/useDropIndicator.js'

function SectionListRow({ scriptId, sec, i, total }) {
  const jumpToSection = useStore((s) => s.jumpToSection)
  const moveSection = useStore((s) => s.moveSection)
  const reorderSection = useStore((s) => s.reorderSection)
  const toggleSectionDone = useStore((s) => s.toggleSectionDone)
  const dropIndicator = useDropIndicator()

  return (
    <div
      className={'sec-list-row' + (dropIndicator.edge ? ' drop-indicator-' + dropIndicator.edge : '')}
      draggable="true"
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', sec.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      onDragOver={(e) => {
        dropIndicator.onDragOver(e, (ev) => ev.dataTransfer.types.includes('text/plain'))
      }}
      onDragLeave={dropIndicator.onDragLeave}
      onDrop={(e) => {
        const edge = dropIndicator.edge
        dropIndicator.clear()
        const draggedId = e.dataTransfer.getData('text/plain')
        if (draggedId && draggedId !== sec.id) {
          e.preventDefault()
          reorderSection(scriptId, draggedId, sec.id, edge || 'before')
        }
      }}
      onClick={(e) => jumpToSection(scriptId, sec.id, e.ctrlKey || e.metaKey)}
    >
      <input
        type="checkbox"
        className="sec-list-done"
        checked={sec.done}
        onClick={(e) => e.stopPropagation()}
        onChange={() => toggleSectionDone(scriptId, sec.id)}
        title="Mark this section done"
      />
      <span className="sec-list-dot" style={{ background: sec.titleColor || '#63656F' }} />
      <span className={'sec-list-label' + (sec.done ? ' done' : '')}>{sec.heading}</span>
      <span className="sec-list-count">{sec.lines.length}</span>
      <button
        className="sec-list-move"
        disabled={i === 0}
        onClick={(e) => {
          e.stopPropagation()
          moveSection(scriptId, sec.id, -1)
        }}
      >
        &uarr;
      </button>
      <button
        className="sec-list-move"
        disabled={i === total - 1}
        onClick={(e) => {
          e.stopPropagation()
          moveSection(scriptId, sec.id, 1)
        }}
      >
        &darr;
      </button>
    </div>
  )
}

export default function SectionsTab({ scriptId, script }) {
  const total = script.sections.length
  const doneCount = script.sections.filter((s) => s.done).length
  const pct = total ? Math.round((doneCount / total) * 100) : 0

  return (
    <>
      {total > 0 && (
        <div className="progress-summary">
          <div className="progress-bar-wrap">
            <div className="progress-bar-fill" style={{ width: pct + '%' }} />
          </div>
          <div className="progress-bar-label">{doneCount}/{total} sections done</div>
        </div>
      )}
      {script.sections.length === 0 && (
        <div style={{ fontSize: '12.5px', color: 'var(--ink-faint)', padding: 6 }}>No sections yet.</div>
      )}
      {script.sections.map((sec, i) => (
        <SectionListRow key={sec.id} scriptId={scriptId} sec={sec} i={i} total={script.sections.length} />
      ))}
      <div className="insp-hint">
        This list stays put. Click a section to jump to it and highlight it in place; Ctrl-click to open it as its own tab. Drag a row, or use the arrows, to reorder. The checkbox tracks your own edit-pass progress — check it when you're done with a section.
      </div>
    </>
  )
}
