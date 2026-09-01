import React, { useState } from 'react'
import { useStore } from '../../state/store.js'
import Icon from '../icons.jsx'

export const NODE_WIDTH = 220

const CONNECTOR_SIDES = ['top', 'right', 'bottom', 'left']

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
  connectedSides,
  threadEndDir,
  onNodeMouseDown,
  onConnectorMouseDown,
  onAddInDirection,
  onContextMenu
}) {
  const pushUndo = useStore((s) => s.pushUndo)
  const setIdeaNodeTitle = useStore((s) => s.setIdeaNodeTitle)
  const commitIdeaNodeTitle = useStore((s) => s.commitIdeaNodeTitle)
  const setIdeaNodeText = useStore((s) => s.setIdeaNodeText)
  const commitIdeaNodeText = useStore((s) => s.commitIdeaNodeText)
  const setIdeaNodeColor = useStore((s) => s.setIdeaNodeColor)
  const deleteIdeaNodes = useStore((s) => s.deleteIdeaNodes)

  const [editingTitle, setEditingTitle] = useState(false)

  const color = node.color || 'var(--ink-faint)'

  return (
    <div
      className={'map-node idea-node' + (isLit ? ' is-lit' : '') + (isSelected ? ' is-selected' : '')}
      data-section-id={id}
      style={{ left: node.x, top: node.y, width: NODE_WIDTH, borderLeftColor: color }}
      onMouseDown={(e) => onNodeMouseDown(e, id)}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onContextMenu(e, id)
      }}
    >
      {order != null && <span className="map-node-order">{order}</span>}
      <div className="map-node-head idea-node-head">
        {editingTitle ? (
          <input
            className="idea-node-title"
            style={{ color }}
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
            style={{ color: node.title ? color : 'var(--ink-faint)' }}
            onMouseDown={(e) => e.detail > 1 && e.stopPropagation()}
            onDoubleClick={(e) => {
              e.stopPropagation()
              setEditingTitle(true)
            }}
          >
            {node.title || 'Title…'}
          </span>
        )}
        <input
          type="color"
          className="idea-node-color-input"
          value={node.color || '#8a8d99'}
          title="Node color"
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => setIdeaNodeColor(scriptId, id, e.target.value)}
        />
        <button
          className="idea-node-delete"
          title="Delete this node"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => deleteIdeaNodes(scriptId, [id])}
        >
          <Icon name="x" size={11} />
        </button>
      </div>
      <textarea
        className="idea-node-text"
        placeholder="Write the idea…"
        value={node.text}
        onMouseDown={(e) => e.stopPropagation()}
        onFocus={() => pushUndo(scriptId)}
        onChange={(e) => setIdeaNodeText(scriptId, id, e.target.value)}
        onBlur={() => commitIdeaNodeText(scriptId)}
      />
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
