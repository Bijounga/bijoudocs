import React, { useState } from 'react'
import { useStore } from '../state/store.js'
import Icon from './icons.jsx'
import { formatRelative, dueDateInfo } from '../lib/timecode.js'

function ScriptRow({ s }) {
  const currentScriptId = useStore((st) => st.currentScriptId)
  const openScript = useStore((st) => st.openScript)
  const togglePin = useStore((st) => st.togglePin)
  const toggleArchive = useStore((st) => st.toggleArchive)
  const deleteScript = useStore((st) => st.deleteScript)
  const openContextMenu = useStore((st) => st.openContextMenu)

  const lineCount = s.sections.reduce((n, sec) => n + sec.lines.length, 0)
  const due = s.archived ? null : dueDateInfo(s.dueDate)
  return (
    <div
      className={'script-item' + (s.id === currentScriptId ? ' active' : '') + (s.archived ? ' archived' : '')}
      onClick={() => openScript(s.id)}
      onContextMenu={(e) => {
        e.preventDefault()
        openContextMenu({ type: 'script', scriptId: s.id, x: e.clientX, y: e.clientY })
      }}
    >
      <div className="st">
        {!s.archived && (
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
        )}
        {s.title}
      </div>
      <div className="sm">
        <span>
          {s.archived && s.archivedAt ? 'Archived ' + formatRelative(s.archivedAt) : formatRelative(s.updatedAt)} ·{' '}
          {lineCount} lines
          {due && <span className={'sb-due' + (due.urgency ? ' ' + due.urgency : '')}> · {due.text}</span>}
        </span>
        <span className="sb-row-actions">
          <button
            className="sb-row-btn"
            title={s.archived ? 'Restore to the library' : 'Archive — tuck a finished script away'}
            onClick={(e) => {
              e.stopPropagation()
              toggleArchive(s.id)
            }}
          >
            <Icon name={s.archived ? 'unarchive' : 'archive'} size={13} />
          </button>
          <button
            className="sb-row-btn danger"
            title="Delete script"
            onClick={(e) => {
              e.stopPropagation()
              if (window.confirm('Delete "' + s.title + '"? This removes its file permanently.')) {
                deleteScript(s.id)
              }
            }}
          >
            <Icon name="trash" size={13} />
          </button>
        </span>
      </div>
    </div>
  )
}

export default function Sidebar() {
  const scripts = useStore((s) => s.scripts)
  const librarySearch = useStore((s) => s.librarySearch)
  const setLibrarySearch = useStore((s) => s.setLibrarySearch)
  const newScript = useStore((s) => s.newScript)
  const storageDir = useStore((s) => s.storageDir)
  const chooseStorageDir = useStore((s) => s.chooseStorageDir)
  const [archiveOpen, setArchiveOpen] = useState(false)

  const q = librarySearch.trim().toLowerCase()
  const filtered = scripts
    .filter((s) => !q || s.title.toLowerCase().includes(q))
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)
  const active = filtered.filter((s) => !s.archived)
  const archived = filtered
    .filter((s) => s.archived)
    .sort((a, b) => (b.archivedAt || b.updatedAt) - (a.archivedAt || a.updatedAt))
  // A search reaches into the archive too, so matches are never hidden.
  const showArchived = archiveOpen || (q && archived.length > 0)

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
        {active.length === 0 && (
          <div style={{ padding: '10px 8px', fontSize: '12.5px', color: 'var(--ink-faint)' }}>
            {q ? 'No scripts match.' : 'Nothing here — everything is archived.'}
          </div>
        )}
        {active.map((s) => (
          <ScriptRow key={s.id} s={s} />
        ))}
        {archived.length > 0 && (
          <>
            <button className="sb-section-label sb-archive-toggle" onClick={() => setArchiveOpen((v) => !v)}>
              <Icon name="chevron" size={11} className={showArchived ? '' : 'sb-archive-chevron-closed'} />
              Archived
              <span className="sb-archive-count">{archived.length}</span>
            </button>
            {showArchived && archived.map((s) => <ScriptRow key={s.id} s={s} />)}
          </>
        )}
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
