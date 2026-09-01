import React, { useEffect, useRef, useState } from 'react'
import { useStore } from '../../state/store.js'
import Icon from '../icons.jsx'
import LineRow from './LineRow.jsx'
import ChecklistPanel from './ChecklistPanel.jsx'
import { formatTC } from '../../lib/timecode.js'
import { setLineRef } from '../../state/lineRefs.js'
import { handleHorizontalNav, handleVerticalNav } from '../../lib/navigation.js'
import { useDropIndicator } from '../../hooks/useDropIndicator.js'

function sectionCategoryStats(categories, sec) {
  const stats = []
  categories.forEach((c) => {
    let count = 0
    let done = 0
    sec.lines.forEach((l) => {
      if (l.categoryId === c.id) {
        count++
        if (l.done) done++
      }
    })
    if (count > 0) stats.push({ cat: c, count, done })
  })
  return stats
}

export default function SectionBlock({ scriptId, sec, tc, categories, onSetFilter, mapOrder }) {
  const toggleSectionCollapsed = useStore((s) => s.toggleSectionCollapsed)
  const deleteSection = useStore((s) => s.deleteSection)
  const addLine = useStore((s) => s.addLine)
  const setSectionHeading = useStore((s) => s.setSectionHeading)
  const commitSectionHeading = useStore((s) => s.commitSectionHeading)
  const setSectionColor = useStore((s) => s.setSectionColor)
  const commitSectionColor = useStore((s) => s.commitSectionColor)
  const pushUndo = useStore((s) => s.pushUndo)
  const toggleSectionChecklistOpen = useStore((s) => s.toggleSectionChecklistOpen)
  const openSectionTab = useStore((s) => s.openSectionTab)
  const jumpHighlightId = useStore((s) => s.jumpHighlightId)
  const selectedSections = useStore((s) => s.selectedSections)
  const toggleSectionSelected = useStore((s) => s.toggleSectionSelected)
  const reorderSection = useStore((s) => s.reorderSection)
  const moveCheckItemToSectionEnd = useStore((s) => s.moveCheckItemToSectionEnd)
  const moveSection = useStore((s) => s.moveSection)
  const moveLineToChecklist = useStore((s) => s.moveLineToChecklist)
  const openContextMenu = useStore((s) => s.openContextMenu)
  const toggleSectionDone = useStore((s) => s.toggleSectionDone)

  const rootRef = useRef(null)
  const flash = jumpHighlightId === sec.id
  const [checklistDragOver, setChecklistDragOver] = useState(false)
  const dropIndicator = useDropIndicator()

  useEffect(() => {
    if (flash && rootRef.current) {
      rootRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }, [flash])

  const label = formatTC(tc.start) + '–' + formatTC(tc.end)
  const allStruck = sec.lines.length > 0 && sec.lines.every((l) => l.struck)
  const selected = selectedSections && selectedSections.includes(sec.id)
  const stats = sectionCategoryStats(categories, sec)
  const headStyle = sec.titleColor ? { color: sec.titleColor } : undefined
  const headingKey = 'heading:' + sec.id

  function handleHeadingKeyDown(e) {
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && e.shiftKey && (e.ctrlKey || e.metaKey) && !e.altKey) {
      e.preventDefault()
      moveSection(scriptId, sec.id, e.key === 'ArrowUp' ? -1 : 1)
      setTimeout(() => {
        const t = document.querySelector('[data-heading-for="' + sec.id + '"]')
        if (t) {
          t.focus()
          t.select()
        }
      }, 0)
      return
    }
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault()
      toggleSectionSelected(sec.id)
      return
    }
    if (handleVerticalNav(e, e.target)) return
    if (handleHorizontalNav(e, e.target, true)) return
    if (e.key === 'Enter') {
      e.preventDefault()
      const newKey = addLine(scriptId, sec.id)
      if (newKey) {
        setTimeout(() => {
          const t = document.querySelector('[data-line-key="' + newKey + '"]')
          if (t) t.focus()
        }, 0)
      }
    }
  }

  return (
    <div
      ref={rootRef}
      className={
        'section-block' +
        (allStruck ? ' struck-all' : '') +
        (selected ? ' selected' : '') +
        (flash ? ' jump-flash' : '') +
        (dropIndicator.edge ? ' drop-indicator-' + dropIndicator.edge : '')
      }
      data-sec-id={sec.id}
      onDragOver={(e) => {
        dropIndicator.onDragOver(e, (ev) => ev.dataTransfer.types.includes('text/plain') || ev.dataTransfer.types.includes('application/x-checkitem'))
      }}
      onDragLeave={dropIndicator.onDragLeave}
      onDrop={(e) => {
        const edge = dropIndicator.edge
        dropIndicator.clear()
        const checkData = e.dataTransfer.getData('application/x-checkitem')
        if (checkData) {
          e.preventDefault()
          const { sec: fromSecId, item: itemId } = JSON.parse(checkData)
          moveCheckItemToSectionEnd(scriptId, fromSecId, itemId, sec.id)
          return
        }
        const draggedId = e.dataTransfer.getData('text/plain')
        if (draggedId && draggedId !== sec.id) {
          e.preventDefault()
          reorderSection(scriptId, draggedId, sec.id, edge || 'before')
        }
      }}
    >
      <div
        className="section-head"
        onClick={(e) => {
          if (window.getSelection().toString()) return
          if (e.shiftKey && !e.ctrlKey && !e.metaKey) {
            toggleSectionSelected(sec.id)
            return
          }
          toggleSectionCollapsed(scriptId, sec.id)
        }}
        onDoubleClick={() => openSectionTab(scriptId, sec.id)}
        onContextMenu={(e) => {
          e.preventDefault()
          openContextMenu({ type: 'section', scriptId, sectionId: sec.id, x: e.clientX, y: e.clientY })
        }}
      >
        <span
          className="sec-drag-handle"
          draggable="true"
          onClick={(e) => {
            e.stopPropagation()
            toggleSectionSelected(sec.id)
          }}
          onDragStart={(e) => {
            e.dataTransfer.setData('text/plain', sec.id)
            e.dataTransfer.effectAllowed = 'move'
          }}
          title="Click to select, drag to reorder"
        >
          <Icon name="grip" />
        </span>
        <span className={'chevron' + (sec.collapsed ? ' collapsed' : '')}>
          <Icon name="chevron" />
        </span>
        <input
          type="checkbox"
          className="sec-list-done"
          checked={sec.done}
          onClick={(e) => e.stopPropagation()}
          onChange={() => toggleSectionDone(scriptId, sec.id)}
          title="Mark this section done"
        />
        <span className="section-tc">{label}</span>
        {mapOrder != null && (
          <span className="section-map-order" title={'Position ' + mapOrder + ' in your mind map\'s main thread'}>
            {mapOrder}
          </span>
        )}
        <input
          type="color"
          className="sec-color-input"
          value={sec.titleColor || '#4FD1C5'}
          title="Color this section title"
          onClick={(e) => e.stopPropagation()}
          onFocus={() => pushUndo(scriptId)}
          onChange={(e) => setSectionColor(scriptId, sec.id, e.target.value)}
          onBlur={() => commitSectionColor(scriptId)}
        />
        <input
          className={'section-heading-input' + (sec.done ? ' done' : '')}
          value={sec.heading}
          style={headStyle}
          data-heading-for={sec.id}
          ref={(el) => setLineRef(headingKey, el)}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onFocus={() => pushUndo(scriptId)}
          onChange={(e) => setSectionHeading(scriptId, sec.id, e.target.value)}
          onBlur={() => commitSectionHeading(scriptId, sec.id)}
          onKeyDown={handleHeadingKeyDown}
        />
        <button
          className={'sec-icon-btn' + (checklistDragOver ? ' drag-target' : '')}
          onClick={(e) => {
            e.stopPropagation()
            toggleSectionChecklistOpen(scriptId, sec.id)
          }}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes('application/x-line')) {
              e.preventDefault()
              e.stopPropagation()
              setChecklistDragOver(true)
            }
          }}
          onDragLeave={() => setChecklistDragOver(false)}
          onDrop={(e) => {
            const lineData = e.dataTransfer.getData('application/x-line')
            if (lineData) {
              e.preventDefault()
              e.stopPropagation()
              const { sec: fromSecId, line: fromLineId } = JSON.parse(lineData)
              moveLineToChecklist(scriptId, fromSecId, fromLineId, sec.id)
              if (!sec.checklistOpen) toggleSectionChecklistOpen(scriptId, sec.id)
            }
            setChecklistDragOver(false)
          }}
          title="Checkpoints for this section — drop a line here to add it"
        >
          <Icon name="idea" size={13} />
          {sec.checklist.length > 0 && <span className="sec-icon-badge">{sec.checklist.length}</span>}
        </button>
        <button
          className="sec-icon-btn"
          onClick={(e) => {
            e.stopPropagation()
            openSectionTab(scriptId, sec.id)
          }}
          title="Open in new tab"
        >
          <Icon name="tabopen" size={13} />
        </button>
        <button
          className="sec-icon-btn danger"
          onClick={(e) => {
            e.stopPropagation()
            deleteSection(scriptId, sec.id)
          }}
          title="Delete section"
        >
          &times;
        </button>
      </div>

      {stats.length > 0 && (
        <div className="section-chips">
          {stats.map((s) => (
            <div key={s.cat.id} className="section-chip" onClick={() => onSetFilter(s.cat.id)}>
              <span className="section-chip-dot" style={{ background: s.cat.color }} />
              {s.cat.label} {s.done}/{s.count}
            </div>
          ))}
        </div>
      )}

      {sec.checklistOpen && !sec.collapsed && <ChecklistPanel scriptId={scriptId} sec={sec} />}

      {!sec.collapsed && (
        <div className="section-lines">
          {sec.lines.map((line, idx) => (
            <LineRow
              key={line.id}
              scriptId={scriptId}
              sectionId={sec.id}
              line={line}
              index={idx}
              siblingCount={sec.lines.length}
              categories={categories}
            />
          ))}
          <button className="add-line-btn" onClick={() => addLine(scriptId, sec.id)}>
            + Add line
          </button>
        </div>
      )}
    </div>
  )
}
