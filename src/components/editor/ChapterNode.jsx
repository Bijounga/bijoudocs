import React, { useState } from 'react'
import { useStore } from '../../state/store.js'
import Icon from '../icons.jsx'

export const NODE_WIDTH = 220

const CONNECTOR_SIDES = ['top', 'right', 'bottom', 'left']

// A group header for the Outline tab, not a real section — a label + a
// number (e.g. "The Desert" #1). Deliberately NOT required to connect to
// other chapter nodes; a second "The Desert" #2 can sit anywhere else on
// the map, unconnected to the first. Everything a chapter node IS
// connected to (via the normal edge mechanism) becomes its members, in
// flattenMapOrder's own connectivity order — see lib/mapGraph.js.
export default function ChapterNode({
  scriptId,
  id,
  node,
  isSelected,
  connectedSides,
  threadEndDir,
  onNodeMouseDown,
  onConnectorMouseDown,
  onAddInDirection,
  onContextMenu
}) {
  const pushUndo = useStore((s) => s.pushUndo)
  const setChapterNodeLabel = useStore((s) => s.setChapterNodeLabel)
  const commitChapterNodeLabel = useStore((s) => s.commitChapterNodeLabel)
  const setChapterNodeNumber = useStore((s) => s.setChapterNodeNumber)
  const deleteIdeaNodes = useStore((s) => s.deleteIdeaNodes)

  const [editingLabel, setEditingLabel] = useState(false)

  return (
    <div
      className={'map-node chapter-node' + (isSelected ? ' is-selected' : '')}
      data-section-id={id}
      style={{ left: node.x, top: node.y, width: NODE_WIDTH }}
      onMouseDown={(e) => onNodeMouseDown(e, id)}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onContextMenu(e, id)
      }}
    >
      <div className="map-node-head chapter-node-head">
        {editingLabel ? (
          <input
            className="chapter-node-label"
            placeholder="Chapter name…"
            value={node.label}
            autoFocus
            onFocus={(e) => {
              pushUndo(scriptId)
              e.target.select()
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setChapterNodeLabel(scriptId, id, e.target.value)}
            onBlur={() => {
              commitChapterNodeLabel(scriptId)
              setEditingLabel(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Escape') e.target.blur()
            }}
          />
        ) : (
          <span
            className="chapter-node-label chapter-node-label-display"
            onMouseDown={(e) => e.detail > 1 && e.stopPropagation()}
            onDoubleClick={(e) => {
              e.stopPropagation()
              setEditingLabel(true)
            }}
          >
            {node.label || 'Chapter name…'}
          </span>
        )}
        <input
          type="number"
          className="chapter-node-number"
          value={node.number}
          title="Order among other chapters sharing this name"
          onMouseDown={(e) => e.stopPropagation()}
          onFocus={() => pushUndo(scriptId)}
          onChange={(e) => setChapterNodeNumber(scriptId, id, parseInt(e.target.value, 10) || 0)}
        />
        <button
          className="idea-node-delete"
          title="Delete this chapter node"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => deleteIdeaNodes(scriptId, [id])}
        >
          <Icon name="x" size={11} />
        </button>
      </div>
      {CONNECTOR_SIDES.map((side) => {
        const connected = connectedSides.has(side)
        return (
          <div
            key={side}
            className={'map-node-connector side-' + side + (connected ? ' is-connected' : '')}
            title={connected ? 'Click, or drag away, to disconnect' : 'Drag to another node to connect its members'}
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
          title="Continue this chapter with a new connected section"
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
