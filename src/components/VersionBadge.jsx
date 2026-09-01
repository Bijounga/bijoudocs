import React from 'react'
import { useStore } from '../state/store.js'

const STATUS_LABELS = {
  checking: 'Checking…',
  'not-available': 'Up to date',
  available: 'Downloading update…',
  'available-manual': 'Update available ↓',
  downloaded: 'Update ready ↓',
  'manual-downloading': 'Downloading…',
  'manual-ready': 'Opened in Finder',
  error: 'Update failed — click to retry'
}

// Sits next to the logo — shows the installed version, and doubles as a
// manual "check for updates" button (the automatic check only runs on
// launch and every 4h, which isn't useful if you actually want to see it
// happen right now).
export default function VersionBadge() {
  const appVersion = useStore((s) => s.appVersion)
  const updateStatus = useStore((s) => s.updateStatus)
  const checkForUpdates = useStore((s) => s.checkForUpdates)

  const label = STATUS_LABELS[updateStatus] || (appVersion ? 'v' + appVersion : '')

  if (!label) return null

  return (
    <button className="version-badge" onClick={checkForUpdates} title="Click to check for updates">
      {label}
    </button>
  )
}
