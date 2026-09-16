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
const OBSTACLE_MARGIN = 14 // clearance kept between a re-routed trunk and the node it's avoiding

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v))
}

// Finds the point closest to `desired` (clamped to [lo,hi]) that isn't
// inside any of `forbidden` (an array of [start,end] ranges along the
// same axis as `desired`) — used to nudge a trunk's default centered
// position off of any unrelated node's card it would otherwise cut
// through. Only handles being pushed clear of the *nearest* blocking
// range, not iterative multi-obstacle pathfinding — a deliberate scope
// limit (see routeElbow's own comment), good enough for the common case
// of one unrelated card sitting between a source and a different
// target, not a general router.
function findClearBend(desired, lo, hi, forbidden) {
  const clamped = clamp(desired, lo, hi)
  if (!forbidden.length) return clamped
  const merged = forbidden
    .slice()
    .sort((r1, r2) => r1[0] - r2[0])
    .reduce((acc, r) => {
      const last = acc[acc.length - 1]
      if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1])
      else acc.push([r[0], r[1]])
      return acc
    }, [])
  const hit = merged.find(([s, e]) => clamped >= s && clamped <= e)
  if (!hit) return clamped
  const left = hit[0]
  const right = hit[1]
  const candidate = Math.abs(clamped - left) <= Math.abs(clamped - right) ? left : right
  return clamp(candidate, lo, hi)
}

// `a`/`b` are anchor points (from sideAnchor()), `sideA`/`sideB` the
// sides they're on, `bendOffset` a signed pixel delta from the
// auto-centered bend (null/0 = centered). `obstacles` (optional) is a
// list of `{x, y, width, height}` boxes for every *other* node on the
// map (not this edge's own two) — the default centered bend gets
// nudged clear of any of them it would otherwise route straight
// through, since a source with several targets routinely has one
// target's default trunk position land right on top of an unrelated
// card sitting between them. A caller-supplied `bendOffset` (the user
// manually dragged this specific edge) is trusted as-is and skips
// obstacle avoidance entirely — a deliberate manual reroute shouldn't
// get silently overridden. Returns the 4 route points (for building the
// path) and `handle`, the single point a drag grip should sit at — the
// midpoint of the route's middle segment, which is exactly what
// `bendOffset` moves.
export function routeElbow(a, sideA, b, sideB, bendOffset, obstacles) {
  const axis = sideA === 'top' || sideA === 'bottom' ? 'y' : 'x'
  // != null (not a truthy check) — a manual drag that happens to land
  // back at exactly 0 is still a manual position and must skip obstacle
  // avoidance, same as any other manual value.
  const manual = bendOffset != null
  const offset = bendOffset || 0
  if (axis === 'x') {
    const lo = Math.min(a.x, b.x) - PAD
    const hi = Math.max(a.x, b.x) + PAD
    const desired = (a.x + b.x) / 2 + offset
    const trunkLo = Math.min(a.y, b.y)
    const trunkHi = Math.max(a.y, b.y)
    const forbidden =
      manual || !obstacles
        ? []
        : obstacles
            .filter((n) => n.y <= trunkHi && n.y + n.height >= trunkLo)
            .map((n) => [n.x - OBSTACLE_MARGIN, n.x + n.width + OBSTACLE_MARGIN])
    const bend = findClearBend(desired, lo, hi, forbidden)
    return {
      axis,
      points: [a, { x: bend, y: a.y }, { x: bend, y: b.y }, b],
      handle: { x: bend, y: (a.y + b.y) / 2 }
    }
  }
  const lo = Math.min(a.y, b.y) - PAD
  const hi = Math.max(a.y, b.y) + PAD
  const desired = (a.y + b.y) / 2 + offset
  const trunkLo = Math.min(a.x, b.x)
  const trunkHi = Math.max(a.x, b.x)
  const forbidden =
    manual || !obstacles
      ? []
      : obstacles
          .filter((n) => n.x <= trunkHi && n.x + n.width >= trunkLo)
          .map((n) => [n.y - OBSTACLE_MARGIN, n.y + n.height + OBSTACLE_MARGIN])
  const bend = findClearBend(desired, lo, hi, forbidden)
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
