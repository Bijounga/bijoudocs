// Folds a script that changed on disk from outside this app instance (the
// Premiere extension — see electron/main/scriptWatcher.js) into the
// in-memory copy, without disturbing anything the user might be actively
// typing right now.
//
// Deliberately narrow: only copies the fields the extension is actually
// capable of touching (a line's categoryId/note/done/marker, categories,
// checklist items, and brand-new lines it appended) onto matching ids in `existing`. Never
// touches `text`/`takes`/`struck`/`indent`/etc — those are BijouDocs' own
// editor's job, so an external write can never clobber active typing here.
// Mutates `existing` in place (called from inside an immer `set()` draft).
export function mergeExternalScript(existing, incoming) {
  const catMap = new Map(existing.categories.map((c) => [c.id, c]))
  incoming.categories.forEach((c) => {
    const cur = catMap.get(c.id)
    if (cur) Object.assign(cur, c)
    else existing.categories.push({ ...c })
  })

  // Where each checklist item / line lives in the incoming copy, so one the panel
  // MOVED to another list (Project -> a section, section -> section) can be
  // dropped from its old list here instead of showing up twice.
  const incWhere = new Map()
  ;(incoming.projectChecklist || []).forEach((i) => incWhere.set(i.id, 'p'))
  incoming.sections.forEach((s) => {
    ;(s.checklist || []).forEach((i) => incWhere.set(i.id, 'c:' + s.id))
    ;(s.lines || []).forEach((l) => incWhere.set(l.id, 'l:' + s.id))
  })

  const incomingSectionsById = new Map(incoming.sections.map((s) => [s.id, s]))
  existing.sections.forEach((sec) => {
    const incSec = incomingSectionsById.get(sec.id)
    if (!incSec) return
    const lineMap = new Map(sec.lines.map((l) => [l.id, l]))
    incSec.lines.forEach((incLine) => {
      const cur = lineMap.get(incLine.id)
      if (cur) {
        cur.categoryId = incLine.categoryId
        cur.note = incLine.note
        cur.done = incLine.done
        if (incLine.marker) cur.marker = { ...incLine.marker }
        else delete cur.marker
      } else {
        sec.lines.push({ ...incLine })
      }
    })
    if (incSec.checklist) {
      if (!sec.checklist) sec.checklist = []
      mergeChecklist(sec.checklist, incSec.checklist)
    }
  })

  if (incoming.projectChecklist) {
    if (!existing.projectChecklist) existing.projectChecklist = []
    mergeChecklist(existing.projectChecklist, incoming.projectChecklist)
  }

  // Items/lines the panel deleted (the × and "Clear done"): a merge only ever adds, so
  // without these ids a deleted item would live on here and be written back
  // out by the next save.
  const gone = new Set(incoming.checklistTombstones || [])
  if (gone.size) {
    if (existing.projectChecklist) existing.projectChecklist = existing.projectChecklist.filter((i) => !gone.has(i.id))
    existing.sections.forEach((sec) => {
      if (sec.checklist) sec.checklist = sec.checklist.filter((i) => !gone.has(i.id))
      sec.lines = sec.lines.filter((l) => !gone.has(l.id))
    })
    existing.checklistTombstones = Array.from(new Set([...(existing.checklistTombstones || []), ...gone])).slice(-200)
  }

  if (existing.projectChecklist) existing.projectChecklist = existing.projectChecklist.filter((i) => !incWhere.has(i.id) || incWhere.get(i.id) === 'p')
  existing.sections.forEach((sec) => {
    if (sec.checklist) sec.checklist = sec.checklist.filter((i) => !incWhere.has(i.id) || incWhere.get(i.id) === 'c:' + sec.id)
    if (sec.lines) sec.lines = sec.lines.filter((l) => !incWhere.has(l.id) || incWhere.get(l.id) === 'l:' + sec.id)
  })

  // The panel's per-project marker presets. Copied whole so BijouDocs' next save
  // can't drop them (it would otherwise write its older copy back over the file).
  if (Array.isArray(incoming.markerPresets)) existing.markerPresets = incoming.markerPresets.map((p) => ({ ...p }))
  // Which sections belong to which Premiere sequence (the panel's per-project choice).
  if (incoming.sequenceSections) existing.sequenceSections = JSON.parse(JSON.stringify(incoming.sequenceSections))
  else delete existing.sequenceSections

  mergeImportedMapNodes(existing, incoming)

  existing.updatedAt = incoming.updatedAt
}

// The Premiere panel checks checklist items off, adds new ones, and links them
// to sequence markers (`item.marker`). Only done/marker are copied onto items
// we already have (never `text`, which could be mid-edit here), and unseen
// items are appended.
function mergeChecklist(cur, inc) {
  const byId = new Map(cur.map((i) => [i.id, i]))
  inc.forEach((it) => {
    const c = byId.get(it.id)
    if (!c) {
      cur.push({ ...it })
      return
    }
    c.done = it.done
    if ('categoryId' in it) c.categoryId = it.categoryId
    // Text is normally left alone (it may be mid-edit here). A panel edit carries a
    // timestamp, and is adopted only when it's newer than what we already have.
    if (it.textEditedAt && it.textEditedAt > (c.textEditedAt || 0)) {
      c.text = it.text
      c.textEditedAt = it.textEditedAt
    }
    if (it.marker) c.marker = { ...it.marker }
    else delete c.marker
  })
}

// Beat Notes (Premiere) and Bijou Footage append idea nodes + edges to
// mapLayout on disk. Without this, an open script would ignore them and
// BijouDocs' next save would silently write them back out of the file.
// Add-only, and only for nodes an external tool stamped with
// `importedFrom` — so a node the user deleted here (but hasn't saved yet)
// can't be resurrected by an older copy on disk.
function mergeImportedMapNodes(existing, incoming) {
  const inMap = incoming.mapLayout
  if (!inMap || !inMap.nodes) return
  if (!existing.mapLayout) existing.mapLayout = { nodes: {}, edges: [], mainThreadId: null }
  const map = existing.mapLayout
  if (!map.nodes) map.nodes = {}
  if (!map.edges) map.edges = []
  const added = new Set()
  for (const [id, node] of Object.entries(inMap.nodes)) {
    if (map.nodes[id] || !node || !node.importedFrom) continue
    map.nodes[id] = { ...node }
    added.add(id)
  }
  if (!added.size) return
  const edgeIds = new Set(map.edges.map((e) => e.id))
  for (const e of inMap.edges || []) {
    if (edgeIds.has(e.id)) continue
    if ((added.has(e.from) || added.has(e.to)) && map.nodes[e.from] && map.nodes[e.to]) map.edges.push({ ...e })
  }
  if (!map.mainThreadId && inMap.mainThreadId && map.nodes[inMap.mainThreadId]) map.mainThreadId = inMap.mainThreadId
}
