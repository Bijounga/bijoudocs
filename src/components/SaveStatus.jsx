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

  let label = ''
  if (saveStatus === 'pending') label = 'Saving…'
  else if (saveStatus === 'error') label = 'Save failed'
  else if (saveStatus === 'saved' && lastSavedAt) label = 'Saved ' + formatRelative(lastSavedAt)

  // Always renders the span, even with empty text — returning null before
  // the first save of a session meant this element didn't exist in the
  // layout at all yet, so the *first* save (going from "not rendered" to
  // "rendered at min-width: 92px") jumped the toolbar exactly like the
  // bug this component was built to fix. Reserving the box from the start
  // means only its text ever changes, never its presence.
  return (
    <span
      className={'save-status' + (saveStatus === 'error' ? ' error' : '')}
      title={lastSavedAt ? new Date(lastSavedAt).toLocaleString() : undefined}
    >
      {label}
    </span>
  )
}
