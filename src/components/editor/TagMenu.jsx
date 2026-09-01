import React from 'react'
import { useStore } from '../../state/store.js'

export default function TagMenu({ scriptId, sectionId, line, categories }) {
  const setLineTag = useStore((s) => s.setLineTag)
  const tagMenuHighlight = useStore((s) => s.tagMenuHighlight)
  return (
    <div style={{ position: 'relative' }}>
      <div className="tag-menu">
        {categories.map((c, i) => (
          <div
            key={c.id}
            className={'tag-menu-item' + (tagMenuHighlight === i ? ' highlight' : '')}
            onClick={() => setLineTag(scriptId, sectionId, line.id, c.id)}
          >
            <span className="tag-menu-dot" style={{ background: c.color }} />
            {c.label}
            {i < 9 && <span className="tag-menu-num">{i + 1}</span>}
          </div>
        ))}
        <div
          className={'tag-menu-item' + (tagMenuHighlight === categories.length ? ' highlight' : '')}
          style={{ color: 'var(--ink-faint)' }}
          onClick={() => setLineTag(scriptId, sectionId, line.id, null)}
        >
          Clear tag
        </div>
      </div>
    </div>
  )
}
