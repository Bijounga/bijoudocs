import { uid } from './id.js'
import { stripHtmlToText } from './html.js'

export function defaultCategories() {
  return [
    { id: 'broll', label: 'B-Roll', color: '#4FD1C5', spoken: true },
    { id: 'onscreen', label: 'On-Screen Text', color: '#F2A65A', spoken: false },
    { id: 'factcheck', label: 'Fact-Check', color: '#D46FB0', spoken: true },
    { id: 'note', label: 'Note', color: '#8A8D99', spoken: false }
  ]
}

export function mkLine(text, categoryId, note) {
  return { id: uid(), text: text || '', categoryId: categoryId || null, note: note || '', noteOpen: false, done: false, indent: 0, struck: false, bookmarked: false, takes: [] }
}

export function mkSection(heading, lines) {
  return { id: uid(), heading, collapsed: false, titleColor: null, checklist: [], checklistOpen: false, done: false, beatSummary: '', lines: lines || [] }
}

export function mkCheckItem(text) {
  return { id: uid(), text: text || '', done: false }
}

export function findLine(script, key) {
  const [secId, lineId] = key.split(':')
  const sec = script.sections.find((s) => s.id === secId)
  if (!sec) return null
  const line = sec.lines.find((l) => l.id === lineId)
  return line ? { sec, line } : null
}

export function catInfo(script, id) {
  return script.categories.find((c) => c.id === id)
}

// Used before a destructive bulk delete (mind-map right-click menu, or
// selection + Delete/Backspace) to decide whether it's worth an "are you
// sure" — an empty section is low-stakes to lose, one with real lines or
// checkpoints isn't.
export function sectionsHaveContent(sections) {
  return sections.some((sec) => sec.lines.some((l) => stripHtmlToText(l.text).trim()) || sec.checklist.length > 0)
}
