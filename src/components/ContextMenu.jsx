import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
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
  const openSectionTab = useStore((s) => s.openSectionTab)
  const toggleSectionChecklistOpen = useStore((s) => s.toggleSectionChecklistOpen)
  const setMapMainThread = useStore((s) => s.setMapMainThread)
  const deleteMapSelection = useStore((s) => s.deleteMapSelection)
  const duplicateSection = useStore((s) => s.duplicateSection)
  const duplicateIdeaNode = useStore((s) => s.duplicateIdeaNode)
  const alignMapNodesToLine = useStore((s) => s.alignMapNodesToLine)
  const snapMapNodesToGrid = useStore((s) => s.snapMapNodesToGrid)
  const spaceMapNodesEvenly = useStore((s) => s.spaceMapNodesEvenly)
  const scripts = useStore((s) => s.scripts)
  const openScript = useStore((s) => s.openScript)
  const togglePin = useStore((s) => s.togglePin)
  const deleteScript = useStore((s) => s.deleteScript)

  const ref = useRef(null)
  const [pos, setPos] = useState(null)

  // A misspelled-word right-click pops Electron's native spellcheck-
  // suggestions menu from the main process (see electron/main/index.js) —
  // it doesn't know about this component's own menu, so it tells us to
  // close ours via IPC rather than leaving it sitting open underneath.
  useEffect(() => {
    if (window.bijou && window.bijou.onCloseContextMenu) window.bijou.onCloseContextMenu(closeContextMenu)
  }, [closeContextMenu])

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
    const nodes = script.mapLayout.nodes
    const sectionIds = ids.filter((id) => nodes[id] && nodes[id].type !== 'idea')
    const ideaIds = ids.filter((id) => nodes[id] && nodes[id].type === 'idea')
    const targetSections = sectionIds.map((id) => script.sections.find((se) => se.id === id)).filter(Boolean)
    const isMain = script.mapLayout.mainThreadId === menu.sectionId
    const isIdea = ideaIds.includes(menu.sectionId)
    const deleteLabel = ids.length > 1 ? 'Delete ' + ids.length + ' nodes' : isIdea ? 'Delete node' : 'Delete section'
    items = [
      ids.length === 1 && !isIdea
        ? { label: 'Open in new tab', onClick: act(() => openSectionTab(menu.scriptId, menu.sectionId)) }
        : null,
      ids.length === 1 && !isIdea
        ? { label: isMain ? 'Unset as main thread start' : 'Set as main thread start', onClick: act(() => setMapMainThread(menu.scriptId, menu.sectionId)) }
        : null,
      ids.length === 1
        ? {
            label: 'Duplicate',
            onClick: act(() => (isIdea ? duplicateIdeaNode(menu.scriptId, menu.sectionId) : duplicateSection(menu.scriptId, menu.sectionId)))
          }
        : null,
      ids.length > 1 ? { label: 'Align to a line', onClick: act(() => alignMapNodesToLine(menu.scriptId, ids)) } : null,
      ids.length > 1 ? { label: 'Snap to grid', onClick: act(() => snapMapNodesToGrid(menu.scriptId, ids)) } : null,
      ids.length > 1 ? { label: 'Space evenly', onClick: act(() => spaceMapNodesEvenly(menu.scriptId, ids)) } : null,
      {
        label: deleteLabel,
        danger: true,
        onClick: act(() => {
          const needsConfirm = sectionIds.length > 0 && sectionsHaveContent(targetSections)
          const msg = ids.length > 1
            ? 'Delete ' + ids.length + ' nodes? This removes any real sections’ lines and checkpoints permanently.'
            : isIdea
              ? 'Delete this node?'
              : 'Delete this section? This removes its lines and checkpoints permanently.'
          if (!needsConfirm || window.confirm(msg)) deleteMapSelection(menu.scriptId, sectionIds, ideaIds)
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
