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
// skim/export/eventually import from elsewhere. Chapter nodes (type:
// 'chapter' — a label + a number, deliberately NOT required to connect to
// each other, e.g. "The Desert" #1 and a separate "The Desert" #2 sitting
// unconnected elsewhere on the map) go first, grouped by label then
// ordered by number — each one's own members are whatever's reachable
// from it via normal edges, same mechanism as everything else here.
// Chapter nodes themselves never appear as their own row — they're
// represented purely by the header divider in front of their group.
// After chapters, the main thread (if one's set) is the backbone: the
// same "follow the arrows" order already shown as badges on the map, so
// the two views agree with each other. Anything left over is appended as
// its own connected chains (each walked from whichever end has no
// incoming edge, so a thread reads start-to-finish), and anything with no
// connections at all comes last, top-to-bottom then left-to-right the way
// it visually reads on the map.
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
  const dividers = [] // { index: position in `ordered` this header goes before, label: string|null (null = the generic "not connected" divider) }

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

  // Same as walk(), but for a chapter node specifically: the chapter id
  // itself is marked visited (so nothing else re-walks it) but never
  // pushed into `ordered`, and traversal refuses to cross into another
  // chapter node (so one chapter's walk can't swallow a neighboring
  // chapter's own subtree).
  function walkChapterMembers(chapterId) {
    visited.add(chapterId)
    const queue = [chapterId]
    while (queue.length) {
      const current = queue.shift()
      const nexts = outgoing.get(current) || []
      nexts.forEach((id) => {
        if (visited.has(id) || !nodes[id] || nodes[id].type === 'chapter') return
        visited.add(id)
        ordered.push(id)
        queue.push(id)
      })
    }
  }

  const chapterIds = ids
    .filter((id) => nodes[id].type === 'chapter')
    .sort((a, b) => {
      const la = (nodes[a].label || '').toLowerCase()
      const lb = (nodes[b].label || '').toLowerCase()
      if (la !== lb) return la < lb ? -1 : 1
      return (nodes[a].number || 0) - (nodes[b].number || 0)
    })
  // Same-label instances (e.g. "The Desert" #1 and #2) share ONE header —
  // they're already sorted adjacent by label above, so a new header is
  // only needed when the label actually changes, not per instance.
  let lastLabel = null
  chapterIds.forEach((id) => {
    if (visited.has(id)) return
    const label = nodes[id].label || 'Untitled chapter'
    if (label.toLowerCase() !== lastLabel) {
      dividers.push({ index: ordered.length, label })
      lastLabel = label.toLowerCase()
    }
    walkChapterMembers(id)
  })

  if (mainThreadId && nodes[mainThreadId] && !visited.has(mainThreadId)) walk(mainThreadId)

  const hasEdges = (id) => outgoing.has(id) || incoming.has(id)
  const isChainStart = (id) => !(incoming.get(id) || []).some((from) => !visited.has(from) && nodes[from])
  const isChapter = (id) => nodes[id].type === 'chapter'

  // Other connected chains, each from its own natural start.
  ids.forEach((id) => {
    if (!visited.has(id) && !isChapter(id) && hasEdges(id) && isChainStart(id)) walk(id)
  })
  // Leftover connected nodes only possible inside a pure cycle (every node
  // in it has an incoming edge) — no clean start, so just pick one.
  ids.forEach((id) => {
    if (!visited.has(id) && !isChapter(id) && hasEdges(id)) walk(id)
  })

  const connectedCount = ordered.length

  // Fully isolated nodes — no edges at all. Chapter nodes are never in
  // here (walkChapterMembers marks every one visited up front, even an
  // empty one), so an empty chapter still shows as its own header with
  // nothing under it yet, rather than falling in with "not connected."
  const stray = ids
    .filter((id) => !visited.has(id))
    .sort((a, b) => nodes[a].y - nodes[b].y || nodes[a].x - nodes[b].x)

  if (stray.length && connectedCount > 0) dividers.push({ index: connectedCount, label: null })

  return { ordered: [...ordered, ...stray], dividers }
}
