import React from 'react'
import { useStore } from '../state/store.js'

export default function DiffModal() {
  const diffData = useStore((s) => s.diffData)
  const closeDiff = useStore((s) => s.closeDiff)
  if (!diffData) return null

  return (
    <div className="diff-overlay" onClick={closeDiff}>
      <div className="diff-modal" onClick={(e) => e.stopPropagation()}>
        <div className="diff-head">
          <span className="dh-title">{diffData.a} → {diffData.b}</span>
          <button className="diff-close" onClick={closeDiff}>&times;</button>
        </div>
        <div className="diff-body">
          {diffData.diff.map((p, i) => {
            if (p.type === 'del') return <span className="diff-del" key={i}>{p.text}</span>
            if (p.type === 'add') return <span className="diff-add" key={i}>{p.text}</span>
            return <React.Fragment key={i}>{p.text}</React.Fragment>
          })}
        </div>
      </div>
    </div>
  )
}
