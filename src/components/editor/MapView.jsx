import React, { useEffect, useRef, useState } from 'react'
import { useStore } from '../../state/store.js'
import { comboFromEvent } from '../../lib/keybinds.js'
import { sectionsHaveContent } from '../../lib/model.js'
import Icon from '../icons.jsx'
import MapNode, { NODE_WIDTH } from './MapNode.jsx'
import IdeaNode from './IdeaNode.jsx'
import ChapterNode from './ChapterNode.jsx'
import { computeMainThread } from '../../lib/mapGraph.js'

function isIdeaNode(node) {
  return !!node && node.type === 'idea'
}
function isChapterNode(node) {
  return !!node && node.type === 'chapter'
}
// A "real" section-backed node is anything with no explicit type at all —
// idea and chapter nodes both live purely in mapLayout.nodes and always
// carry their own `type`.
function isSectionNode(node) {
  return !!node && !node.type
}

const NODE_H = 80 // nominal card height for edge-anchor math — cards vary a little with content, close enough for connector lines
const ZOOM_MIN = 0.25
const ZOOM_MAX = 2

function centerOf(node) {
  return { x: node.x + NODE_WIDTH / 2, y: node.y + NODE_H / 2 }
}

function sideAnchor(node, side) {
  const c = centerOf(node)
  if (side === 'top') return { x: c.x, y: node.y }
  if (side === 'bottom') return { x: c.x, y: node.y + NODE_H }
  if (side === 'left') return { x: node.x, y: c.y }
  return { x: node.x + NODE_WIDTH, y: c.y }
}

// Which side of each node an edge between them should visually leave
// from/arrive at, purely from their relative position — used both to draw
// existing edges and to figure out which of a node's 4 connector dots was
// actually meant, regardless of which one the drag started from.
function pickSides(a, b) {
  const ca = centerOf(a)
  const cb = centerOf(b)
  const dx = cb.x - ca.x
  const dy = cb.y - ca.y
  if (Math.abs(dy) >= Math.abs(dx)) return dy >= 0 ? ['bottom', 'top'] : ['top', 'bottom']
  return dx >= 0 ? ['right', 'left'] : ['left', 'right']
}

// A node with nothing growing out of it yet, but something feeding into
// it, is the current end of a thread — offer a one-click way to keep
// extending it in whichever direction it was already trending.
// Which of a node's 4 connector dots a given edge is currently anchored
// to, from that node's own side of the connection — used to decide which
// dot an edge's disconnect affordance belongs on, since edges themselves
// don't store a side, only the two node ids.
function anchorSideForNode(edge, sectionId, nodes) {
  const isFrom = edge.from === sectionId
  const otherId = isFrom ? edge.to : edge.from
  const other = nodes[otherId]
  const node = nodes[sectionId]
  if (!node || !other) return null
  const [sideOnFrom, sideOnTo] = isFrom ? pickSides(node, other) : pickSides(other, node)
  return isFrom ? sideOnFrom : sideOnTo
}

function threadEndDirection(sectionId, nodes, edges) {
  const hasOutgoing = edges.some((e) => e.from === sectionId)
  if (hasOutgoing) return null
  const incoming = edges.filter((e) => e.to === sectionId)
  if (!incoming.length) return null
  const src = nodes[incoming[incoming.length - 1].from]
  const node = nodes[sectionId]
  if (!src || !node) return null
  const dx = node.x - src.x
  const dy = node.y - src.y
  if (Math.abs(dy) >= Math.abs(dx)) return dy >= 0 ? 'down' : 'up'
  return dx >= 0 ? 'right' : 'left'
}

