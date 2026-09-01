import React from 'react'
import { useStore } from '../state/store.js'

export default function TabBar({ script }) {
  const setActiveTab = useStore((s) => s.setActiveTab)
  const closeTab = useStore((s) => s.closeTab)

  if (!script.openTabs.length) return null

  return (
    <div className="tabbar">
      <button
        className={'tab-chip' + (script.activeTabId === 'all' ? ' active' : '')}
        onClick={() => setActiveTab(script.id, 'all')}
      >
        All
      </button>
      {script.openTabs.map((id) => {
        const sec = script.sections.find((se) => se.id === id)
        if (!sec) return null
        return (
          <button
            key={id}
            className={'tab-chip' + (script.activeTabId === id ? ' active' : '')}
            onClick={() => setActiveTab(script.id, id)}
          >
            {sec.heading}
            <span
              className="tab-close"
              onClick={(e) => {
                e.stopPropagation()
                closeTab(script.id, id)
              }}
            >
              &times;
            </span>
          </button>
        )
      })}
    </div>
  )
}
