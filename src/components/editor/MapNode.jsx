import React, { useState } from 'react'
import { useStore } from '../../state/store.js'
import Icon from '../icons.jsx'

export const NODE_WIDTH = 220

const CONNECTOR_SIDES = ['top', 'right', 'bottom', 'left']

export default function MapNode({
  scriptId,
  sec,
  node,
  isMain,
  isLit,
  isSelected,
  order,
  hideSummaries,
  threadEndDir,
  connectedSides,
  onNodeMouseDown,
  onConnectorMouseDown,
  onDoubleClick,
  onAddInDirection,
  onContextMenu
}) {
  const pushUndo = useStore((s) => s.pushUndo)
  const setSectionHeading = useStore((s) => s.setSectionHeading)
  const commitSectionHeading = useStore((s) => s.commitSectionHeading)
  const setSectionBeatSummary = useStore((s) => s.setSectionBeatSummary)
  const commitSectionBeatSummary = useStore((s) => s.commitSectionBeatSummary)
  const openSectionTab = useStore((s) => s.openSectionTab)
  const toggleMapView = useStore((s) => s.toggleMapView)
  const setMapMainThread = useStore((s) => s.setMapMainThread)
  const toggleMapNodeCollapsed = useStore((s) => s.toggleMapNodeCollapsed)

  const [editingHeading, setEditingHeading] = useState(false)

  const showSummary = !hideSummaries && !node.collapsed

  return (
    <div
      className={'map-node' + (isMain ? ' is-main' : '') + (isLit ? ' is-lit' : '') + (isSelected ? ' is-selected' : '')}
      data-section-id={sec.id}
      style={{ left: node.x, top: node.y, width: NODE_WIDTH }}
      onMouseDown={(e) => onNodeMouseDown(e, sec.id)}
      onDoubleClick={() => onDoubleClick(sec.id)}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onContextMenu(e, sec.id)
      }}
    >
      {order != null && <span className="map-node-order">{order}</span>}
      <div className="map-node-head">
        {editingHeading ? (
          <input
            className="map-node-heading-input"
            style={sec.titleColor ? { color: sec.titleColor } : undefined}
            value={sec.heading}
            autoFocus
            onFocus={(e) => {
              pushUndo(scriptId)
              e.target.select()
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setSectionHeading(scriptId, sec.id, e.target.value)}
            onBlur={() => {
              commitSectionHeading(scriptId, sec.id)
              setEditingHeading(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Escape') e.target.blur()
            }}
          />
        ) : (
          <span
            className="map-node-heading"
            style={sec.titleColor ? { color: sec.titleColor } : undefined}
            onMouseDown={(e) => e.detail > 1 && e.stopPropagation()}
            onDoubleClick={(e) => {
              e.stopPropagation()
              setEditingHeading(true)
            }}
          >
            {sec.heading.toUpperCase() || 'UNTITLED'}
          </span>
        )}
        {sec.done && <Icon name="check" size={11} className="map-node-done" />}
      </div>
      {showSummary && (
        <textarea
          className="map-node-summary"
          placeholder="One-line summary for this beat…"
          value={sec.beatSummary}
          onMouseDown={(e) => e.stopPropagation()}
          onFocus={() => pushUndo(scriptId)}
          onChange={(e) => setSectionBeatSummary(scriptId, sec.id, e.target.value)}
          onBlur={() => commitSectionBeatSummary(scriptId, sec.id)}
        />
      )}
      <div className="map-node-btns">
        <button
          className={'map-node-btn' + (isMain ? ' active' : '')}
          title={isMain ? 'Unset as the main thread start' : 'Set as the main thread start'}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => setMapMainThread(scriptId, sec.id)}
        >
          <Icon name="bookmark" size={12} filled={isMain} />
        </button>
        <button
          className="map-node-btn"
          title="Open this section in its own tab"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => {
            toggleMapView()
            openSectionTab(scriptId, sec.id)
          }}
        >
          <Icon name="tabopen" size={12} />
        </button>
        {!hideSummaries && (
          <button
            className={'map-node-btn' + (node.collapsed ? ' active' : '')}
            title={node.collapsed ? 'Show this summary' : 'Hide just this summary'}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => toggleMapNodeCollapsed(scriptId, sec.id)}
          >
            <Icon name="eye" size={12} />
          </button>
        )}
      </div>
      {CONNECTOR_SIDES.map((side) => {
        const connected = connectedSides.has(side)
        return (
          <div
            key={side}
            className={'map-node-connector side-' + side + (connected ? ' is-connected' : '')}
            title={connected ? 'Click, or drag away, to disconnect' : 'Drag to another section to connect a plot thread'}
            onMouseDown={(e) => {
              e.stopPropagation()
              onConnectorMouseDown(e, sec.id, side)
            }}
          />
        )
      })}
      {threadEndDir && (
        <button
          className={'map-node-extend side-' + threadEndDir}
          title="Continue this thread with a new connected section"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            onAddInDirection(sec.id, threadEndDir)
          }}
        >
          +
        </button>
      )}
    </div>
  )
}
