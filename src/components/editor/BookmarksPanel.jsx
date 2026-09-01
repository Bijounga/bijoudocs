import React from 'react'
import { useStore } from '../../state/store.js'
import { stripHtmlToText } from '../../lib/html.js'

// A manual shortlist of bookmarked lines, always in view in the right
// margin — moved here from the Inspector tab so it lives next to the
// checklist instead of behind a tab click.
export default function BookmarksPanel({ scriptId, script }) {
  const jumpToLine = useStore((s) => s.jumpToLine)
  const toggleLineBookmark = useStore((s) => s.toggleLineBookmark)

  const bookmarks = []
  script.sections.forEach((sec) => {
    sec.lines.forEach((l) => {
      if (l.bookmarked) bookmarks.push({ sec, line: l })
    })
  })

  return (
    <>
      {bookmarks.length === 0 && (
        <div className="margin-empty">Nothing bookmarked yet — click the bookmark icon on a line to pin it here.</div>
      )}
      {bookmarks.map(({ sec, line }) => {
        const text = stripHtmlToText(line.text) || '(empty line)'
        return (
          <div className="checklist-item" key={line.id} onClick={() => jumpToLine(scriptId, sec.id, line.id)} style={{ cursor: 'pointer' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '10px', color: 'var(--ink-faint)', marginBottom: 2 }}>{sec.heading}</div>
              <div style={{ fontSize: '12.5px', color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {text}
              </div>
            </div>
            <button
              className="check-item-btn del"
              onClick={(e) => {
                e.stopPropagation()
                toggleLineBookmark(scriptId, sec.id, line.id)
              }}
              title="Remove bookmark"
            >
              &times;
            </button>
          </div>
        )
      })}
    </>
  )
}
