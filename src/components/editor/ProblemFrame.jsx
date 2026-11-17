import React from 'react'
import { useStore } from '../../state/store.js'
import Icon from '../icons.jsx'
import ResizeHandles from './ResizeHandles.jsx'

export const FRAME_W = 420
export const FRAME_H = 300
// A folded frame is one small card.
export const FOLD_W = 300
export const FOLD_H = 92

// A problem: a labelled space drawn around idea nodes, so the whole story stays on
// the map and you can see what belongs to which problem. What sits inside is
// worked out from where nodes are (syncFramesIn in the store), so dragging a node
// in or out re-files it; adding next to a node inside (Tab, the + on a node, or the
// button at the bottom) grows the frame. You can grab it by its bar or its edges
// (the middle lets clicks through), fold it into one card (and back), focus on it
// (dims everything else), or tell it as one line in the Outline.
function ProblemFrame({
  scriptId,
  id,
  node,
  depth,
  isSelected,
  isFocused,
  insideCount,
  wayOut,
  onNodeMouseDown,
  onContextMenu,
  onResizeMouseDown,
  onFocus,
  onFold,
  onAddInside
}) {
  const pushUndo = useStore((s) => s.pushUndo)
  const setProblemField = useStore((s) => s.setProblemField)
  const commitProblemField = useStore((s) => s.commitProblemField)
  const toggleProblemCompress = useStore((s) => s.toggleProblemCompress)
  const deleteIdeaNodes = useStore((s) => s.deleteIdeaNodes)

  const folded = !!node.folded
  const w = folded ? FOLD_W : node.manualWidth || FRAME_W
  const h = folded ? FOLD_H : node.manualHeight || FRAME_H

  function confirmDelete() {
    const msg = insideCount ? 'Remove this problem frame? The ' + insideCount + ' node' + (insideCount === 1 ? '' : 's') + ' inside it stay on the map.' : 'Remove this problem frame?'
    if (window.confirm(msg)) deleteIdeaNodes(scriptId, [id])
  }

  const grab = {
    onMouseDown: (e) => onNodeMouseDown(e, id),
    onDoubleClick: (e) => {
      if (e.target.closest('input, textarea, button')) return
      onFold(id)
    },
    onContextMenu: (e) => {
      e.preventDefault()
      e.stopPropagation()
      onContextMenu(e, id)
    }
  }

  const label = (
    <input
      className="problem-frame-label"
      placeholder="Name this problem…"
      value={node.label || ''}
      onMouseDown={(e) => e.stopPropagation()}
      onFocus={() => pushUndo(scriptId)}
      onChange={(e) => setProblemField(scriptId, id, 'label', e.target.value)}
      onBlur={() => commitProblemField(scriptId)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === 'Escape') e.target.blur()
      }}
    />
  )
  const exitChip = (
    <span className={'problem-frame-exit' + (wayOut ? '' : ' none')} title={wayOut ? 'The way out: ' + wayOut : 'Select a node inside and press Ctrl+Alt+G to mark how this ends'}>
      <Icon name="flag" size={11} />
      <span className="problem-frame-exit-text">{wayOut ? wayOut : 'no way out yet'}</span>
    </span>
  )
  const btn = (title, icon, onClick, active, extra) => (
    <button className={'problem-frame-btn' + (active ? ' active' : '') + (extra || '')} title={title} onMouseDown={(e) => e.stopPropagation()} onClick={onClick}>
      {icon}
    </button>
  )

  if (folded) {
    return (
      <div
        className={'problem-frame is-folded' + (isSelected ? ' is-selected' : '') + (isFocused ? ' is-focused' : '')}
        data-section-id={id}
        data-depth={depth % 3}
        style={{ left: node.x, top: node.y, width: w, height: h }}
      >
        <div className="problem-frame-head problem-fold-card" {...grab}>
          <div className="problem-fold-row">
            <span className="problem-frame-icon">
              <Icon name="problem" size={14} />
            </span>
            {label}
            {btn('Open it up again (double-click the card)', <Icon name="expand" size={12} />, () => onFold(id), false, ' primary')}
            {btn('Remove this frame (the nodes inside stay)', <Icon name="x" size={11} />, confirmDelete, false, ' danger')}
          </div>
          <div className="problem-fold-meta">
            {insideCount} {insideCount === 1 ? 'node' : 'nodes'} folded away
          </div>
          {exitChip}
        </div>
      </div>
    )
  }

  return (
    <div
      className={'problem-frame' + (isSelected ? ' is-selected' : '') + (isFocused ? ' is-focused' : '') + (node.struck ? ' struck' : '')}
      data-section-id={id}
      data-depth={depth % 3}
      style={{ left: node.x, top: node.y, width: w, height: h }}
    >
      <div className="problem-frame-grip side-left" {...grab} />
      <div className="problem-frame-grip side-right" {...grab} />
      <div className="problem-frame-grip side-bottom" {...grab} />
      <div className="problem-frame-head" {...grab}>
        <span className="problem-frame-icon">
          <Icon name="problem" size={14} />
        </span>
        {label}
        {exitChip}
        {btn('Fold into one card — double-click the bar does too', <Icon name="collapse" size={12} />, () => onFold(id))}
        {btn(
          node.compress ? 'Told as one line in the Outline — click to list everything inside' : 'Tell it as one line in the Outline instead of listing everything inside',
          <>
            <span className="problem-frame-btn-text">1 line</span>
            <span className="problem-frame-btn-icon">
              <Icon name="menu" size={12} />
            </span>
          </>,
          () => toggleProblemCompress(scriptId, id),
          node.compress
        )}
        {btn(isFocused ? 'Showing everything again (Esc)' : 'Focus on this problem — dims everything else (Enter)', <Icon name="target" size={12} />, () => onFocus(isFocused ? null : id), isFocused)}
        {btn('Remove this frame (the nodes inside stay)', <Icon name="x" size={11} />, confirmDelete, false, ' danger')}
      </div>
      {node.compress && (
        <input
          className="problem-frame-summary"
          placeholder="The one line for the script…"
          value={node.summary || ''}
          onMouseDown={(e) => e.stopPropagation()}
          onFocus={() => pushUndo(scriptId)}
          onChange={(e) => setProblemField(scriptId, id, 'summary', e.target.value)}
          onBlur={() => commitProblemField(scriptId)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'Escape') e.target.blur()
          }}
        />
      )}
      <button className="problem-frame-add" title="Add a node to this problem (after the last one)" onMouseDown={(e) => e.stopPropagation()} onClick={() => onAddInside(id)}>
        + Add to this problem
      </button>
      {isSelected && <ResizeHandles onResizeMouseDown={(e, axis) => onResizeMouseDown(e, id, w, h, axis)} />}
    </div>
  )
}

// Props are stable while nothing about the frame changed, so panning and zooming the map skip it.
export default React.memo(ProblemFrame)
