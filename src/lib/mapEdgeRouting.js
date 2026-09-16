// Orthogonal ("elbow") connector routing for the mind map — a 2-bend
// right-angle path between two node anchor points, instead of a raw
// diagonal line. Deliberately only handles the parallel/opposite-exit
// case (`sideA`/`sideB` on the same axis) — MapView.jsx's own
// `pickSides()` only ever returns one of ['right','left'],
// ['left','right'], ['bottom','top'], ['top','bottom'], never a mixed
// pair, so that's the only case a real edge can ever need. If
// `pickSides` is ever changed to return a mixed pair, this needs a
// perpendicular-exit case added — it doesn't have one today.

const PAD = 40 // how far past the two nodes' own span a manual bend can be dragged

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v))
}

// `a`/`b` are anchor points (from sideAnchor()), `sideA`/`sideB` the
// sides they're on, `bendOffset` a signed pixel delta from the
// auto-centered bend (null/0 = centered). Returns the 4 route points
// (for building the path) and `handle`, the single point a drag grip
// should sit at — the midpoint of the route's middle segment, which is
// exactly what `bendOffset` moves.
export function routeElbow(a, sideA, b, sideB, bendOffset) {
  const axis = sideA === 'top' || sideA === 'bottom' ? 'y' : 'x'
  const offset = bendOffset || 0
  if (axis === 'x') {
    const lo = Math.min(a.x, b.x) - PAD
    const hi = Math.max(a.x, b.x) + PAD
    const bend = clamp((a.x + b.x) / 2 + offset, lo, hi)
    return {
      axis,
      points: [a, { x: bend, y: a.y }, { x: bend, y: b.y }, b],
      handle: { x: bend, y: (a.y + b.y) / 2 }
    }
  }
  const lo = Math.min(a.y, b.y) - PAD
  const hi = Math.max(a.y, b.y) + PAD
  const bend = clamp((a.y + b.y) / 2 + offset, lo, hi)
  return {
    axis,
    points: [a, { x: a.x, y: bend }, { x: b.x, y: bend }, b],
    handle: { x: (a.x + b.x) / 2, y: bend }
  }
}

function dist(p1, p2) {
  return Math.hypot(p2.x - p1.x, p2.y - p1.y)
}

// Moves `dist` px from `from` toward `to` — used to find where a
// corner's rounding should start/end along each adjacent segment.
function pointToward(from, to, d) {
  const total = dist(from, to)
  if (total === 0) return { x: from.x, y: from.y }
  const t = d / total
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }
}

// Builds an SVG path `d` string through `points`, rounding each
// interior corner with a small quadratic-bezier — clamped per corner to
// half of *each* adjacent segment's own length independently, since one
// leg of an elbow can be much shorter than the other (routine once two
// nodes are close together or overlapping).
export function pathFromPoints(points, radius = 7) {
  if (points.length < 2) return ''
  if (points.length === 2) {
    return `M${points[0].x},${points[0].y} L${points[1].x},${points[1].y}`
  }
  let d = `M${points[0].x},${points[0].y}`
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1]
    const cur = points[i]
    const next = points[i + 1]
    const r = Math.min(radius, dist(prev, cur) / 2, dist(cur, next) / 2)
    const p1 = pointToward(cur, prev, r)
    const p2 = pointToward(cur, next, r)
    d += ` L${p1.x},${p1.y} Q${cur.x},${cur.y} ${p2.x},${p2.y}`
  }
  const last = points[points.length - 1]
  d += ` L${last.x},${last.y}`
  return d
}
