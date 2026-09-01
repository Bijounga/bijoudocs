import React from 'react'
import { useStore } from '../state/store.js'
import { sectionTimecodes, formatTC } from '../lib/timecode.js'

// A pacing-at-a-glance strip: each section gets a segment sized by its
// share of the script's estimated runtime, e.g. HOOK—SETUP———PROGRESSION.
export default function SectionTimeline({ script }) {
  const jumpToSection = useStore((s) => s.jumpToSection)

  if (script.sections.length < 2) return null

  const tcs = sectionTimecodes(script)
  const total = tcs.length ? tcs[tcs.length - 1].end : 0

  return (
    <div className="section-timeline">
      {script.sections.map((sec, i) => {
        const tc = tcs[i]
        const duration = Math.max(tc.end - tc.start, 0.001)
        const flexGrow = total > 0 ? duration : 1
        return (
          <div
            key={sec.id}
            className={'timeline-segment' + (sec.done ? ' done' : '')}
            style={{ flexGrow, borderColor: sec.titleColor || 'var(--line)' }}
            onClick={() => jumpToSection(script.id, sec.id, false)}
            title={sec.heading + ' (' + formatTC(tc.start) + '–' + formatTC(tc.end) + ')' + (sec.done ? ' — done' : '')}
          >
            <span className="timeline-segment-label">{sec.done ? '✓ ' : ''}{sec.heading.toUpperCase()}</span>
          </div>
        )
      })}
    </div>
  )
}
