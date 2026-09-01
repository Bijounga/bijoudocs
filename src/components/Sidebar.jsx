import React from 'react'
import { useStore } from '../state/store.js'
import Icon from './icons.jsx'
import { formatRelative, dueDateInfo } from '../lib/timecode.js'

export default function Sidebar() {
  const scripts = useStore((s) => s.scripts)
  const currentScriptId = useStore((s) => s.currentScriptId)
  const librarySearch = useStore((s) => s.librarySearch)
  const setLibrarySearch = useStore((s) => s.setLibrarySearch)
  const openScript = useStore((s) => s.openScript)
  const newScript = useStore((s) => s.newScript)
  const togglePin = useStore((s) => s.togglePin)
  const deleteScript = useStore((s) => s.deleteScript)
  const openContextMenu = useStore((s) => s.openContextMenu)
  const storageDir = useStore((s) => s.storageDir)
  const chooseStorageDir = useStore((s) => s.chooseStorageDir)

  const q = librarySearch.trim().toLowerCase()
  const filtered = scripts
    .filter((s) => !q || s.title.toLowerCase().includes(q))
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)

  return (
    <div className="sidebar">
      <div className="sb-head">
        <div className="search-wrap">
          <Icon name="search" />
          <input
            placeholder="Search your scripts"
            value={librarySearch}
            onChange={(e) => setLibrarySearch(e.target.value)}
          />
        </div>
        <button className="new-script-btn" onClick={newScript}>+ New script</button>
      </div>
      <div className="sb-list">
        <div className="sb-section-label">Library</div>
        {filtered.length === 0 && (
          <div style={{ padding: '10px 8px', fontSize: '12.5px', color: 'var(--ink-faint)' }}>No scripts match.</div>
        )}
        {filtered.map((s) => {
          const lineCount = s.sections.reduce((n, sec) => n + sec.lines.length, 0)
          const due = dueDateInfo(s.dueDate)
          return (
            <div
              key={s.id}
              className={'script-item' + (s.id === currentScriptId ? ' active' : '')}
              onClick={() => openScript(s.id)}
              onContextMenu={(e) => {
                e.preventDefault()
                openContextMenu({ type: 'script', scriptId: s.id, x: e.clientX, y: e.clientY })
              }}
            >
              <div className="st">
                <span
                  className="pin-dot"
                  style={{
                    display: 'inline-block',
                    background: s.pinned ? 'var(--cyan)' : 'transparent',
                    border: s.pinned ? 'none' : '1px solid var(--ink-faint)',
                    cursor: 'pointer'
                  }}
                  title={s.pinned ? 'Unpin' : 'Pin'}
                  onClick={(e) => {
                    e.stopPropagation()
                    togglePin(s.id)
                  }}
                />
                {s.title}
              </div>
              <div className="sm">
                <span>
                  {formatRelative(s.updatedAt)} · {lineCount} lines
                  {due && <span className={'sb-due' + (due.urgency ? ' ' + due.urgency : '')}> · {due.text}</span>}
                </span>
                <button
                  className="sb-delete-btn"
                  title="Delete script"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (window.confirm('Delete "' + s.title + '"? This removes its file permanently.')) {
                      deleteScript(s.id)
                    }
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          )
        })}
      </div>
      <div className="sb-storage" title={storageDir}>
        <Icon name="folder" size={12} />
        <span className="sb-storage-path">{storageDir.split(/[\\/]/).slice(-2).join('/')}</span>
        <button className="sb-storage-btn" onClick={chooseStorageDir}>
          Change…
        </button>
      </div>
    </div>
  )
}
