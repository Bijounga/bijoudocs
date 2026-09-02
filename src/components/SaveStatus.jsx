import React, { useEffect, useState } from 'react'
import { useStore } from '../state/store.js'
import { formatRelative } from '../lib/timecode.js'

// A persistent "Saved 2m ago" / "Saving…" indicator, Google-Docs-style —
// unlike the older savedFlash toast (still used for one-off confirmations
// like "Copied 3 lines"), this never disappears, so it's always answering
// "did my last edit actually save."
export default function SaveStatus() {
  const saveStatus = useStore((s) => s.saveStatus)
  const lastSavedAt = useStore((s) => s.lastSavedAt)
  const [, forceTick] = useState(0)

  // formatRelative's text goes stale between renders — nothing else
  // re-renders this on a timer, so without this "Saved just now" would
  // silently stay wrong for as long as the user doesn't touch anything.
  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 15000)
    return () => clearInterval(id)
  }, [])

  let label = null
  if (saveStatus === 'pending') label = 'Saving…'
  else if (saveStatus === 'error') label = 'Save failed'
  else if (saveStatus === 'saved' && lastSavedAt) label = 'Saved ' + formatRelative(lastSavedAt)
  if (!label) return null

  return (
    <span
      className={'save-status' + (saveStatus === 'error' ? ' error' : '')}
      title={lastSavedAt ? new Date(lastSavedAt).toLocaleString() : undefined}
    >
      {label}
    </span>
  )
}
