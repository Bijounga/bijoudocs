import React from 'react'
import { useStore } from '../state/store.js'

// Sits next to the logo — shows the installed version, and doubles as a
// manual "check for updates" button (the automatic check only runs on
// launch and every 4h, which isn't useful if you actually want to see it
// happen right now).
export default function VersionBadge() {
  const appVersion = useStore((s) => s.appVersion)
  const updateStatus = useStore((s) => s.updateStatus)
  const checkForUpdates = useStore((s) => s.checkForUpdates)

  const label =
    updateStatus === 'checking'
      ? 'Checking…'
      : updateStatus === 'not-available'
        ? 'Up to date'
        : updateStatus === 'available'
          ? 'Downloading update…'
          : updateStatus === 'downloaded'
            ? 'Update ready ↓'
            : updateStatus === 'error'
              ? 'Update failed — click to retry'
              : appVersion
                ? 'v' + appVersion
                : ''

  if (!label) return null

  return (
    <button className="version-badge" onClick={checkForUpdates} title="Click to check for updates">
      {label}
    </button>
  )
}
