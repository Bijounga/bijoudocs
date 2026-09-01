import React from 'react'
import { useStore } from '../../state/store.js'
import { stripHtmlToText } from '../../lib/html.js'

function snippet(html) {
  const text = stripHtmlToText(html).trim()
  if (!text) return '(empty)'
  return text.length > 60 ? text.slice(0, 60) + '…' : text
}

export default function TakesMenu({ scriptId, sectionId, line }) {
  const useTake = useStore((s) => s.useTake)
  const deleteTake = useStore((s) => s.deleteTake)
  const recordNewTake = useStore((s) => s.recordNewTake)

  return (
    <div style={{ position: 'relative' }}>
      <div className="tag-menu" style={{ minWidth: 240 }}>
        <div className="tag-menu-item" style={{ color: 'var(--cyan)', fontWeight: 600 }}>
          Current: {snippet(line.text)}
        </div>
        {line.takes.map((take, i) => (
          <div key={i} className="tag-menu-item" style={{ justifyContent: 'space-between' }}>
            <span onClick={() => useTake(scriptId, sectionId, line.id, i)} style={{ flex: 1, cursor: 'pointer' }}>
              Take {i + 1}: {snippet(take)}
            </span>
            <span
              className="tab-close"
              onClick={(e) => {
                e.stopPropagation()
                deleteTake(scriptId, sectionId, line.id, i)
              }}
              title="Delete this take"
            >
              &times;
            </span>
          </div>
        ))}
        <div
          className="tag-menu-item"
          style={{ color: 'var(--ink-faint)' }}
          onClick={() => recordNewTake(scriptId, sectionId, line.id)}
        >
          + Record new take from current
        </div>
      </div>
    </div>
  )
}
