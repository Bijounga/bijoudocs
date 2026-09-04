// Shared script-shape helpers for the main process: defaults, migration of
// legacy/partial JSON into a complete Script object, and id generation.
// Mirrors the shape the prototype's own export/import already uses, so old
// exports and hand-edited files keep loading.

let uidCounter = 1
function uid() {
  return 'id' + uidCounter++ + Math.random().toString(36).slice(2, 6)
}

function defaultCategories() {
  return [
    { id: 'broll', label: 'B-Roll', color: '#4FD1C5', spoken: true },
    { id: 'onscreen', label: 'On-Screen Text', color: '#F2A65A', spoken: false },
    { id: 'factcheck', label: 'Fact-Check', color: '#D46FB0', spoken: true },
    { id: 'note', label: 'Note', color: '#8A8D99', spoken: false }
  ]
}

function mkLine(text, categoryId, note) {
  return { id: uid(), text: text || '', categoryId: categoryId || null, note: note || '', noteOpen: false, done: false, indent: 0, struck: false, bookmarked: false, takes: [] }
}

function mkSection(heading, lines) {
  return { id: uid(), heading, collapsed: false, titleColor: null, checklist: [], checklistOpen: false, done: false, beatSummary: '', lines: lines || [] }
}

// Fills in any field missing from a raw script object (loaded from disk, or
// imported from an external .json export) so the rest of the app can assume
// a fully-shaped Script. `id` is preserved unless `forceNewId` is set, which
// is used for imports so they never collide with an existing file.
function migrateScript(raw, { forceNewId = false } = {}) {
  if (!raw || !Array.isArray(raw.sections)) return null
  const script = { ...raw }
  if (forceNewId || !script.id) script.id = uid()
  script.title = script.title || 'Untitled script'
  script.pinned = !!script.pinned
  script.dueDate = typeof script.dueDate === 'string' ? script.dueDate : null
  script.dailyBaseline =
    raw.dailyBaseline && typeof raw.dailyBaseline.date === 'string' && typeof raw.dailyBaseline.words === 'number'
      ? raw.dailyBaseline
      : null
  script.workLogHistory = Array.isArray(raw.workLogHistory) ? raw.workLogHistory : []
  script.timestampLog = Array.isArray(raw.timestampLog) ? raw.timestampLog : []
  script.projectChecklist = Array.isArray(raw.projectChecklist) ? raw.projectChecklist : []
  script.updatedAt = typeof script.updatedAt === 'number' ? script.updatedAt : Date.now()
  script.openTabs = Array.isArray(script.openTabs) ? script.openTabs : []
  script.activeTabId = script.activeTabId || 'all'
  script.tabHistory = Array.isArray(script.tabHistory) ? script.tabHistory : [script.activeTabId]
  script.tabHistoryIndex = typeof script.tabHistoryIndex === 'number' ? script.tabHistoryIndex : 0
  script.categories = Array.isArray(script.categories) && script.categories.length ? script.categories : defaultCategories()
  script.checkpoints = Array.isArray(script.checkpoints) ? script.checkpoints : []
  script.pinnedSectionIds = Array.isArray(script.pinnedSectionIds) ? script.pinnedSectionIds : []
  // "Where I left off" — set manually (right-click a line, or an item in
  // the Outline tab), one of each since the two views work at different
  // granularity (a specific line in the script vs. a whole section/idea
  // node in the flattened outline).
  script.resumeLineKey = typeof script.resumeLineKey === 'string' ? script.resumeLineKey : null
  script.resumeOutlineNodeId = typeof script.resumeOutlineNodeId === 'string' ? script.resumeOutlineNodeId : null
  const rawMap = raw.mapLayout && typeof raw.mapLayout === 'object' ? raw.mapLayout : {}
  script.mapLayout = {
    nodes: rawMap.nodes && typeof rawMap.nodes === 'object' ? rawMap.nodes : {},
    edges: Array.isArray(rawMap.edges) ? rawMap.edges : [],
    mainThreadId: typeof rawMap.mainThreadId === 'string' ? rawMap.mainThreadId : null,
    hideSummaries: !!rawMap.hideSummaries
  }
  script.sections = script.sections.map((sec) => ({
    id: sec.id || uid(),
    heading: sec.heading || 'Untitled section',
    collapsed: !!sec.collapsed,
    titleColor: sec.titleColor || null,
    checklist: Array.isArray(sec.checklist) ? sec.checklist : [],
    checklistOpen: !!sec.checklistOpen,
    done: !!sec.done,
    beatSummary: typeof sec.beatSummary === 'string' ? sec.beatSummary : '',
    lines: Array.isArray(sec.lines)
      ? sec.lines.map((l) => ({
          id: l.id || uid(),
          text: l.text || '',
          categoryId: l.categoryId || null,
          note: l.note || '',
          noteOpen: !!l.noteOpen,
          done: !!l.done,
          indent: typeof l.indent === 'number' ? l.indent : 0,
          struck: !!l.struck,
          bookmarked: !!l.bookmarked,
          takes: Array.isArray(l.takes) ? l.takes : []
        }))
      : []
  }))
  return script
}

function newBlankScript(title) {
  return migrateScript({
    title: title || 'Untitled script',
    sections: [mkSection('Hook', [mkLine('', null)])]
  })
}

export { uid, defaultCategories, mkLine, mkSection, migrateScript, newBlankScript }
