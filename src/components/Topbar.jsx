import React from 'react'
import { useStore } from '../state/store.js'
import Icon from './icons.jsx'
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
  const sectionJumpOpen = useStore((s) => s.sectionJumpOpen)
  const toggleSectionJump = useStore((s) => s.toggleSectionJump)
  const lineSearchOpen = useStore((s) => s.lineSearchOpen)
  const toggleLineSearch = useStore((s) => s.toggleLineSearch)
  const exportMenuOpen = useStore((s) => s.exportMenuOpen)
  const toggleExportMenu = useStore((s) => s.toggleExportMenu)
  const exportScript = useStore((s) => s.exportScript)
  const importScript = useStore((s) => s.importScript)
  const setScriptDueDate = useStore((s) => s.setScriptDueDate)
  const noteColor = useStore((s) => s.noteColor)
  const setNoteColor = useStore((s) => s.setNoteColor)
  const forceSave = useStore((s) => s.forceSave)
  const openSaveHistory = useStore((s) => s.openSaveHistory)
  const keybinds = useStore((s) => s.keybinds)

  // The app name and version badge live in the title bar (TitleBar.jsx).
  if (!script) return <div className="topbar" />

  const canUndo = undoScriptId === script.id && undoStack.length > 0
  const canRedo = undoScriptId === script.id && redoStack.length > 0
  const { totalSeconds, totalWords } = scriptTotalStats(script)

  const due = dueDateInfo(script.dueDate)
  const wordsNow = totalWordCountAll(script)
  const todayDelta = script.dailyBaseline ? wordsNow - script.dailyBaseline.words : wordsNow
  const workLogTooltip =
    'Words written today: ' + (todayDelta >= 0 ? '+' : '') + todayDelta +
    (script.workLogHistory && script.workLogHistory.length
      ? '\n' + script.workLogHistory.slice(-7).reverse().map((h) => h.date + ': ' + (h.words >= 0 ? '+' : '') + h.words).join('\n')
      : '')

  // Every button here is icon-only; its description lives in `title`, which
  // Tooltip.jsx turns into a themed tooltip. A trailing "(ctrl+…)" becomes a
  // key chip in that tooltip.
  const kb = (id) => (keybinds[id] ? ' (' + keybinds[id] + ')' : '')

  return (
    <div className="topbar">
      <input
        className="title-input"
        value={script.title}
        onFocus={() => pushUndo(script.id)}
        onChange={(e) => setScriptTitle(script.id, e.target.value)}
        onBlur={() => commitScriptTitle(script.id)}
      />
      {/* The one-off flash ("Copied 3 lines") briefly covers the persistent
          save status instead of reserving its own empty slot. */}
      <div className={'tb-save' + (savedFlash ? ' flashing' : '')}>
        <SaveStatus />
        <span className="saved-flash">{savedFlashText}</span>
      </div>
      <div className="tb-group">
        <button className="icon-btn tb-icon" onClick={() => forceSave(script.id)} title="Save now, and drop a checkpoint in the history">
          <Icon name="save" />
        </button>
        <button className="icon-btn tb-icon" onClick={() => openSaveHistory(script.id)} title="Save history — browse and restore earlier versions">
          <Icon name="history" />
        </button>
      </div>
      <div className="topbar-spacer" />
      <div className="tb-stats">
        <span className="tb-stat" title="Estimated runtime of the whole script">
          <Icon name="clock" size={12} />
          {formatTC(totalSeconds)}
        </span>
        <span className="tb-stat" title="Spoken words in the whole script">
          <Icon name="text" size={12} />
          {totalWords.toLocaleString()}
        </span>
        <span className={'tb-stat' + (todayDelta > 0 ? ' up' : '')} title={workLogTooltip}>
          {todayDelta >= 0 ? '+' : ''}
          {todayDelta}
        </span>
      </div>
      <label className={'date-field' + (due && due.urgency ? ' ' + due.urgency : '')} title="Deadline / upload date">
        <Icon name="calendar" size={12} />
        <input
          type="date"
          value={script.dueDate || ''}
          onChange={(e) => setScriptDueDate(script.id, e.target.value)}
        />
      </label>
      <div className="divider-v" />
      <div className="tb-group">
        <button className="icon-btn tb-icon" disabled={!canUndo} onClick={undo} title="Undo (Ctrl+Z)">
          <Icon name="undo" />
        </button>
        <button className="icon-btn tb-icon" disabled={!canRedo} onClick={redo} title="Redo (Ctrl+Shift+Z)">
          <Icon name="redo" />
        </button>
      </div>
      <div className="tb-group">
        <div style={{ position: 'relative' }}>
          <button
            className={'icon-btn tb-icon' + (lineSearchOpen ? ' active' : '')}
            data-menu-trigger="lineSearch"
            onClick={toggleLineSearch}
            title={'Search lines' + kb('search')}
          >
            <Icon name="search" />
          </button>
          {lineSearchOpen && <LineSearchMenu script={script} />}
        </div>
        <div style={{ position: 'relative' }}>
          <button
            className={'icon-btn tb-icon' + (sectionJumpOpen ? ' active' : '')}
            data-menu-trigger="sectionJump"
            onClick={toggleSectionJump}
            title="Jump to a section"
          >
            <Icon name="list" />
          </button>
          {sectionJumpOpen && <SectionJumpMenu script={script} />}
        </div>
        <button className="icon-btn tb-icon" onClick={() => collapseAll(script.id)} title="Collapse every section">
          <Icon name="collapse" />
        </button>
      </div>
      <div className="tb-zoom">
        <button className="icon-btn tb-icon" onClick={zoomOut} title="Zoom out">
          <Icon name="minus" size={12} />
        </button>
        <span className="tb-zoom-value">{Math.round(zoom * 100)}%</span>
        <button className="icon-btn tb-icon" onClick={zoomIn} title="Zoom in">
          <Icon name="plus" size={12} />
        </button>
      </div>
      <div className="tb-group">
        <button
          className={'icon-btn tb-icon' + (hideTags ? ' active' : '')}
          onClick={toggleHideTags}
          title={(hideTags ? 'Show tags' : 'Hide tags') + kb('hideTags')}
        >
          <Icon name={hideTags ? 'tagOff' : 'tag'} />
        </button>
        <button
          className={'icon-btn tb-icon' + (hideNotes ? ' active' : '')}
          onClick={toggleHideNotes}
          title={(hideNotes ? 'Show notes' : 'Hide notes') + kb('hideNotes')}
        >
          <Icon name={hideNotes ? 'noteOff' : 'note'} />
        </button>
        <input
          type="color"
          className="note-color-input"
          value={noteColor}
          onChange={(e) => setNoteColor(e.target.value)}
          title="Note color — applies everywhere notes show up"
        />
      </div>
      <div style={{ position: 'relative' }}>
        <button
          className={'icon-btn tb-icon' + (exportMenuOpen ? ' active' : '')}
          data-menu-trigger="export"
          onClick={toggleExportMenu}
          title="Import / export"
        >
          <Icon name="file" />
        </button>
        {exportMenuOpen && (
          <div className="export-menu">
            <div
              className="export-item"
              onClick={() => {
                toggleExportMenu()
                importScript()
              }}
            >
              <Icon name="upload" size={12} /> Import a script…
            </div>
            <div className="export-menu-sep" />
            <div className="export-item" onClick={() => exportScript(script.id, 'txt')}>
              <Icon name="download" size={12} /> Plain text (.txt)
            </div>
            <div className="export-item" onClick={() => exportScript(script.id, 'md')}>
              <Icon name="download" size={12} /> Markdown (.md)
            </div>
            <div className="export-item" onClick={() => exportScript(script.id, 'json')}>
              <Icon name="download" size={12} /> Full backup (.json)
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
