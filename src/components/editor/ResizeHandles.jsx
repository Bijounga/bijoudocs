import React from 'react'

const EDGES = ['top', 'right', 'bottom', 'left']
const AXIS_FOR_EDGE = { top: 'y', bottom: 'y', left: 'x', right: 'x' }

// One set of 4 invisible-until-hover strips running each edge of a map
// node, shared by every node type (section/idea rectangle+pill/idea
// diamond+parallelogram/chapter) — replaces the single corner-only
// handle idea nodes used to have. Rendered *before* the connector dots
// in each node's own JSX (see e.g. IdeaNode.jsx), not after, so the
// dots — which sit at each edge's exact midpoint — paint on top and
// stay independently grabbable for making connections; grabbing
// anywhere else along that same edge resizes instead.
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
    </>
  )
}
