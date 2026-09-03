import React, { useEffect } from 'react'
import { useStore } from '../../state/store.js'
import SectionBlock from './SectionBlock.jsx'
import FilterView from './FilterView.jsx'
import MapView from './MapView.jsx'
import OutlineView from './OutlineView.jsx'
import MarginPanel from './MarginPanel.jsx'
import TimestampLogPanel from './TimestampLogPanel.jsx'
import ProjectChecklistPanel from './ProjectChecklistPanel.jsx'
import BookmarksPanel from './BookmarksPanel.jsx'
import PinnedPanel from './PinnedPanel.jsx'
import ResizableMarginStack from './ResizableMarginStack.jsx'
import { sectionTimecodes } from '../../lib/timecode.js'
import { computeMainThread } from '../../lib/mapGraph.js'

export default function EditorMain({ scriptId, script }) {
  const filterCategory = useStore((s) => s.filterCategory)
  const setFilterCategory = useStore((s) => s.setFilterCategory)
  const addSection = useStore((s) => s.addSection)
  const focusMode = useStore((s) => s.focusMode)
  const zoom = useStore((s) => s.zoom)
  const setActiveTab = useStore((s) => s.setActiveTab)
  const mapViewOpen = useStore((s) => s.mapViewOpen)
  const mapSplitOpen = useStore((s) => s.mapSplitOpen)
  const outlineViewOpen = useStore((s) => s.outlineViewOpen)
  const outlineSplitOpen = useStore((s) => s.outlineSplitOpen)
  const leftMarginOpen = useStore((s) => s.leftMarginOpen)
  const toggleLeftMargin = useStore((s) => s.toggleLeftMargin)
  const rightMarginOpen = useStore((s) => s.rightMarginOpen)
  const toggleRightMargin = useStore((s) => s.toggleRightMargin)
  const bookmarksMarginOpen = useStore((s) => s.bookmarksMarginOpen)
  const toggleBookmarksMargin = useStore((s) => s.toggleBookmarksMargin)
  const pinnedMarginOpen = useStore((s) => s.pinnedMarginOpen)
  const togglePinnedMargin = useStore((s) => s.togglePinnedMargin)

  const activeTabId = script.activeTabId
  const singleIdx = activeTabId && activeTabId !== 'all' ? script.sections.findIndex((s) => s.id === activeTabId) : -1

  // If the tabbed section got deleted out from under us, fall back to "all".
  useEffect(() => {
    if (activeTabId && activeTabId !== 'all' && singleIdx < 0) setActiveTab(scriptId, 'all')
  }, [activeTabId, singleIdx, scriptId, setActiveTab])

  if (outlineViewOpen && !outlineSplitOpen) {
    return <OutlineView scriptId={scriptId} script={script} />
  }

  if (mapViewOpen && !mapSplitOpen) {
    return <MapView scriptId={scriptId} script={script} />
  }

  if (filterCategory) {
    return <FilterView scriptId={scriptId} script={script} categoryId={filterCategory} />
  }

  const tcs = sectionTimecodes(script)
  const showingSingle = singleIdx >= 0
  const { order: mapOrder } = computeMainThread(script.mapLayout)

  const editor = (
    <div className={'editor-wrap' + (focusMode ? ' focus-wide' : '')} style={{ zoom }}>
      {showingSingle ? (
        <SectionBlock
          scriptId={scriptId}
          sec={script.sections[singleIdx]}
          tc={tcs[singleIdx]}
          categories={script.categories}
          onSetFilter={setFilterCategory}
          mapOrder={mapOrder.get(script.sections[singleIdx].id)}
        />
      ) : (
        <>
          {script.sections.map((sec, idx) => (
            <SectionBlock
              key={sec.id}
              scriptId={scriptId}
              sec={sec}
              tc={tcs[idx]}
              categories={script.categories}
              onSetFilter={setFilterCategory}
              mapOrder={mapOrder.get(sec.id)}
            />
          ))}
          <button className="add-section-btn" onClick={() => addSection(scriptId)}>
            + Add section
          </button>
        </>
      )}
    </div>
  )

  // Side-by-side mode — the script for reference while planning on the
  // map, without giving up either view's own scroll/zoom/pan. Margin
  // panels (timestamps, pinned, checklist, bookmarks) are left out here
  // to keep it to two panes, not four.
  if (mapViewOpen && mapSplitOpen) {
    return (
      <div className="main editor-split">
        <div className="editor-split-pane">{editor}</div>
        <MapView scriptId={scriptId} script={script} />
      </div>
    )
  }

  if (outlineViewOpen && outlineSplitOpen) {
    return (
      <div className="main editor-split">
        <div className="editor-split-pane">{editor}</div>
        <OutlineView scriptId={scriptId} script={script} />
      </div>
    )
  }

  if (focusMode) {
    return <div className="main">{editor}</div>
  }

  return (
    <div className="main">
      <div className="editor-columns">
        <ResizableMarginStack side="left" anyOpen={leftMarginOpen || pinnedMarginOpen}>
          <MarginPanel side="left" title="Timestamps" open={leftMarginOpen} onToggle={toggleLeftMargin}>
            <TimestampLogPanel scriptId={scriptId} script={script} />
          </MarginPanel>
          <MarginPanel side="left" title="Pinned" open={pinnedMarginOpen} onToggle={togglePinnedMargin}>
            <PinnedPanel scriptId={scriptId} script={script} side="left" />
          </MarginPanel>
        </ResizableMarginStack>
        {editor}
        <ResizableMarginStack side="right" anyOpen={rightMarginOpen || bookmarksMarginOpen}>
          <MarginPanel side="right" title="Checklist" open={rightMarginOpen} onToggle={toggleRightMargin}>
            <ProjectChecklistPanel scriptId={scriptId} script={script} />
          </MarginPanel>
          <MarginPanel side="right" title="Bookmarks" open={bookmarksMarginOpen} onToggle={toggleBookmarksMargin}>
            <BookmarksPanel scriptId={scriptId} script={script} />
          </MarginPanel>
        </ResizableMarginStack>
      </div>
    </div>
  )
}
