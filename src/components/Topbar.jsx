import React from 'react'
import { useStore } from '../state/store.js'
import Icon from './icons.jsx'
import VersionBadge from './VersionBadge.jsx'
import SaveStatus from './SaveStatus.jsx'
import SectionJumpMenu from './SectionJumpMenu.jsx'
import LineSearchMenu from './LineSearchMenu.jsx'
import { formatTC, scriptTotalStats, dueDateInfo, totalWordCountAll } from '../lib/timecode.js'

export default function Topbar({ script }) {
  const setScriptTitle = useStore((s) => s.setScriptTitle)
  const commitScriptTitle = useStore((s) => s.commitScriptTitle)
  const pushUndo = useStore((s) => s.pushUndo)
  const savedFlash = useStore((s) => s.savedFlash)
  const savedFlashText = useStore((s) => s.savedFlashText)
  const undoStack = useStore((s) => s.undoStack)
  const redoStack = useStore((s) => s.redoStack)
  const undoScriptId = useStore((s) => s.undoScriptId)
  const undo = useStore((s) => s.undo)
  const redo = useStore((s) => s.redo)
  const collapseAll = useStore((s) => s.collapseAll)
  const zoom = useStore((s) => s.zoom)
  const zoomIn = useStore((s) => s.zoomIn)
  const zoomOut = useStore((s) => s.zoomOut)
  const hideTags = useStore((s) => s.hideTags)
  const hideNotes = useStore((s) => s.hideNotes)
  const toggleHideTags = useStore((s) => s.toggleHideTags)
  const toggleHideNotes = useStore((s) => s.toggleHideNotes)
  const focusMode = useStore((s) => s.focusMode)
  const toggleFocusMode = useStore((s) => s.toggleFocusMode)
  const sectionJumpOpen = useStore((s) => s.sectionJumpOpen)
  const toggleSectionJump = useStore((s) => s.toggleSectionJump)
  const lineSearchOpen = useStore((s) => s.lineSearchOpen)
  const toggleLineSearch = useStore((s) => s.toggleLineSearch)
  const exportMenuOpen = useStore((s) => s.exportMenuOpen)
  const toggleExportMenu = useStore((s) => s.toggleExportMenu)
  const exportScript = useStore((s) => s.exportScript)
  const importScript = useStore((s) => s.importScript)
  const openTeleprompter = useStore((s) => s.openTeleprompter)
  const setScriptDueDate = useStore((s) => s.setScriptDueDate)
  const mapViewOpen = useStore((s) => s.mapViewOpen)
  const toggleMapView = useStore((s) => s.toggleMapView)
  const mapSplitOpen = useStore((s) => s.mapSplitOpen)
  const toggleMapSplit = useStore((s) => s.toggleMapSplit)
  const noteColor = useStore((s) => s.noteColor)
  const setNoteColor = useStore((s) => s.setNoteColor)
  const forceSave = useStore((s) => s.forceSave)
  const openSaveHistory = useStore((s) => s.openSaveHistory)

  if (!script) {
    return (
      <div className="topbar">
        <div className="logo"><span className="dot" />BIJOUDOCS</div>
        <VersionBadge />
      </div>
    )
  }

  const canUndo = undoScriptId === script.id && undoStack.length > 0
  const canRedo = undoScriptId === script.id && redoStack.length > 0
  const { totalSeconds, totalWords } = scriptTotalStats(script)

  const due = dueDateInfo(script.dueDate)
  const wordsNow = totalWordCountAll(script)
  const todayDelta = script.dailyBaseline ? wordsNow - script.dailyBaseline.words : wordsNow
  const workLogTooltip =
    'Today: ' + (todayDelta >= 0 ? '+' : '') + todayDelta + ' words' +
    (script.workLogHistory && script.workLogHistory.length
      ? '\n' + script.workLogHistory.slice(-7).reverse().map((h) => h.date + ': ' + (h.words >= 0 ? '+' : '') + h.words).join('\n')
      : '')

  return (
    <div className="topbar">
      <div className="logo"><span className="dot" />BIJOUDOCS</div>
      <VersionBadge />
      <div className="divider-v" />
      <input
        className="title-input"
        value={script.title}
        onFocus={() => pushUndo(script.id)}
        onChange={(e) => setScriptTitle(script.id, e.target.value)}
        onBlur={() => commitScriptTitle(script.id)}
      />
      <span className="saved-flash" style={{ visibility: savedFlash ? 'visible' : 'hidden' }}>{savedFlashText}</span>
      <SaveStatus />
      <button className="icon-btn" onClick={() => forceSave(script.id)} title="Save right now, and drop a checkpoint in the history">
        Save now
      </button>
      <button className="icon-btn" onClick={() => openSaveHistory(script.id)} title="Browse and restore earlier saved versions">
        History
      </button>
      <span
        style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-faint)', whiteSpace: 'nowrap' }}
        title="Estimated runtime and spoken word count for the whole script"
      >
        {formatTC(totalSeconds)} · {totalWords.toLocaleString()} words
      </span>
      <span
        style={{ fontFamily: 'var(--mono)', fontSize: 11, color: todayDelta > 0 ? 'var(--cyan)' : 'var(--ink-faint)', whiteSpace: 'nowrap' }}
        title={workLogTooltip}
      >
        {todayDelta >= 0 ? '+' : ''}{todayDelta} today
      </span>
      <label className={'date-field' + (due && due.urgency ? ' ' + due.urgency : '')} title="Deadline / upload date">
        <Icon name="calendar" size={12} />
        <input
          type="date"
          value={script.dueDate || ''}
          onChange={(e) => setScriptDueDate(script.id, e.target.value)}
        />
      </label>
      <div className="topbar-spacer" />
      <button className="icon-btn" disabled={!canUndo} onClick={undo} title="Undo (Ctrl+Z)">
        <Icon name="undo" />
      </button>
      <button className="icon-btn" disabled={!canRedo} onClick={redo} title="Redo (Ctrl+Shift+Z)">
        <Icon name="redo" />
      </button>
      <div style={{ position: 'relative' }}>
        <button className="icon-btn" data-menu-trigger="sectionJump" onClick={toggleSectionJump}>
          <Icon name="search" /> Sections
        </button>
        {sectionJumpOpen && <SectionJumpMenu script={script} />}
      </div>
      <div style={{ position: 'relative' }}>
        <button className="icon-btn" data-menu-trigger="lineSearch" onClick={toggleLineSearch}>
          <Icon name="search" /> Search
        </button>
        {lineSearchOpen && <LineSearchMenu script={script} />}
      </div>
      <button className="icon-btn" onClick={() => collapseAll(script.id)}>
        <Icon name="collapse" /> Collapse
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, border: '1px solid var(--line)', borderRadius: 6, flex: '0 0 auto' }}>
        <button className="icon-btn" style={{ border: 'none', padding: '7px 9px' }} onClick={zoomOut} title="Zoom out">&minus;</button>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-faint)', minWidth: 34, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
        <button className="icon-btn" style={{ border: 'none', padding: '7px 9px' }} onClick={zoomIn} title="Zoom in">+</button>
      </div>
      <button className={'icon-btn' + (hideTags ? ' active' : '')} onClick={toggleHideTags}>
        <Icon name="eye" /> Tags
      </button>
      <button className={'icon-btn' + (hideNotes ? ' active' : '')} onClick={toggleHideNotes}>
        <Icon name="note" /> Notes
      </button>
      <input
        type="color"
        className="note-color-input"
        value={noteColor}
        onChange={(e) => setNoteColor(e.target.value)}
        title="Note color — applies everywhere notes show up"
      />
      <button className="icon-btn" onClick={importScript}>
        <Icon name="upload" /> Import
      </button>
      <div style={{ position: 'relative' }}>
        <button className="icon-btn" data-menu-trigger="export" onClick={toggleExportMenu}>
          <Icon name="download" /> Export
        </button>
        {exportMenuOpen && (
          <div className="export-menu">
            <div className="export-item" onClick={() => exportScript(script.id, 'txt')}>Plain text (.txt)</div>
            <div className="export-item" onClick={() => exportScript(script.id, 'md')}>Markdown (.md)</div>
            <div className="export-item" onClick={() => exportScript(script.id, 'json')}>Full backup (.json)</div>
          </div>
        )}
      </div>
      <button className={'icon-btn' + (focusMode ? ' active' : '')} onClick={toggleFocusMode}>
        <Icon name="focus" /> Focus
      </button>
      <button className="icon-btn" onClick={openTeleprompter} title="Distraction-free reading view">
        <Icon name="teleprompter" /> Teleprompter
      </button>
      <button className={'icon-btn' + (mapViewOpen ? ' active' : '')} onClick={toggleMapView} title="Zoom out to the whole video as cards">
        <Icon name="map" /> Map
      </button>
      {mapViewOpen && (
        <button
          className={'icon-btn' + (mapSplitOpen ? ' active' : '')}
          onClick={toggleMapSplit}
          title="Show the script and the map side by side"
        >
          <Icon name="split" size={13} />
        </button>
      )}
    </div>
  )
}
