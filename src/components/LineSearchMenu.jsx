import React, { useEffect, useRef } from 'react'
import { useStore } from '../state/store.js'
import { stripHtmlToText } from '../lib/html.js'

export function getLineSearchMatches(script, query) {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const matches = []
  script.sections.forEach((sec) => {
    sec.lines.forEach((l) => {
      const plain = stripHtmlToText(l.text)
      if (plain.toLowerCase().includes(q)) matches.push({ sec, line: l, plain })
    })
  })
  return matches.slice(0, 40)
}

export default function LineSearchMenu({ script }) {
  const query = useStore((s) => s.lineSearchQuery)
  const highlight = useStore((s) => s.lineSearchHighlight)
  const setQuery = useStore((s) => s.setLineSearchQuery)
  const setHighlight = useStore((s) => s.setLineSearchHighlight)
  const jumpToLine = useStore((s) => s.jumpToLine)
  const closeLineSearch = useStore((s) => s.closeLineSearch)
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current && inputRef.current.focus()
  }, [])

  const q = query.trim().toLowerCase()
  const matches = getLineSearchMatches(script, query)

  function snippetFor(plain) {
    if (plain.length <= 90) return plain
    const idx = plain.toLowerCase().indexOf(q)
    const start = Math.max(0, idx - 30)
    return (start > 0 ? '…' : '') + plain.slice(start, start + 90) + (start + 90 < plain.length ? '…' : '')
  }

  return (
    <div className="line-search-menu">
      <input
        ref={inputRef}
        className="ls-search"
        placeholder="Search lines... (arrows + Enter)"
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
            if (m) jumpToLine(script.id, m.sec.id, m.line.id)
            return
          }
          if (e.key === 'Escape') {
            e.preventDefault()
            closeLineSearch()
          }
        }}
      />
      <div className="ls-list">
        {!q && <div className="ls-empty">Type to search every line in this script. Use arrow keys, Enter to jump.</div>}
        {q && matches.length === 0 && <div className="ls-empty">No lines match "{query}".</div>}
        {matches.map((m, i) => (
          <div
            key={m.sec.id + ':' + m.line.id}
            className={'ls-row' + (highlight === i ? ' highlight' : '')}
            onClick={() => jumpToLine(script.id, m.sec.id, m.line.id)}
          >
            <div className="ls-sec">{m.sec.heading}</div>
            <div className="ls-snippet">{snippetFor(m.plain)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
