import React, { useLayoutEffect, useRef, useState } from 'react'
import { useStore } from '../state/store.js'
import { findLine, sectionsHaveContent } from '../lib/model.js'

export default function ContextMenu() {
  const menu = useStore((s) => s.contextMenu)
  const closeContextMenu = useStore((s) => s.closeContextMenu)
  const deleteLine = useStore((s) => s.deleteLine)
  const duplicateLine = useStore((s) => s.duplicateLine)
  const openTagMenu = useStore((s) => s.openTagMenu)
  const toggleLineNote = useStore((s) => s.toggleLineNote)
  const toggleLineDone = useStore((s) => s.toggleLineDone)
  const toggleStruckForLines = useStore((s) => s.toggleStruckForLines)
  const toggleLineBookmark = useStore((s) => s.toggleLineBookmark)
  const copyLineToClipboard = useStore((s) => s.copyLineToClipboard)
  const flashSaved = useStore((s) => s.flashSaved)
  const deleteSection = useStore((s) => s.deleteSection)
  const deleteSections = useStore((s) => s.deleteSections)
  const openSectionTab = useStore((s) => s.openSectionTab)
  const toggleSectionChecklistOpen = useStore((s) => s.toggleSectionChecklistOpen)
  const setMapMainThread = useStore((s) => s.setMapMainThread)
  const scripts = useStore((s) => s.scripts)
  const openScript = useStore((s) => s.openScript)
  const togglePin = useStore((s) => s.togglePin)
  const deleteScript = useStore((s) => s.deleteScript)

  const ref = useRef(null)
  const [pos, setPos] = useState(null)

  useLayoutEffect(() => {
    if (!menu || !ref.current) {
      setPos(null)
      return
    }
    const rect = ref.current.getBoundingClientRect()
    const x = Math.min(menu.x, window.innerWidth - rect.width - 8)
    const y = Math.min(menu.y, window.innerHeight - rect.height - 8)
    setPos({ x: Math.max(4, x), y: Math.max(4, y) })
  }, [menu])

  if (!menu) return null

  const script = scripts.find((s) => s.id === menu.scriptId)
  if (!script) return null

  function act(fn) {
    return () => {
      fn()
      closeContextMenu()
    }
  }

  let items = []
  if (menu.type === 'script') {
    items = [
      { label: 'Open', onClick: act(() => openScript(menu.scriptId)) },
      { label: script.pinned ? 'Unpin' : 'Pin', onClick: act(() => togglePin(menu.scriptId)) },
      {
        label: 'Delete',
        danger: true,
        onClick: act(() => {
          if (window.confirm('Delete "' + script.title + '"? This removes its file permanently.')) {
            deleteScript(menu.scriptId)
          }
        })
      }
    ]
  } else if (menu.type === 'line') {
    const key = menu.sectionId + ':' + menu.lineId
    const found = findLine(script, key)
    const line = found && found.line
    items = [
      { label: 'Tag…', onClick: act(() => openTagMenu(key)) },
      { label: line && line.noteOpen ? 'Close note' : 'Add note', onClick: act(() => toggleLineNote(menu.scriptId, menu.sectionId, menu.lineId)) },
      line && line.categoryId
        ? { label: line.done ? 'Mark not done' : 'Mark done', onClick: act(() => toggleLineDone(menu.scriptId, menu.sectionId, menu.lineId)) }
        : null,
      { label: line && line.struck ? 'Unstrike' : 'Strike through', onClick: act(() => toggleStruckForLines(menu.scriptId, [key])) },
      { label: line && line.bookmarked ? 'Remove bookmark' : 'Bookmark', onClick: act(() => toggleLineBookmark(menu.scriptId, menu.sectionId, menu.lineId)) },
      { label: 'Duplicate', onClick: act(() => duplicateLine(menu.scriptId, menu.sectionId, menu.lineId)) },
      {
        label: 'Copy',
        onClick: act(() => {
          copyLineToClipboard(menu.scriptId, menu.sectionId, menu.lineId)
          flashSaved('Copied 1 line')
        })
      },
      { label: 'Delete', danger: true, onClick: act(() => deleteLine(menu.scriptId, menu.sectionId, menu.lineId)) }
    ].filter(Boolean)
  } else if (menu.type === 'section') {
    items = [
      { label: 'Open in new tab', onClick: act(() => openSectionTab(menu.scriptId, menu.sectionId)) },
      { label: 'Toggle checkpoints panel', onClick: act(() => toggleSectionChecklistOpen(menu.scriptId, menu.sectionId)) },
      { label: 'Delete section', danger: true, onClick: act(() => deleteSection(menu.scriptId, menu.sectionId)) }
    ]
  } else if (menu.type === 'mapNode') {
    const ids = menu.selectedIds && menu.selectedIds.length > 1 && menu.selectedIds.includes(menu.sectionId) ? menu.selectedIds : [menu.sectionId]
    const targetSections = ids.map((id) => script.sections.find((se) => se.id === id)).filter(Boolean)
    const isMain = script.mapLayout.mainThreadId === menu.sectionId
    const deleteLabel = ids.length > 1 ? 'Delete ' + ids.length + ' sections' : 'Delete section'
    items = [
      ids.length === 1 ? { label: 'Open in new tab', onClick: act(() => openSectionTab(menu.scriptId, menu.sectionId)) } : null,
      ids.length === 1
        ? { label: isMain ? 'Unset as main thread start' : 'Set as main thread start', onClick: act(() => setMapMainThread(menu.scriptId, menu.sectionId)) }
        : null,
      {
        label: deleteLabel,
        danger: true,
        onClick: act(() => {
          const needsConfirm = sectionsHaveContent(targetSections)
          const msg = ids.length > 1
            ? 'Delete ' + ids.length + ' sections? This removes their lines and checkpoints permanently.'
            : 'Delete this section? This removes its lines and checkpoints permanently.'
          if (!needsConfirm || window.confirm(msg)) deleteSections(menu.scriptId, ids)
        })
      }
    ].filter(Boolean)
  }

  return (
    <div
      ref={ref}
      className="context-menu"
      style={{ left: pos ? pos.x : menu.x, top: pos ? pos.y : menu.y, visibility: pos ? 'visible' : 'hidden' }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((it, i) => (
        <div key={i} className={'context-menu-item' + (it.danger ? ' danger' : '')} onClick={it.onClick}>
          {it.label}
        </div>
      ))}
    </div>
  )
}
