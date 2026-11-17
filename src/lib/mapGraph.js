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

// ---------- problems: a node you can step inside ----------
// A "problem" node (type: 'problem') holds other nodes: each of those has
// `parent: <problem id>`. Nodes with no parent live at the top level of the
// map. Positions inside a problem are in the same world coordinates as before
// (so ungrouping puts everything back where it was); entering a problem just
// shows the nodes whose parent it is.
export const isProblemNode = (n) => !!n && n.type === 'problem'

// The problem a node sits in, or null at the top level (also null if that
// problem no longer exists).
export const parentOf = (nodes, n) => (n && n.parent && nodes[n.parent] && nodes[n.parent].type === 'problem' ? n.parent : null)

// Every problem above a node, nearest first.
export function ancestorChain(nodes, id) {
  const chain = []
  let cur = nodes[id]
  let guard = 0
  while (cur && guard++ < 60) {
    const p = parentOf(nodes, cur)
    if (!p) break
    chain.push(p)
    cur = nodes[p]
  }
  return chain
}

// Every node inside a set of problems, at any depth (not the problems themselves).
export function descendantIds(nodes, ids) {
  const roots = new Set(ids)
  const out = new Set()
  Object.keys(nodes).forEach((id) => {
    let cur = nodes[id]
    let guard = 0
    while (cur && guard++ < 60) {
      const p = parentOf(nodes, cur)
      if (!p) break
      if (roots.has(p)) {
        out.add(id)
        break
      }
      cur = nodes[p]
    }
  })
  return out
}

// The node that stands for `id` when looking at `scope` (a problem id, or
// null for the top level): the id itself if it sits right in that scope, the
// problem it is inside if it is deeper, or null if it is not within that scope.
export function projectTo(nodes, id, scope) {
  let cur = id
  let guard = 0
  while (nodes[cur] && guard++ < 60) {
    const p = parentOf(nodes, nodes[cur])
    if (p === scope) return cur
    if (!p) return null
    cur = p
  }
  return null
}

// Ids hidden because a frame around them is folded into a card (the folded
// frame itself is not in here).
export function foldedHidden(nodes) {
  const hidden = new Set()
  Object.keys(nodes).forEach((id) => {
    let cur = nodes[id]
    let guard = 0
    while (cur && guard++ < 60) {
      const p = parentOf(nodes, cur)
      if (!p) break
      if (nodes[p].folded) {
        hidden.add(id)
        break
      }
      cur = nodes[p]
    }
  })
  return hidden
}

// The lines to draw on the map: a link to a node hidden inside a folded frame is
// drawn to the folded card instead. `edge` is the real edge when the line is one,
// null when it only stands in for links into a folded frame.
export function visibleLines(mapLayout) {
  const { nodes, edges } = mapLayout
  const stand = (id) => {
    let cur = id
    let top = id
    let guard = 0
    while (nodes[cur] && guard++ < 60) {
      const p = parentOf(nodes, nodes[cur])
      if (!p) break
      if (nodes[p].folded) top = p
      cur = p
    }
    return top
  }
  const out = []
  const seen = new Map()
  edges.forEach((e) => {
    const a = stand(e.from)
    const b = stand(e.to)
    if (!nodes[a] || !nodes[b] || a === b) return
    const real = a === e.from && b === e.to
    const key = a + '>' + b
    const prev = seen.get(key)
    if (prev) {
      if (real && !prev.edge) {
        prev.edge = e
        prev.id = e.id
      }
      return
    }
    const item = { id: real ? e.id : 'proj:' + key, from: a, to: b, edge: real ? e : null }
    seen.set(key, item)
    out.push(item)
  })
  return out
}

