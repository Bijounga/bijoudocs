// Walks the mind map's manually-drawn edges outward from the designated
// main-thread node, following arrow direction (from -> to) only — so the
// user controls the story's flow purely by which end they dragged an edge
// from. Returns the set of "lit" node/edge ids plus a 1-indexed order per
// node, used both for highlighting the map and for the small position
// badge shown on sections in the normal editor.
export function computeMainThread(mapLayout) {
  const order = new Map()
  const litEdgeIds = new Set()
  const { mainThreadId, edges } = mapLayout
  if (!mainThreadId) return { order, litEdgeIds }

  const outgoing = new Map()
  edges.forEach((e) => {
    if (!outgoing.has(e.from)) outgoing.set(e.from, [])
    outgoing.get(e.from).push(e)
  })

  let n = 1
  order.set(mainThreadId, n++)
  const queue = [mainThreadId]
  while (queue.length) {
    const current = queue.shift()
    const edgesOut = outgoing.get(current) || []
    edgesOut.forEach((e) => {
      if (order.has(e.to)) return
      litEdgeIds.add(e.id)
      order.set(e.to, n++)
      queue.push(e.to)
    })
  }
  return { order, litEdgeIds }
}

// Turns the map's nodes into a single reading order for the Outline tab —
// a flattened, linear list view of the same content, meant to be easy to
// skim/export/eventually import from elsewhere. Reuses the main thread (if
// one's set) as the natural backbone: it's the same "follow the arrows"
// order already shown as badges on the map, so the two views agree with
// each other instead of introducing a second, unrelated sort. Anything not
// reachable from the main thread is appended as its own connected chains
// (each walked from whichever end has no incoming edge, so a thread reads
// start-to-finish), and anything with no connections at all comes last,
// top-to-bottom then left-to-right the way it visually reads on the map.
export function flattenMapOrder(mapLayout) {
  const { nodes, edges, mainThreadId } = mapLayout
  const ids = Object.keys(nodes)
  const outgoing = new Map()
  const incoming = new Map()
  edges.forEach((e) => {
    if (!nodes[e.from] || !nodes[e.to]) return
    if (!outgoing.has(e.from)) outgoing.set(e.from, [])
    outgoing.get(e.from).push(e.to)
    if (!incoming.has(e.to)) incoming.set(e.to, [])
    incoming.get(e.to).push(e.from)
  })

  const visited = new Set()
  const ordered = []

  function walk(startId) {
    const queue = [startId]
    visited.add(startId)
    while (queue.length) {
      const current = queue.shift()
      ordered.push(current)
      const nexts = outgoing.get(current) || []
      nexts.forEach((id) => {
        if (visited.has(id) || !nodes[id]) return
        visited.add(id)
        queue.push(id)
      })
    }
  }

  if (mainThreadId && nodes[mainThreadId]) walk(mainThreadId)

  const hasEdges = (id) => outgoing.has(id) || incoming.has(id)
  const isChainStart = (id) => !(incoming.get(id) || []).some((from) => !visited.has(from) && nodes[from])

  // Other connected chains, each from its own natural start.
  ids.forEach((id) => {
    if (!visited.has(id) && hasEdges(id) && isChainStart(id)) walk(id)
  })
  // Leftover connected nodes only possible inside a pure cycle (every node
  // in it has an incoming edge) — no clean start, so just pick one.
  ids.forEach((id) => {
    if (!visited.has(id) && hasEdges(id)) walk(id)
  })

  const connectedCount = ordered.length

  // Fully isolated nodes — no edges at all.
  const stray = ids
    .filter((id) => !visited.has(id))
    .sort((a, b) => nodes[a].y - nodes[b].y || nodes[a].x - nodes[b].x)

  return { ordered: [...ordered, ...stray], connectedCount }
}
