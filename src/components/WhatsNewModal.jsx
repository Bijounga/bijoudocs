import React from 'react'
import { useStore } from '../state/store.js'

export default function WhatsNewModal() {
  const whatsNewOpen = useStore((s) => s.whatsNewOpen)
  const whatsNewVersion = useStore((s) => s.whatsNewVersion)
  const whatsNewEntries = useStore((s) => s.whatsNewEntries)
  const closeWhatsNew = useStore((s) => s.closeWhatsNew)

  if (!whatsNewOpen) return null

  return (
    <div className="diff-overlay" onClick={closeWhatsNew}>
      <div className="diff-modal whats-new-modal" onClick={(e) => e.stopPropagation()}>
        <div className="diff-head">
          <span className="dh-title">What's new in v{whatsNewVersion}</span>
          <button className="diff-close" onClick={closeWhatsNew}>&times;</button>
        </div>
        <div className="diff-body">
          <ul className="whats-new-list">
            {whatsNewEntries.map((entry, i) => (
              <li key={i}>{entry}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
