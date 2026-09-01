import React, { useEffect, useRef } from 'react'
import { useStore } from '../state/store.js'

export function getSectionJumpMatches(script, query) {
  const q = query.trim().toLowerCase()
  return script.sections.filter((s) => !q || s.heading.toLowerCase().includes(q))
}

export default function SectionJumpMenu({ script }) {
  const query = useStore((s) => s.sectionJumpQuery)
  const highlight = useStore((s) => s.sectionJumpHighlight)
  const setQuery = useStore((s) => s.setSectionJumpQuery)
  const setHighlight = useStore((s) => s.setSectionJumpHighlight)
  const jumpToSection = useStore((s) => s.jumpToSection)
  const closeSectionJump = useStore((s) => s.closeSectionJump)
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current && inputRef.current.focus()
  }, [])

  const matches = getSectionJumpMatches(script, query)

  return (
    <div className="section-jump-menu">
      <input
        ref={inputRef}
        className="sj-search"
        placeholder="Jump to a section"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            if (matches.length) setHighlight((highlight + 1) % matches.length)
            return
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault()
            if (matches.length) setHighlight((highlight - 1 + matches.length) % matches.length)
            return
          }
          if (e.key === 'Enter') {
            e.preventDefault()
            const m = matches[highlight] || matches[0]
            if (m) jumpToSection(script.id, m.id, e.ctrlKey || e.metaKey)
            return
          }
          if (e.key === 'Escape') {
            e.preventDefault()
            closeSectionJump()
          }
        }}
      />
      <div className="sj-list">
        {matches.length === 0 && <div className="sj-empty">No sections match.</div>}
        {matches.map((s, i) => (
          <div
            key={s.id}
            className={'sj-row' + (highlight === i ? ' highlight' : '')}
            onClick={(e) => jumpToSection(script.id, s.id, e.ctrlKey || e.metaKey)}
          >
            <span className="sj-dot" style={{ background: s.titleColor || '#63656F' }} />
            {s.heading}
          </div>
        ))}
      </div>
    </div>
  )
}
