import React from 'react'
import { useStore } from '../../state/store.js'
import { catInfo } from '../../lib/model.js'

export default function FilterView({ scriptId, script, categoryId }) {
  const clearFilter = useStore((s) => s.clearFilter)
  const toggleLineDone = useStore((s) => s.toggleLineDone)
  const cat = catInfo(script, categoryId)
  const rows = []
  script.sections.forEach((sec) => {
    sec.lines.forEach((l) => {
      if (l.categoryId === categoryId) rows.push({ sec: sec.heading, line: l })
    })
  })

  if (!cat) return null

  return (
    <div className="main">
      <div className="filter-bar">
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: cat.color, display: 'inline-block' }} />
        <span className="fb-label">
          Viewing <span className="fb-cat" style={{ color: cat.color }}>{cat.label}</span> across this script
        </span>
        <button className="filter-back" onClick={clearFilter}>Back to script</button>
      </div>
      <div className="filter-list">
        {rows.length === 0 && <div className="filter-empty">No lines tagged {cat.label} yet.</div>}
        {rows.map((r) => (
          <div className="filter-row" key={r.sec + r.line.id}>
            <input
              type="checkbox"
              className="fr-check"
              checked={r.line.done}
              onChange={() => {
                const sec = script.sections.find((se) => se.lines.some((l) => l.id === r.line.id))
                if (sec) toggleLineDone(scriptId, sec.id, r.line.id)
              }}
            />
            <div style={{ flex: 1 }}>
              <div className="fr-sec">{r.sec}</div>
              <div
                className={'fr-text' + (r.line.done ? ' done' : '')}
                dangerouslySetInnerHTML={{ __html: r.line.text || '' }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
