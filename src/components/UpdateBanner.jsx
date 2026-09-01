import React from 'react'
import { useStore } from '../state/store.js'
import Icon from './icons.jsx'

// Only surfaces once an update has actually finished downloading in the
// background and is ready to install — nothing shown for the in-between
// "checking" / "downloading" states, to avoid noise for something the user
// can't act on yet anyway.
export default function UpdateBanner() {
  const updateStatus = useStore((s) => s.updateStatus)
  const updateVersion = useStore((s) => s.updateVersion)
  const installUpdate = useStore((s) => s.installUpdate)

  if (updateStatus !== 'downloaded') return null

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
