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
