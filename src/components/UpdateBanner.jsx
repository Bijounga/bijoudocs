import React from 'react'
import { useStore } from '../state/store.js'
import Icon from './icons.jsx'

// Only surfaces once an update has actually finished downloading in the
// background and is ready to install, or once something in that process
// has actually failed — nothing shown for the in-between "checking" /
// "downloading" states, to avoid noise for something the user can't act
// on yet anyway.
export default function UpdateBanner() {
  const updateStatus = useStore((s) => s.updateStatus)
  const updateVersion = useStore((s) => s.updateVersion)
  const updateErrorMessage = useStore((s) => s.updateErrorMessage)
  const installUpdate = useStore((s) => s.installUpdate)
  const checkForUpdates = useStore((s) => s.checkForUpdates)
  const dismissUpdateStatus = useStore((s) => s.dismissUpdateStatus)
  const downloadManualUpdate = useStore((s) => s.downloadManualUpdate)

  if (updateStatus === 'downloaded') {
    return (
      <div className="update-banner">
        <Icon name="download" size={13} />
        <span>Update to v{updateVersion} ready</span>
        <button className="update-banner-btn" onClick={installUpdate}>
          Restart to update
        </button>
      </div>
    )
  }

  // Mac path — Squirrel.Mac won't apply an update to this unsigned build,
  // so instead of pretending it'll install itself, offer to fetch the
  // real .dmg and hand it to Finder, same as a first install.
  if (updateStatus === 'available-manual') {
    return (
      <div className="update-banner">
        <Icon name="download" size={13} />
        <span>Update to v{updateVersion} available</span>
        <button className="update-banner-btn" onClick={() => downloadManualUpdate(updateVersion)}>
          Download &amp; open
        </button>
      </div>
    )
  }

  if (updateStatus === 'manual-downloading') {
    return (
      <div className="update-banner">
        <Icon name="download" size={13} />
        <span>Downloading v{updateVersion}…</span>
      </div>
    )
  }

  if (updateStatus === 'manual-ready') {
    return (
      <div className="update-banner">
        <Icon name="download" size={13} />
        <span>Opened in Finder — drag BijouDocs into Applications, then relaunch.</span>
        <button className="update-banner-btn" onClick={dismissUpdateStatus}>
          Got it
        </button>
      </div>
    )
  }

  if (updateStatus === 'error') {
    return (
      <div className="update-banner conflict">
        <Icon name="idea" size={13} />
        <span>
          Update failed{updateErrorMessage ? ': ' + updateErrorMessage : ''}. On macOS, check Console.app (search "BijouDocs") or
          run the app from Terminal for the full error.
        </span>
        <button className="update-banner-btn" onClick={checkForUpdates}>
          Retry
        </button>
        <button className="update-banner-btn" onClick={dismissUpdateStatus} style={{ background: 'transparent', color: 'var(--ink-faint)' }}>
          Dismiss
        </button>
      </div>
    )
  }

  return null
}
