import React from 'react'
import { useStore } from '../state/store.js'
import Icon from './icons.jsx'

// Shown when a save just detected that the on-disk copy of the current
// script had changed since this device last saw it (almost always: this
// same app, saved from another machine sharing a synced storage folder)
// and backed up the version it would otherwise have silently overwritten.
export default function SaveConflictBanner({ scriptId }) {
  const backupFile = useStore((s) => s.saveConflicts[scriptId])
  const dismissSaveConflict = useStore((s) => s.dismissSaveConflict)
  const openSaveHistory = useStore((s) => s.openSaveHistory)

  if (!backupFile) return null

  return (
    <div className="update-banner conflict">
      <Icon name="idea" size={13} />
      <span>
        This script changed elsewhere before your last save — your edits were kept, and the other version is backed up as{' '}
        <code>{backupFile}</code>. Open History to see or restore it.
      </span>
      <button
        className="update-banner-btn"
        onClick={() => {
          openSaveHistory(scriptId)
          dismissSaveConflict(scriptId)
        }}
      >
        Open History
      </button>
      <button className="update-banner-btn" onClick={() => dismissSaveConflict(scriptId)}>
        Got it
      </button>
    </div>
  )
}
