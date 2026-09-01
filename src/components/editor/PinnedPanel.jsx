import React, { useState } from 'react'
import { useStore } from '../../state/store.js'
import PinnedLineText from './PinnedLineText.jsx'

// Not a copy — pinning a section just remembers its id, and this renders
// the same live section data a second time in the margin, so it's always
// current and edits made here (or from the normal editor) show up in both
// places automatically, with no sync code needed.
export default function PinnedPanel({ scriptId, script }) {
  const jumpToSection = useStore((s) => s.jumpToSection)
  const pinSection = useStore((s) => s.pinSection)
  const unpinSection = useStore((s) => s.unpinSection)
  const pushUndo = useStore((s) => s.pushUndo)
  const setSectionHeading = useStore((s) => s.setSectionHeading)
  const commitSectionHeading = useStore((s) => s.commitSectionHeading)
  const commitLineText = useStore((s) => s.commitLineText)
  const [dragOver, setDragOver] = useState(false)

  const pinned = script.pinnedSectionIds.map((id) => script.sections.find((s) => s.id === id)).filter(Boolean)

  return (
    <div
      className={'pinned-drop' + (dragOver ? ' drag-over' : '')}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('text/plain')) {
          e.preventDefault()
          setDragOver(true)
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        setDragOver(false)
        const sectionId = e.dataTransfer.getData('text/plain')
        if (sectionId && script.sections.some((s) => s.id === sectionId)) {
          e.preventDefault()
          pinSection(scriptId, sectionId)
        }
      }}
    >
      {pinned.length === 0 && (
        <div className="margin-empty">Drag a section's grip handle here to keep it as a live, editable reference — as many as you want.</div>
      )}
      <div className="pinned-list">
        {pinned.map((sec) => (
          <div className="pinned-card" key={sec.id}>
            <div className="pinned-card-head">
              <input
                className="pinned-card-heading"
                style={sec.titleColor ? { color: sec.titleColor } : undefined}
                value={sec.heading}
                onFocus={() => pushUndo(scriptId)}
                onChange={(e) => setSectionHeading(scriptId, sec.id, e.target.value)}
                onBlur={() => commitSectionHeading(scriptId, sec.id)}
              />
              <button className="check-item-btn" onClick={() => jumpToSection(scriptId, sec.id, false)} title="Jump to this section">
                &rarr;
              </button>
              <button className="check-item-btn del" onClick={() => unpinSection(scriptId, sec.id)} title="Unpin">
                &times;
              </button>
            </div>
            <div className="pinned-card-lines">
              {sec.lines.length === 0 && <div className="pinned-card-empty">No lines yet.</div>}
              {sec.lines.map((line) => (
                <PinnedLineText
                  key={line.id}
                  value={line.text}
                  onFocus={() => pushUndo(scriptId)}
                  onCommit={(html) => commitLineText(scriptId, sec.id, line.id, html)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      {dragOver && <div className="pinned-drop-hint">Drop to pin</div>}
    </div>
  )
}
