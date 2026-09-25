import React from 'react'

const EDGES = ['top', 'right', 'bottom', 'left']
const AXIS_FOR_EDGE = { top: 'y', bottom: 'y', left: 'x', right: 'x' }
const CORNERS = ['top-left', 'top-right', 'bottom-right', 'bottom-left']

// One set of 4 invisible-until-hover edge strips plus 4 small corner
// squares, shared by every map node type (section/idea rectangle+pill/
// idea diamond+parallelogram/chapter) — replaces the single corner-only
// handle idea nodes used to have. Edges are rendered *before* the
// connector dots in each node's own JSX (see e.g. IdeaNode.jsx), not
// after, so the dots — which sit at each edge's exact midpoint — paint
// on top and stay independently grabbable for making connections;
// grabbing anywhere else along that same edge resizes instead. Corners
// sit at a different spot entirely (no connector ever lives there), so
// they need no such ordering care — they resize both dimensions at
// once ('both'), same as the old single handle did.
export default function ResizeHandles({ onResizeMouseDown }) {
  return (
    <>
      {EDGES.map((edge) => (
        <div
          key={edge}
          className={'map-node-resize-edge side-' + edge}
          onMouseDown={(e) => onResizeMouseDown(e, AXIS_FOR_EDGE[edge])}
        />
      ))}
      {CORNERS.map((corner) => (
        <div
          key={corner}
          className={'map-node-resize-corner corner-' + corner}
          onMouseDown={(e) => onResizeMouseDown(e, 'both')}
        />
      ))}
    </>
  )
}
