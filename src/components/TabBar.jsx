import React from 'react'
import { useStore } from '../state/store.js'
import Icon from './icons.jsx'
import { wasOutlineLastFocused } from '../state/lineRefs.js'

// Section tabs on the left, view switches (focus / teleprompter / map /
// outline / split / resume) on the right. Always rendered so the view
// buttons have a home even when no section is open as its own tab.
export default function TabBar({ script }) {
  const setActiveTab = useStore((s) => s.setActiveTab)
  const closeTab = useStore((s) => s.closeTab)
  const focusMode = useStore((s) => s.focusMode)
  const toggleFocusMode = useStore((s) => s.toggleFocusMode)
  const openTeleprompter = useStore((s) => s.openTeleprompter)
  const mapViewOpen = useStore((s) => s.mapViewOpen)
  const toggleMapView = useStore((s) => s.toggleMapView)
  const mapSplitOpen = useStore((s) => s.mapSplitOpen)
  const toggleMapSplit = useStore((s) => s.toggleMapSplit)
  const outlineViewOpen = useStore((s) => s.outlineViewOpen)
  const toggleOutlineView = useStore((s) => s.toggleOutlineView)
  const outlineSplitOpen = useStore((s) => s.outlineSplitOpen)
  const toggleOutlineSplit = useStore((s) => s.toggleOutlineSplit)
  const jumpToResumeLine = useStore((s) => s.jumpToResumeLine)
  const jumpToResumeOutlineNode = useStore((s) => s.jumpToResumeOutlineNode)
  const keybinds = useStore((s) => s.keybinds)

  // In split mode, outlineViewOpen alone can't tell which side the resume
  // action should target — disambiguate by whichever pane was last really
  // focused (see wasOutlineLastFocused's own comment for why this can't
  // just be a live activeElement check at click time).
  function resumeJumpIsOutline() {
    if (!outlineViewOpen) return false
    if (!outlineSplitOpen) return true
    const last = wasOutlineLastFocused()
    return last === null ? true : last
  }
  const resumeOutline = resumeJumpIsOutline()
  const kb = (id) => (keybinds[id] ? ' (' + keybinds[id] + ')' : '')

  return (
    <div className="tabbar">
      <div className="tabbar-tabs">
        {script.openTabs.length > 0 && (
          <button
            className={'tab-chip' + (script.activeTabId === 'all' ? ' active' : '')}
            onClick={() => setActiveTab(script.id, 'all')}
          >
            All
          </button>
        )}
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
      <div className="tb-group">
        <button
          className={'icon-btn tb-icon' + (focusMode ? ' active' : '')}
          onClick={toggleFocusMode}
          title={'Focus mode — hide everything but the script' + kb('focusMode')}
        >
          <Icon name="focus" />
        </button>
        <button className="icon-btn tb-icon" onClick={openTeleprompter} title="Teleprompter — distraction-free reading view">
          <Icon name="teleprompter" />
        </button>
        <button
          className={'icon-btn tb-icon' + (mapViewOpen ? ' active' : '')}
          onClick={toggleMapView}
          title="Mind map — the whole video as cards"
        >
          <Icon name="map" />
        </button>
        <button
          className={'icon-btn tb-icon' + (outlineViewOpen ? ' active' : '')}
          onClick={toggleOutlineView}
          title="Outline — a flattened, editable list of the mind map"
        >
          <Icon name="menu" />
        </button>
        {mapViewOpen && (
          <button
            className={'icon-btn tb-icon' + (mapSplitOpen ? ' active' : '')}
            onClick={toggleMapSplit}
            title="Show the script and the map side by side"
          >
            <Icon name="split" />
          </button>
        )}
        {outlineViewOpen && (
          <button
            className={'icon-btn tb-icon' + (outlineSplitOpen ? ' active' : '')}
            onClick={toggleOutlineSplit}
            title="Show the script and the outline side by side"
          >
            <Icon name="split" />
          </button>
        )}
      </div>
      <div className="divider-v" />
      <button
        className="icon-btn tb-icon"
        disabled={resumeOutline ? !script.resumeOutlineNodeId : !script.resumeLineKey}
        onClick={() => (resumeOutline ? jumpToResumeOutlineNode(script.id) : jumpToResumeLine(script.id))}
        title={'Jump to your resume point — set one by right-clicking a line' + kb('jumpToResumePoint')}
      >
        <Icon name="bookmark" />
      </button>
    </div>
  )
}