// The lines to draw when looking at `scope`. A line between two nodes inside
// the same problem is drawn as is; a line that crosses a problem's border is
// drawn to the problem itself (so a chain that runs in and out of one still
// reads as a chain from outside). `edge` is the real edge when the line is one,
// null when it is only a stand-in.
export function scopeEdges(mapLayout, scope) {
  const { nodes, edges } = mapLayout
  const out = []
  const seen = new Map()
  edges.forEach((e) => {
    const a = projectTo(nodes, e.from, scope)
    const b = projectTo(nodes, e.to, scope)
    if (!a || !b || a === b) return
    const real = a === e.from && b === e.to
    const key = a + '>' + b
    const prev = seen.get(key)
    if (prev) {
      if (real && !prev.edge) {
        prev.edge = e
        prev.id = e.id
      }
      return
    }
    const item = { id: real ? e.id : 'proj:' + key, from: a, to: b, edge: real ? e : null }
    seen.set(key, item)
    out.push(item)
  })
  return out
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
function flattenLevel(mapLayout) {
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
  // only needed when the label actually changes, not per instance. Within
  // a group, a small "#N" marker closes out each instance before the next
  // one's members start, and a slightly bigger one closes the whole group
  // once its last instance is done (whether that's because a new label
  // started or chapters ran out entirely).
  let currentLabel = null
  let currentLabelDisplay = null
  let currentNumber = null
  // Every chapter node in the current group — the heading edits and
  // collapses them all together.
  let currentIds = []
  function closeCurrentGroup() {
    if (currentLabel !== null) dividers.push({ index: ordered.length, label: 'End of ' + currentLabelDisplay, kind: 'groupEnd', chapterIds: currentIds })
  }
  chapterIds.forEach((id) => {
    if (visited.has(id)) return
    const label = nodes[id].label || 'Untitled chapter'
    if (label.toLowerCase() !== currentLabel) {
      closeCurrentGroup()
      currentIds = []
      dividers.push({ index: ordered.length, label, kind: 'header', chapterIds: currentIds })
      currentLabel = label.toLowerCase()
      currentLabelDisplay = label
    } else {
      dividers.push({ index: ordered.length, label: '#' + currentNumber, kind: 'subEnd' })
    }
    currentIds.push(id)
    walkChapterMembers(id)
    currentNumber = nodes[id].number
  })
  closeCurrentGroup()

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

  if (stray.length && connectedCount > 0) dividers.push({ index: connectedCount, label: null, kind: 'divider' })

  return { ordered: [...ordered, ...stray], dividers }
}

// The Outline's reading order. Problems are rows of their own with what is
// inside them listed right after, one level deeper (unless a problem is set to
// be told as one line, when only the row shows). `depths` runs alongside
// `ordered`. With no problems this is exactly flattenLevel() above.
export function flattenMapOrder(mapLayout) {
  const nodes = mapLayout.nodes
  const grouped = Object.values(nodes).some((n) => n && n.parent && parentOf(nodes, n))
  if (!grouped) {
    const flat = flattenLevel(mapLayout)
    return { ...flat, depths: flat.ordered.map(() => 0) }
  }
  function level(scope, depth) {
    const here = {}
    Object.keys(nodes).forEach((id) => {
      if (parentOf(nodes, nodes[id]) === scope) here[id] = nodes[id]
    })
    const sub = {
      nodes: here,
      edges: scopeEdges(mapLayout, scope).map((e) => ({ id: e.id, from: e.from, to: e.to })),
      mainThreadId: projectTo(nodes, mapLayout.mainThreadId, scope)
    }
    const flat = flattenLevel(sub)
    const byIndex = new Map()
    flat.dividers.forEach((d) => {
      if (!byIndex.has(d.index)) byIndex.set(d.index, [])
      byIndex.get(d.index).push(d)
    })
    const ordered = []
    const depths = []
    const dividers = []
    const placeDividers = (i) => (byIndex.get(i) || []).forEach((d) => dividers.push({ ...d, index: ordered.length }))
    flat.ordered.forEach((id, i) => {
      placeDividers(i)
      ordered.push(id)
      depths.push(depth)
      if (isProblemNode(nodes[id]) && !nodes[id].compress) {
        const inner = level(id, depth + 1)
        const base = ordered.length
        inner.dividers.forEach((d) => dividers.push({ ...d, index: base + d.index }))
        ordered.push(...inner.ordered)
        depths.push(...inner.depths)
      }
    })
    placeDividers(flat.ordered.length)
    return { ordered, depths, dividers }
  }
  return level(null, 0)
}