export default function MapView({ scriptId, script }) {
  const keybinds = useStore((s) => s.keybinds)
  const jumpToSection = useStore((s) => s.jumpToSection)
  const toggleMapView = useStore((s) => s.toggleMapView)
  const ensureMapNodes = useStore((s) => s.ensureMapNodes)
  const setMapNodePosition = useStore((s) => s.setMapNodePosition)
  const addSectionFromMap = useStore((s) => s.addSectionFromMap)
  const addConnectedSectionFromMap = useStore((s) => s.addConnectedSectionFromMap)
  const toggleMapHideSummaries = useStore((s) => s.toggleMapHideSummaries)
  const toggleMapNodeCollapsed = useStore((s) => s.toggleMapNodeCollapsed)
  const addMapEdge = useStore((s) => s.addMapEdge)
  const removeMapEdge = useStore((s) => s.removeMapEdge)
  const removeMapEdgesByIds = useStore((s) => s.removeMapEdgesByIds)
  const openContextMenu = useStore((s) => s.openContextMenu)
  const addIdeaNode = useStore((s) => s.addIdeaNode)
  const addConnectedIdeaNodeFromMap = useStore((s) => s.addConnectedIdeaNodeFromMap)
  const addChapterNode = useStore((s) => s.addChapterNode)
  const selectConnectedNodes = useStore((s) => s.selectConnectedNodes)
  const mapSelectRequest = useStore((s) => s.mapSelectRequest)
  const clearMapSelectRequest = useStore((s) => s.clearMapSelectRequest)
  const deleteMapSelection = useStore((s) => s.deleteMapSelection)
  const duplicateSection = useStore((s) => s.duplicateSection)
  const duplicateSections = useStore((s) => s.duplicateSections)
  const duplicateIdeaNode = useStore((s) => s.duplicateIdeaNode)
  const linkMapNodesInOrder = useStore((s) => s.linkMapNodesInOrder)
  const ideaNodePresets = useStore((s) => s.ideaNodePresets)
  const addIdeaNodePreset = useStore((s) => s.addIdeaNodePreset)
  const deleteIdeaNodePreset = useStore((s) => s.deleteIdeaNodePreset)
  const updateIdeaNodePreset = useStore((s) => s.updateIdeaNodePreset)

  const canvasRef = useRef(null)
  const dragRef = useRef(null) // { type: 'node'|'pan'|'connect'|'select', ... }
  const [zoom, setZoom] = useState(1)
  const zoomRef = useRef(1) // mirrors `zoom` synchronously — two zoomBy() calls in the same tick (e.g. a fast double-click on the +button, before React re-renders between them) would otherwise both read the same stale closured `zoom` and not compound
  const [pan, setPan] = useState({ x: 60, y: 40 })
  const panRef = useRef(pan) // mirrors `pan` on every render — screenToWorld is called from the mousemove/mouseup effect below, whose closure is only refreshed when scriptId changes, so a plain closured `pan` goes stale (and connector-drag previews / rubber-band selection start pointing at the wrong spot) the moment the user pans without also changing zoom or script
  panRef.current = pan
  const [connectPreview, setConnectPreview] = useState(null) // { fromId, x, y } in world coords
  const [selectionBox, setSelectionBox] = useState(null) // { x1, y1, x2, y2 } in world coords
  const [selectedEdgeId, setSelectedEdgeId] = useState(null)
  const [selectedNodeIds, setSelectedNodeIds] = useState([])
  const [ideaMenuOpen, setIdeaMenuOpen] = useState(false)
  const [presetManagerOpen, setPresetManagerOpen] = useState(false)
  const spaceDownRef = useRef(false)
  const mapClipboardRef = useRef([]) // [{id, type: 'section'|'idea'}] — Ctrl+C/V within the map, not the app-wide line clipboard

  // Defensive against a node getting deleted out from under a stale
  // selection (e.g. via the sidebar or another tab, not just this view).
  // Checked against mapLayout.nodes rather than script.sections so idea
  // nodes (which have no section behind them at all) count too.
  const validSelectedNodeIds = selectedNodeIds.filter((id) => script.mapLayout.nodes[id])

  useEffect(() => {
    ensureMapNodes(scriptId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptId, script.sections.length])

  // Applies a selection computed by ContextMenu.jsx's "select connected
  // nodes" items (which can't reach this component's own local state
  // directly) — see mapSelectRequest in store.js.
  useEffect(() => {
    if (mapSelectRequest && mapSelectRequest.scriptId === scriptId) {
      setSelectedNodeIds(mapSelectRequest.ids)
      clearMapSelectRequest()
    }
  }, [mapSelectRequest, scriptId, clearMapSelectRequest])

  useEffect(() => {
    if (!ideaMenuOpen) return
    function onDocMouseDown(e) {
      if (!e.target.closest('.map-idea-menu-wrap')) setIdeaMenuOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [ideaMenuOpen])

  // A selection can mix section nodes and idea nodes — each kind goes
  // through its own delete action (sections need the content-confirm
  // check + real data cleanup, idea nodes are just removed outright).
  function deleteSelection(ids) {
    if (!ids.length) return
    const nodes = script.mapLayout.nodes
    const sectionIds = ids.filter((id) => isSectionNode(nodes[id]))
    const ideaIds = ids.filter((id) => !isSectionNode(nodes[id]))
    const targetSections = sectionIds.map((id) => script.sections.find((s) => s.id === id)).filter(Boolean)
    const needsConfirm = sectionIds.length > 0 && sectionsHaveContent(targetSections)
    const msg =
      sectionIds.length > 1
        ? 'Delete ' + sectionIds.length + ' sections? This removes their lines and checkpoints permanently.'
        : 'Delete this section? This removes its lines and checkpoints permanently.'
    if (!needsConfirm || window.confirm(msg)) {
      deleteMapSelection(scriptId, sectionIds, ideaIds)
      setSelectedNodeIds([])
    }
  }

  useEffect(() => {
    function onKeyDown(e) {
      if (e.code === 'Space' && !e.repeat) {
        spaceDownRef.current = true
        if (canvasRef.current) canvasRef.current.style.cursor = 'grab'
      }
      // Computed up front and used to guard every node/edge-deleting branch
      // below — this listener is on `document`, so without it, typing a
      // real Backspace inside a node's title/text field (or a section
      // heading, or the idea-node preset manager) while some *other* node
      // or edge was left selected from an earlier click would silently
      // delete that selection instead of just erasing a character. That's
      // exactly what a leftover selection looks like: text you're actively
      // editing, and a node vanishing for no visible reason.
      const active = document.activeElement
      const isEditingText = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)
      if (!isEditingText && (e.key === 'Delete' || e.key === 'Backspace') && selectedEdgeId) {
        removeMapEdge(scriptId, selectedEdgeId)
        setSelectedEdgeId(null)
        return
      }
      if (!isEditingText && (e.key === 'Delete' || e.key === 'Backspace') && validSelectedNodeIds.length) {
        e.preventDefault()
        deleteSelection(validSelectedNodeIds)
        return
      }
      const st = useStore.getState()
      const combo = comboFromEvent(e)

      // While the idea-node menu is open, a number picks an item directly
      // (1 = Blank, 2+ = presets in order) — a keybind-driven way to spawn
      // one specific preset, not just a blank node.
      if (ideaMenuOpen && !isEditingText) {
        if (e.key === 'Escape') {
          e.preventDefault()
          setIdeaMenuOpen(false)
          return
        }
        const n = parseInt(e.key, 10)
        if (!isNaN(n) && n >= 1 && n <= ideaNodePresets.length + 1) {
          e.preventDefault()
          handleAddIdeaNode(n === 1 ? undefined : ideaNodePresets[n - 2])
          return
        }
      }

      if (combo === st.keybinds.mapAddSection) {
        e.preventDefault()
        handleAddSection()
        return
      }
      if (combo === st.keybinds.mapToggleSummaries) {
        e.preventDefault()
        if (validSelectedNodeIds.length) {
          validSelectedNodeIds.forEach((id) => toggleMapNodeCollapsed(scriptId, id))
        } else {
          toggleMapHideSummaries(scriptId)
        }
        return
      }
      if (combo === st.keybinds.mapAddIdeaNode) {
        e.preventDefault()
        setIdeaMenuOpen((v) => !v)
        setPresetManagerOpen(false)
        return
      }
      if (!isEditingText && combo === 'ctrl+c' && validSelectedNodeIds.length) {
        e.preventDefault()
        const nodes = script.mapLayout.nodes
        // Chapter nodes duplicate through the same generic path as idea
        // nodes (duplicateIdeaNode just clones whatever's there regardless
        // of type) — only real sections need the dedicated section path.
        mapClipboardRef.current = validSelectedNodeIds.map((id) => ({ id, type: isSectionNode(nodes[id]) ? 'section' : 'idea' }))
        return
      }
      if (!isEditingText && combo === 'ctrl+v' && mapClipboardRef.current.length) {
        e.preventDefault()
        const newIds = mapClipboardRef.current
          .map((item) => (item.type === 'idea' ? duplicateIdeaNode(scriptId, item.id) : duplicateSection(scriptId, item.id)))
          .filter(Boolean)
        if (newIds.length) setSelectedNodeIds(newIds)
      }
      if (!isEditingText && combo === st.keybinds.duplicate && validSelectedNodeIds.length) {
        e.preventDefault()
        const nodes = script.mapLayout.nodes
        const sectionIds = validSelectedNodeIds.filter((id) => isSectionNode(nodes[id]))
        const ideaIds = validSelectedNodeIds.filter((id) => !isSectionNode(nodes[id]))
        const newIds = [
          ...(sectionIds.length ? duplicateSections(scriptId, sectionIds) : []),
          ...ideaIds.map((id) => duplicateIdeaNode(scriptId, id)).filter(Boolean)
        ]
        if (newIds.length) setSelectedNodeIds(newIds)
      }
      if (!isEditingText && combo === st.keybinds.mapLinkNodes && validSelectedNodeIds.length >= 2) {
        e.preventDefault()
        linkMapNodesInOrder(scriptId, validSelectedNodeIds)
      }
      if (!isEditingText && combo === st.keybinds.mapSelectDownstream && validSelectedNodeIds.length) {
        e.preventDefault()
        setSelectedNodeIds(selectConnectedNodes(scriptId, validSelectedNodeIds, 'forward'))
      }
      if (!isEditingText && combo === st.keybinds.mapSelectUpstream && validSelectedNodeIds.length) {
        e.preventDefault()
        setSelectedNodeIds(selectConnectedNodes(scriptId, validSelectedNodeIds, 'backward'))
      }
      if (!isEditingText && combo === st.keybinds.mapSelectConnected && validSelectedNodeIds.length) {
        e.preventDefault()
        setSelectedNodeIds(selectConnectedNodes(scriptId, validSelectedNodeIds, 'both'))
      }
    }
    function onKeyUp(e) {
      if (e.code === 'Space') {
        spaceDownRef.current = false
        if (canvasRef.current) canvasRef.current.style.cursor = ''
      }
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('keyup', onKeyUp)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('keyup', onKeyUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEdgeId, validSelectedNodeIds, scriptId, removeMapEdge, pan, zoom, ideaMenuOpen, ideaNodePresets])

  // Reads pan/zoom from the refs (always current) rather than closing over
  // the state values directly, so this stays correct even when called from
  // the mousemove/mouseup effect below, whose own closure only refreshes
  // when scriptId changes.
  function screenToWorld(clientX, clientY) {
    const rect = canvasRef.current.getBoundingClientRect()
    return { x: (clientX - rect.left - panRef.current.x) / zoomRef.current, y: (clientY - rect.top - panRef.current.y) / zoomRef.current }
  }

  // Takes a multiplier (relative to the current zoom) rather than an
  // absolute value, and reads/writes zoomRef synchronously, so repeated
  // calls in the same tick (double-clicking a zoom button, or a fast
  // wheel-zoom burst) always compound against the latest value instead of
  // the tick's stale closured `zoom`.
  function zoomBy(clientX, clientY, factor) {
    const rect = canvasRef.current.getBoundingClientRect()
    const localX = clientX - rect.left
    const localY = clientY - rect.top
    const oldZoom = zoomRef.current
    const clamped = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, oldZoom * factor))
    setPan((p) => ({
      x: localX - ((localX - p.x) / oldZoom) * clamped,
      y: localY - ((localY - p.y) / oldZoom) * clamped
    }))
    zoomRef.current = clamped
    setZoom(clamped)
  }

  function zoomByCenter(factor) {
    const rect = canvasRef.current.getBoundingClientRect()
    zoomBy(rect.left + rect.width / 2, rect.top + rect.height / 2, factor)
  }

  // Fits every node on screen at once, centered — a single button that
  // recovers from "I panned/zoomed away and can't find my way back,"
  // rather than requiring a minimap just to reorient.
  function recenterView() {
    if (!canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const nodeList = Object.values(script.mapLayout.nodes)
    if (!nodeList.length) {
      zoomRef.current = 1
      setZoom(1)
      setPan({ x: rect.width / 2, y: rect.height / 2 })
      return
    }
    const minX = Math.min(...nodeList.map((n) => n.x))
    const minY = Math.min(...nodeList.map((n) => n.y))
    const maxX = Math.max(...nodeList.map((n) => n.x + NODE_WIDTH))
    const maxY = Math.max(...nodeList.map((n) => n.y + NODE_H))
    const padding = 60
    const fitZoom = Math.min((rect.width - padding * 2) / (maxX - minX), (rect.height - padding * 2) / (maxY - minY))
    const clamped = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, isFinite(fitZoom) && fitZoom > 0 ? fitZoom : 1))
    zoomRef.current = clamped
    setZoom(clamped)
    setPan({ x: rect.width / 2 - ((minX + maxX) / 2) * clamped, y: rect.height / 2 - ((minY + maxY) / 2) * clamped })
  }

  function handleWheel(e) {
    e.preventDefault()
    if (e.ctrlKey || e.metaKey) {
      zoomBy(e.clientX, e.clientY, e.deltaY < 0 ? 1.08 : 1 / 1.08)
    } else {
      setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }))
    }
  }

  function startPan(e) {
    dragRef.current = { type: 'pan', startX: e.clientX, startY: e.clientY, panStart: pan }
    if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing'
  }

  function handleCanvasMouseDown(e) {
    if (e.button === 1 || (e.button === 0 && spaceDownRef.current)) {
      e.preventDefault()
      startPan(e)
      return
    }
    if (e.button !== 0) return
    if (e.target.closest('.map-node') || e.target.closest('.map-edge-hit')) return
    // Same fix as the node-drag one above (see handleNodeMouseDown): a
    // rubber-band select drag starting on empty canvas is exactly the kind
    // of large, fast pointer sweep that triggers the browser's native
    // text-selection-drag if nothing suppresses it — and since this drag
    // can span the *entire* visible canvas, the result looks like
    // "everything" getting highlighted at once, not just one node's title.
    e.preventDefault()
    setSelectedEdgeId(null)
    const world = screenToWorld(e.clientX, e.clientY)
    dragRef.current = { type: 'select', startWorld: world, curWorld: world, shiftKey: e.shiftKey }
    if (!e.shiftKey) setSelectedNodeIds([])
  }

  function handleNodeMouseDown(e, sectionId) {
    if (e.button === 1 || spaceDownRef.current) return
    if (e.button !== 0) return
    const node = script.mapLayout.nodes[sectionId]
    if (!node) return
    // Without this, dragging a node (most noticeably a multi-node group,
    // where the pointer inevitably crosses over other nodes' text) lets the
    // browser's native text-selection-drag kick in at the same time as the
    // move — titles/summaries start highlighting instead of just the nodes
    // sliding. Titles are already double-click-to-edit, so a plain
    // mousedown-drag on a card is never meant to select its text anyway.
    e.preventDefault()
    const isPartOfSelection = validSelectedNodeIds.includes(sectionId) && validSelectedNodeIds.length > 1
    const groupIds = isPartOfSelection ? validSelectedNodeIds : [sectionId]
    const groupStart = {}
    groupIds.forEach((id) => {
      const n = script.mapLayout.nodes[id]
      if (n) groupStart[id] = { x: n.x, y: n.y }
    })
    dragRef.current = {
      type: 'node',
      sectionId,
      startX: e.clientX,
      startY: e.clientY,
      nodeStart: { x: node.x, y: node.y },
      groupIds,
      groupStart,
      moved: false,
      shiftKey: e.shiftKey
    }
  }

  function handleConnectorMouseDown(e, sectionId, side) {
    // A dot that already has a line attached disconnects it right away,
    // on mousedown — a plain click (no drag) then just removes it, and a
    // real drag continues on as a normal new-connection drag from the
    // now-empty point, letting the same pull-away motion either rewire it
    // to a different node or leave it disconnected if dropped on nothing.
    const touching = script.mapLayout.edges.filter((edge) => edge.from === sectionId || edge.to === sectionId)
    const edgeIdsHere = touching
      .filter((edge) => anchorSideForNode(edge, sectionId, script.mapLayout.nodes) === side)
      .map((edge) => edge.id)
    if (edgeIdsHere.length) removeMapEdgesByIds(scriptId, edgeIdsHere)
    const world = screenToWorld(e.clientX, e.clientY)
    dragRef.current = { type: 'connect', fromId: sectionId }
    setConnectPreview({ fromId: sectionId, x: world.x, y: world.y })
  }

  function handleNodeContextMenu(e, sectionId) {
    openContextMenu({ type: 'mapNode', scriptId, sectionId, selectedIds: validSelectedNodeIds, x: e.clientX, y: e.clientY })
  }

  useEffect(() => {
    function onMouseMove(e) {
      const d = dragRef.current
      if (!d) return
      if (d.type === 'pan') {
        setPan({ x: d.panStart.x + (e.clientX - d.startX), y: d.panStart.y + (e.clientY - d.startY) })
      } else if (d.type === 'node') {
        d.moved = true
        const dx = (e.clientX - d.startX) / zoom
        const dy = (e.clientY - d.startY) / zoom
        d.groupIds.forEach((id) => {
          const start = d.groupStart[id]
          if (start) setMapNodePosition(scriptId, id, start.x + dx, start.y + dy)
        })
      } else if (d.type === 'connect') {
        const world = screenToWorld(e.clientX, e.clientY)
        setConnectPreview({ fromId: d.fromId, x: world.x, y: world.y })
      } else if (d.type === 'select') {
        d.curWorld = screenToWorld(e.clientX, e.clientY)
        setSelectionBox({ x1: d.startWorld.x, y1: d.startWorld.y, x2: d.curWorld.x, y2: d.curWorld.y })
      }
    }
    function onMouseUp(e) {
      const d = dragRef.current
      if (d && d.type === 'connect') {
        const el = document.elementFromPoint(e.clientX, e.clientY)
        const targetCard = el && el.closest && el.closest('.map-node')
        if (targetCard && targetCard.dataset.sectionId && targetCard.dataset.sectionId !== d.fromId) {
          addMapEdge(scriptId, d.fromId, targetCard.dataset.sectionId)
        }
      } else if (d && d.type === 'node') {
        if (!d.moved) {
          if (d.shiftKey) {
            setSelectedNodeIds((prev) => (prev.includes(d.sectionId) ? prev.filter((id) => id !== d.sectionId) : [...prev, d.sectionId]))
          } else {
            setSelectedNodeIds([d.sectionId])
          }
        }
      } else if (d && d.type === 'select') {
        const x1 = Math.min(d.startWorld.x, d.curWorld.x)
        const y1 = Math.min(d.startWorld.y, d.curWorld.y)
        const x2 = Math.max(d.startWorld.x, d.curWorld.x)
        const y2 = Math.max(d.startWorld.y, d.curWorld.y)
        const cur = useStore.getState()
        const curScript = cur.scripts.find((sc) => sc.id === scriptId)
        const nodesNow = curScript ? curScript.mapLayout.nodes : {}
        const hitIds = Object.entries(nodesNow)
          .filter(([, n]) => n.x < x2 && n.x + NODE_WIDTH > x1 && n.y < y2 && n.y + NODE_H > y1)
          .map(([id]) => id)
        if (hitIds.length) {
          setSelectedNodeIds((prev) => (d.shiftKey ? Array.from(new Set([...prev, ...hitIds])) : hitIds))
        }
        setSelectionBox(null)
      }
      dragRef.current = null
      setConnectPreview(null)
      if (canvasRef.current) canvasRef.current.style.cursor = spaceDownRef.current ? 'grab' : ''
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
    // Deliberately NOT depending on script.mapLayout.nodes/edges — those
    // change reference on every setMapNodePosition call, which fires on
    // every mousemove while dragging a node. Depending on them here would
    // tear down and rebuild these window listeners on every single
    // mousemove during a drag, which is what made dragging feel like it
    // "wasn't following the mouse". Fresh node/edge data is read via
    // useStore.getState() inside the handlers instead, right where it's
    // actually needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, scriptId])

  function goToSection(sectionId) {
    toggleMapView()
    jumpToSection(scriptId, sectionId, false)
  }

  function handleAddSection() {
    if (!canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const world = screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2)
    addSectionFromMap(scriptId, world.x - NODE_WIDTH / 2, world.y - NODE_H / 2)
  }

  function handleAddIdeaNode(preset) {
    if (!canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const world = screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2)
    const opts = preset ? { title: preset.label, color: preset.color } : {}
    const newId = addIdeaNode(scriptId, world.x - NODE_WIDTH / 2, world.y - NODE_H / 2, opts)
    if (newId) setSelectedNodeIds([newId])
    setIdeaMenuOpen(false)
  }

  function handleAddChapterNode() {
    if (!canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const world = screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2)
    const newId = addChapterNode(scriptId, world.x - NODE_WIDTH / 2, world.y - NODE_H / 2)
    if (newId) setSelectedNodeIds([newId])
  }

  function handleAddInDirection(fromId, dir) {
    if (isIdeaNode(script.mapLayout.nodes[fromId])) {
      addConnectedIdeaNodeFromMap(scriptId, fromId, dir)
    } else {
      addConnectedSectionFromMap(scriptId, fromId, dir)
    }
  }

  const { order, litEdgeIds } = computeMainThread(script.mapLayout)
  const nodes = script.mapLayout.nodes

  return (
    <div className="main map-main">
      <div className="map-toolbar">
        <button className="icon-btn" onClick={handleAddSection} title={'Add section (' + keybinds.mapAddSection + ')'}>
          <Icon name="idea" size={13} /> Add section
        </button>
        <div className="map-idea-menu-wrap" style={{ position: 'relative' }}>
          <button
            className="icon-btn"
            onClick={() => {
              setIdeaMenuOpen((v) => !v)
              setPresetManagerOpen(false)
            }}
            title={'Add idea node (' + keybinds.mapAddIdeaNode + ')'}
          >
            <Icon name="note" size={13} /> Add idea node ▾
          </button>
          {ideaMenuOpen && (
            <div className="map-idea-menu">
              <div className="map-idea-menu-item" onClick={() => handleAddIdeaNode()}>
                <span className="map-idea-swatch" style={{ background: 'var(--ink-faint)' }} />
                Blank
              </div>
              {ideaNodePresets.map((preset) => (
                <div key={preset.id} className="map-idea-menu-item" onClick={() => handleAddIdeaNode(preset)}>
                  <span className="map-idea-swatch" style={{ background: preset.color }} />
                  {preset.label}
                </div>
              ))}
              <div
                className="map-idea-menu-item map-idea-menu-manage"
                onClick={() => {
                  setPresetManagerOpen(true)
                  setIdeaMenuOpen(false)
                }}
              >
                Manage presets…
              </div>
            </div>
          )}
          {presetManagerOpen && (
            <PresetManager
              presets={ideaNodePresets}
              onAdd={addIdeaNodePreset}
              onDelete={deleteIdeaNodePreset}
              onUpdate={updateIdeaNodePreset}
              onClose={() => setPresetManagerOpen(false)}
            />
          )}
        </div>
        <button className="icon-btn" onClick={handleAddChapterNode} title="Add a chapter node — a group header for the Outline tab">
          <Icon name="layers" size={13} /> Add chapter
        </button>
        <button
          className={'icon-btn' + (script.mapLayout.hideSummaries ? ' active' : '')}
          onClick={() => toggleMapHideSummaries(scriptId)}
          title={'Toggle summaries (' + keybinds.mapToggleSummaries + ')'}
        >
          <Icon name="eye" size={13} /> {script.mapLayout.hideSummaries ? 'Show summaries' : 'Hide summaries'}
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, border: '1px solid var(--line)', borderRadius: 6, flex: '0 0 auto' }}>
          <button className="icon-btn" style={{ border: 'none', padding: '7px 9px' }} onClick={() => zoomByCenter(1 / 1.2)}>&minus;</button>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-faint)', minWidth: 34, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
          <button className="icon-btn" style={{ border: 'none', padding: '7px 9px' }} onClick={() => zoomByCenter(1.2)}>+</button>
        </div>
        <button className="icon-btn" onClick={recenterView} title="Fit every node on screen, centered">
          <Icon name="focus" size={13} /> Recenter
        </button>
        <div className="map-hint">
          Drag to select · right-click for options · Ctrl+C/V to duplicate · click or pull a connected dot to disconnect it
        </div>
      </div>
      <div
        className="map-canvas"
        ref={canvasRef}
        onWheel={handleWheel}
        onMouseDown={handleCanvasMouseDown}
      >
        {script.sections.length === 0 && <div className="filter-empty">No sections yet.</div>}
        <div className="map-canvas-inner" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
          <svg className="map-edges-svg">
            <defs>
              <marker id="map-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill="var(--ink-faint)" />
              </marker>
              <marker id="map-arrow-lit" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill="var(--cyan)" />
              </marker>
            </defs>
            {script.mapLayout.edges.map((edge) => {
              const from = nodes[edge.from]
              const to = nodes[edge.to]
              if (!from || !to) return null
              const [sideA, sideB] = pickSides(from, to)
              const a = sideAnchor(from, sideA)
              const b = sideAnchor(to, sideB)
              const mx = (a.x + b.x) / 2
              const my = (a.y + b.y) / 2
              const lit = litEdgeIds.has(edge.id)
              const selected = selectedEdgeId === edge.id
              return (
                <g key={edge.id}>
                  <line
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    className={'map-edge-hit'}
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedEdgeId(edge.id)
                    }}
                  />
                  <line
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    className={'map-edge' + (lit ? ' is-lit' : '') + (selected ? ' is-selected' : '')}
                    markerEnd={lit ? 'url(#map-arrow-lit)' : 'url(#map-arrow)'}
                  />
                  {selected && (
                    <g className="map-edge-delete" onClick={(e) => { e.stopPropagation(); removeMapEdge(scriptId, edge.id); setSelectedEdgeId(null) }}>
                      <circle cx={mx} cy={my} r="9" />
                      <line x1={mx - 4} y1={my - 4} x2={mx + 4} y2={my + 4} />
                      <line x1={mx - 4} y1={my + 4} x2={mx + 4} y2={my - 4} />
                    </g>
                  )}
                </g>
              )
            })}
            {connectPreview &&
              nodes[connectPreview.fromId] &&
              (() => {
                const a = centerOf(nodes[connectPreview.fromId])
                return <line x1={a.x} y1={a.y} x2={connectPreview.x} y2={connectPreview.y} className="map-edge map-edge-preview" />
              })()}
            {selectionBox && (
              <rect
                className="map-selection-box"
                x={Math.min(selectionBox.x1, selectionBox.x2)}
                y={Math.min(selectionBox.y1, selectionBox.y2)}
                width={Math.abs(selectionBox.x2 - selectionBox.x1)}
                height={Math.abs(selectionBox.y2 - selectionBox.y1)}
              />
            )}
          </svg>
          {script.sections.map((sec) => {
            const node = nodes[sec.id]
            if (!node) return null
            const connectedSides = new Set(
              script.mapLayout.edges
                .filter((edge) => edge.from === sec.id || edge.to === sec.id)
                .map((edge) => anchorSideForNode(edge, sec.id, nodes))
                .filter(Boolean)
            )
            return (
              <MapNode
                key={sec.id}
                scriptId={scriptId}
                sec={sec}
                node={node}
                isMain={script.mapLayout.mainThreadId === sec.id}
                isLit={order.has(sec.id)}
                isSelected={validSelectedNodeIds.includes(sec.id)}
                order={order.get(sec.id)}
                hideSummaries={script.mapLayout.hideSummaries}
                threadEndDir={threadEndDirection(sec.id, nodes, script.mapLayout.edges)}
                connectedSides={connectedSides}
                onNodeMouseDown={handleNodeMouseDown}
                onConnectorMouseDown={handleConnectorMouseDown}
                onDoubleClick={goToSection}
                onAddInDirection={handleAddInDirection}
                onContextMenu={handleNodeContextMenu}
              />
            )
          })}
          {Object.entries(nodes)
            .filter(([, n]) => isIdeaNode(n))
            .map(([id, node]) => {
              const connectedSides = new Set(
                script.mapLayout.edges
                  .filter((edge) => edge.from === id || edge.to === id)
                  .map((edge) => anchorSideForNode(edge, id, nodes))
                  .filter(Boolean)
              )
              return (
                <IdeaNode
                  key={id}
                  scriptId={scriptId}
                  id={id}
                  node={node}
                  isLit={order.has(id)}
                  isSelected={validSelectedNodeIds.includes(id)}
                  hideSummaries={script.mapLayout.hideSummaries}
                  order={order.get(id)}
                  threadEndDir={threadEndDirection(id, nodes, script.mapLayout.edges)}
                  connectedSides={connectedSides}
                  onNodeMouseDown={handleNodeMouseDown}
                  onConnectorMouseDown={handleConnectorMouseDown}
                  onAddInDirection={handleAddInDirection}
                  onContextMenu={handleNodeContextMenu}
                />
              )
            })}
          {Object.entries(nodes)
            .filter(([, n]) => isChapterNode(n))
            .map(([id, node]) => {
              const connectedSides = new Set(
                script.mapLayout.edges
                  .filter((edge) => edge.from === id || edge.to === id)
                  .map((edge) => anchorSideForNode(edge, id, nodes))
                  .filter(Boolean)
              )
              return (
                <ChapterNode
                  key={id}
                  scriptId={scriptId}
                  id={id}
                  node={node}
                  isSelected={validSelectedNodeIds.includes(id)}
                  threadEndDir={threadEndDirection(id, nodes, script.mapLayout.edges)}
                  connectedSides={connectedSides}
                  onNodeMouseDown={handleNodeMouseDown}
                  onConnectorMouseDown={handleConnectorMouseDown}
                  onAddInDirection={handleAddInDirection}
                  onContextMenu={handleNodeContextMenu}
                />
              )
            })}
        </div>
      </div>
    </div>
  )
}

