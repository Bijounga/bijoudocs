import React, { useEffect, useRef, useState } from 'react'
import { useStore } from '../../state/store.js'
import Icon from '../icons.jsx'
import ShapePicker from './ShapePicker.jsx'

export const NODE_WIDTH = 220

const CONNECTOR_SIDES = ['top', 'right', 'bottom', 'left']

// Only used to pre-fill a fill-color <input> the first time it's opened
// on a node that's never had one set — a native color input needs a real
// #rrggbb value, it can't display "whatever the theme says." Actual
// rendering never calls this: the CSS itself falls back to
// var(--panel-2) directly, so it keeps tracking the live theme even for
// a node whose color was never touched.
function themeBgColor() {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--panel-2').trim()
  return v || '#ffffff'
}

// A freeform note on the map, not tied to any real section — same
// position/connector/edge machinery as MapNode, its own title+text+color
// instead of a section's heading+beatSummary.
export default function IdeaNode({
  scriptId,
  id,
  node,
  isSelected,
  isLit,
  order,
  hideSummaries,
  connectedSides,
  threadEndDir,
  onNodeMouseDown,
  onConnectorMouseDown,
  onAddInDirection,
  onContextMenu,
  onResizeMouseDown
}) {
  const pushUndo = useStore((s) => s.pushUndo)
  const setIdeaNodeTitle = useStore((s) => s.setIdeaNodeTitle)
  const commitIdeaNodeTitle = useStore((s) => s.commitIdeaNodeTitle)
  const setIdeaNodeText = useStore((s) => s.setIdeaNodeText)
  const commitIdeaNodeText = useStore((s) => s.commitIdeaNodeText)
  const setIdeaNodeColor = useStore((s) => s.setIdeaNodeColor)
  const setIdeaNodeBgColor = useStore((s) => s.setIdeaNodeBgColor)
  const setIdeaNodeShape = useStore((s) => s.setIdeaNodeShape)
  const syncIdeaNodeMeasuredSize = useStore((s) => s.syncIdeaNodeMeasuredSize)
  const toggleIdeaNodeTitleBold = useStore((s) => s.toggleIdeaNodeTitleBold)
  const toggleMapNodeCollapsed = useStore((s) => s.toggleMapNodeCollapsed)
  const deleteIdeaNodes = useStore((s) => s.deleteIdeaNodes)

  const [editingTitle, setEditingTitle] = useState(false)
  const shapeRef = useRef(null)

  const color = node.color || 'var(--ink-faint)'
  const shape = node.shape || 'rectangle'
  // Diamond/parallelogram are a completely different, simpler node —
  // no title, no header row, just one auto-sizing text area clipped
  // into the shape. Three earlier attempts (v0.5.43-v0.5.49) all tried
  // to fit the *existing* title+header+body idea-node layout into or
  // alongside a diamond/parallelogram outline and kept breaking in a
  // new way each time — the real problem was always that a header full
  // of small controls plus a variable amount of body text has no aspect
  // ratio that reads as "diamond" or "parallelogram." Dropping the
  // title and header entirely for these two shapes (matching a real
  // flowchart's decision/input nodes, which are label-only) sidesteps
  // the whole category of problem rather than patching it again.
  const isSimpleShape = shape === 'diamond' || shape === 'parallelogram'
  // `font-weight` alone silently no-ops on a monospace stack that falls
  // back to a static, single-weight font (confirmed: 400 vs 800 rendered
  // at the exact same pixel width here) — `-webkit-text-stroke` thickens
  // the glyphs at the rendering layer instead, so "bold" stays visible
  // regardless of which font in the stack actually loaded.
  const titleBoldStyle = node.titleBold ? { fontWeight: 800, WebkitTextStroke: '0.5px currentColor' } : { fontWeight: 600 }
  const showText = !hideSummaries && !node.collapsed

  // Keeps node.width/height in sync with the shape's real, content-
  // driven rendered size — MapView.jsx's connector-anchor math
  // (sideAnchor/pickSides) needs an accurate size for these nodes
  // instead of the fixed NODE_WIDTH/NODE_H every other node type uses.
  // borderBoxSize is already in local (untransformed-by-the-canvas'-own-
  // zoom) layout units, same coordinate space as node.x/y, so this
  // needs no zoom conversion — only a mouse-drag delta does (see
  // MapView's handleResizeMouseDown). Deliberately not undo-tracked or
  // saved to disk (see syncIdeaNodeMeasuredSize's own comment) — purely
  // a passive rendering-accuracy cache that re-derives itself on load.
  useEffect(() => {
    if (!isSimpleShape || !shapeRef.current) return
    const el = shapeRef.current
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const box = entry.borderBoxSize && entry.borderBoxSize[0]
      const width = box ? box.inlineSize : entry.contentRect.width
      const height = box ? box.blockSize : entry.contentRect.height
      syncIdeaNodeMeasuredSize(scriptId, id, Math.round(width), Math.round(height))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [isSimpleShape, scriptId, id, syncIdeaNodeMeasuredSize])

  return (
    <div
      className={
        'map-node idea-node' +
        (isLit ? ' is-lit' : '') +
        (isSelected ? ' is-selected' : '') +
        (node.struck ? ' struck' : '') +
        (isSimpleShape ? ' idea-node-simple' : '')
      }
      data-section-id={id}
      style={{ left: node.x, top: node.y, width: isSimpleShape ? undefined : NODE_WIDTH }}
      onMouseDown={(e) => onNodeMouseDown(e, id)}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onContextMenu(e, id)
      }}
    >
      {order != null && <span className="map-node-order">{order}</span>}
      {isSimpleShape ? (
        <>
          {/* Floating, hover/selection-revealed controls — a sibling of
              the clipped shape below, not a descendant of it, so they
              can never be clipped or covered by anything happening
              inside the shape (the exact two failure modes every prior
              header-inside-the-shape attempt hit). */}
          <div className="idea-node-simple-controls" onMouseDown={(e) => e.stopPropagation()}>
            <ShapePicker value={shape} onChange={(s) => setIdeaNodeShape(scriptId, id, s)} />
            <input
              type="color"
              className="idea-node-color-input"
              value={node.color || '#8a8d99'}
              title="Accent color"
              onFocus={() => pushUndo(scriptId)}
              onChange={(e) => setIdeaNodeColor(scriptId, id, e.target.value)}
            />
            {node.color && (
              <button
                className="idea-node-color-reset"
                title="Reset accent color to default"
                onClick={() => {
                  pushUndo(scriptId)
                  setIdeaNodeColor(scriptId, id, null)
                }}
              >
                <Icon name="noColor" size={11} />
              </button>
            )}
            <input
              type="color"
              className="idea-node-bgcolor-input"
              value={node.bgColor || themeBgColor()}
              title="Fill color"
              onFocus={() => pushUndo(scriptId)}
              onChange={(e) => setIdeaNodeBgColor(scriptId, id, e.target.value)}
            />
            {node.bgColor && (
              <button
                className="idea-node-color-reset"
                title="Reset fill color to default"
                onClick={() => {
                  pushUndo(scriptId)
                  setIdeaNodeBgColor(scriptId, id, null)
                }}
              >
                <Icon name="noColor" size={11} />
              </button>
            )}
            <button className="idea-node-delete" title="Delete this node" onClick={() => deleteIdeaNodes(scriptId, [id])}>
              <Icon name="x" size={11} />
            </button>
          </div>
          <div
            ref={shapeRef}
            className={'idea-node-simple-shape shape-' + shape}
            style={{
              '--node-shape-color': color,
              '--node-bg-color': node.bgColor || undefined,
              minWidth: node.manualWidth || undefined,
              minHeight: node.manualHeight || undefined
            }}
          >
            <div className="idea-node-simple-text-scroll">
              <textarea
                className="idea-node-simple-text"
                placeholder="Type…"
                value={node.text}
                onMouseDown={(e) => e.stopPropagation()}
                onFocus={() => pushUndo(scriptId)}
                onChange={(e) => setIdeaNodeText(scriptId, id, e.target.value)}
                onBlur={() => commitIdeaNodeText(scriptId)}
              />
            </div>
          </div>
          {isSelected && (
            <div
              className="idea-node-resize-handle"
              title="Drag to resize"
              onMouseDown={(e) => {
                e.stopPropagation()
                onResizeMouseDown(e, id, node.width || 140, node.height || 90)
              }}
            />
          )}
        </>
      ) : (
        <div
          className={'idea-node-shape-inner shape-' + shape}
          style={{ '--node-shape-color': color, '--node-bg-color': node.bgColor || undefined }}
        >
          <div className="map-node-head idea-node-head">
            {editingTitle ? (
              <input
                className="idea-node-title"
                style={{ color, ...titleBoldStyle }}
                placeholder="Title…"
                value={node.title}
                autoFocus
                onFocus={(e) => {
                  pushUndo(scriptId)
                  e.target.select()
                }}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setIdeaNodeTitle(scriptId, id, e.target.value)}
                onBlur={() => {
                  commitIdeaNodeTitle(scriptId)
                  setEditingTitle(false)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === 'Escape') e.target.blur()
                }}
              />
            ) : (
              <span
                className="idea-node-title idea-node-title-display"
                style={{ color: node.title ? color : 'var(--ink-faint)', ...titleBoldStyle }}
                onMouseDown={(e) => e.detail > 1 && e.stopPropagation()}
                onDoubleClick={(e) => {
                  e.stopPropagation()
                  setEditingTitle(true)
                }}
              >
                {node.title || 'Title…'}
              </span>
            )}
            <button
              className={'idea-node-bold' + (node.titleBold ? ' active' : '')}
              title={node.titleBold ? 'Unbold title' : 'Bold title'}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => toggleIdeaNodeTitleBold(scriptId, id)}
            >
              B
            </button>
            <ShapePicker value={shape} onChange={(s) => setIdeaNodeShape(scriptId, id, s)} className="idea-node-shape-picker" />
            <input
              type="color"
              className="idea-node-color-input"
              value={node.color || '#8a8d99'}
              title="Accent color (title text, border)"
              onMouseDown={(e) => e.stopPropagation()}
              onFocus={() => pushUndo(scriptId)}
              onChange={(e) => setIdeaNodeColor(scriptId, id, e.target.value)}
            />
            {node.color && (
              <button
                className="idea-node-color-reset"
                title="Reset accent color to default"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => {
                  pushUndo(scriptId)
                  setIdeaNodeColor(scriptId, id, null)
                }}
              >
                <Icon name="noColor" size={11} />
              </button>
            )}
            <input
              type="color"
              className="idea-node-bgcolor-input"
              value={node.bgColor || themeBgColor()}
              title="Fill color"
              onMouseDown={(e) => e.stopPropagation()}
              onFocus={() => pushUndo(scriptId)}
              onChange={(e) => setIdeaNodeBgColor(scriptId, id, e.target.value)}
            />
            {node.bgColor && (
              <button
                className="idea-node-color-reset"
                title="Reset fill color to default"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => {
                  pushUndo(scriptId)
                  setIdeaNodeBgColor(scriptId, id, null)
                }}
              >
                <Icon name="noColor" size={11} />
              </button>
            )}
            <button
              className="idea-node-delete"
              title="Delete this node"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => deleteIdeaNodes(scriptId, [id])}
            >
              <Icon name="x" size={11} />
            </button>
          </div>
          {showText && (
            <textarea
              className="idea-node-text"
              placeholder="Write the idea…"
              value={node.text}
              onMouseDown={(e) => e.stopPropagation()}
              onFocus={() => pushUndo(scriptId)}
              onChange={(e) => setIdeaNodeText(scriptId, id, e.target.value)}
              onBlur={() => commitIdeaNodeText(scriptId)}
            />
          )}
          {!hideSummaries && (
            <div className="map-node-btns idea-node-btns">
              <button
                className={'map-node-btn' + (node.collapsed ? ' active' : '')}
                title={node.collapsed ? 'Show this node’s text' : 'Hide just this node’s text'}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => toggleMapNodeCollapsed(scriptId, id)}
              >
                <Icon name="eye" size={12} />
              </button>
            </div>
          )}
        </div>
      )}
      {CONNECTOR_SIDES.map((side) => {
        const connected = connectedSides.has(side)
        return (
          <div
            key={side}
            className={'map-node-connector side-' + side + (connected ? ' is-connected' : '')}
            title={connected ? 'Click, or drag away, to disconnect' : 'Drag to another node to connect'}
            onMouseDown={(e) => {
              e.stopPropagation()
              onConnectorMouseDown(e, id, side)
            }}
          />
        )
      })}
      {threadEndDir && (
        <button
          className={'map-node-extend side-' + threadEndDir}
          title="Continue this thread with a new connected idea node"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            onAddInDirection(id, threadEndDir)
          }}
        >
          +
        </button>
      )}
    </div>
  )
}
