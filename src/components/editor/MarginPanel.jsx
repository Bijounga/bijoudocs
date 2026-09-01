import React from 'react'
import Icon from '../icons.jsx'

// Generic collapsible panel flanking the editor column. Collapsed, it's
// just a slim strip with the title rotated vertically and an expand
// button — cheap to leave open, but easy to get out of the way.
export default function MarginPanel({ side, title, open, onToggle, children }) {
  if (!open) {
    return (
      <div className={'margin-panel collapsed ' + side} onClick={onToggle} title={'Show ' + title}>
        <Icon name="chevron" className={side === 'left' ? 'margin-chevron-right' : 'margin-chevron-left'} />
        <span className="margin-panel-collapsed-label">{title}</span>
      </div>
    )
  }
  return (
    <div className={'margin-panel ' + side}>
      <div className="margin-panel-head">
        <span className="margin-panel-title">{title}</span>
        <button className="margin-panel-collapse" onClick={onToggle} title={'Hide ' + title}>
          <Icon name="chevron" className={side === 'left' ? 'margin-chevron-left' : 'margin-chevron-right'} />
        </button>
      </div>
      <div className="margin-panel-body">{children}</div>
    </div>
  )
}