function PresetManager({ presets, onAdd, onDelete, onUpdate, onClose }) {
  const [label, setLabel] = useState('')
  const [color, setColor] = useState('#8a8d99')
  const ref = useRef(null)

  useEffect(() => {
    function onDocMouseDown(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [onClose])

  return (
    <div className="map-idea-menu map-preset-manager" ref={ref}>
      <div className="map-preset-manager-title">Idea node presets</div>
      {presets.map((p) => (
        <div key={p.id} className="map-idea-menu-item map-preset-row">
          <input
            type="color"
            className="map-preset-color-input"
            value={p.color}
            title="Change preset color"
            onChange={(e) => onUpdate(p.id, { color: e.target.value })}
          />
          <input
            className="map-preset-label-input"
            style={{ flex: 1 }}
            value={p.label}
            title="Rename preset"
            onChange={(e) => onUpdate(p.id, { label: e.target.value })}
          />
          <button className="map-preset-delete" onClick={() => onDelete(p.id)} title="Delete preset">
            <Icon name="x" size={11} />
          </button>
        </div>
      ))}
      <div className="map-preset-add">
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          title="Preset color"
        />
        <input
          className="map-preset-add-input"
          placeholder="New preset label…"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && label.trim()) {
              onAdd(label.trim(), color)
              setLabel('')
            }
          }}
        />
        <button
          className="icon-btn"
          style={{ padding: '5px 8px' }}
          disabled={!label.trim()}
          onClick={() => {
            if (!label.trim()) return
            onAdd(label.trim(), color)
            setLabel('')
          }}
        >
          Add
        </button>
      </div>
    </div>
  )
}
