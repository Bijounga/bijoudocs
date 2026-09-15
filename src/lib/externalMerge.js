// Folds a script that changed on disk from outside this app instance (the
// Premiere extension — see electron/main/scriptWatcher.js) into the
// in-memory copy, without disturbing anything the user might be actively
// typing right now.
//
// Deliberately narrow: only copies the fields the extension is actually
// capable of touching (a line's categoryId/note/done, categories, and
// brand-new lines it appended) onto matching ids in `existing`. Never
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
      } else {
        sec.lines.push({ ...incLine })
      }
    })
  })

  existing.updatedAt = incoming.updatedAt
}
