import { stripHtmlToText } from './html.js'
import { catInfo, mkLine, mkSection } from './model.js'

// Builds the plain-text/markdown/JSON export content, exactly matching the
// prototype's own exportScript() so files stay interchangeable either way.
export function buildExportContent(script, format) {
  if (format === 'json') {
    return { content: JSON.stringify(script, null, 2), ext: 'json' }
  }
  const lines = [script.title, '']
  script.sections.forEach((sec) => {
    lines.push(format === 'md' ? '## ' + sec.heading : sec.heading.toUpperCase())
    sec.lines.forEach((l) => {
      const cat = l.categoryId ? catInfo(script, l.categoryId) : null
      const text = stripHtmlToText(l.text)
      const tagLabel = cat ? '[' + cat.label.toUpperCase() + '] ' : ''
      lines.push(tagLabel + text)
      if (l.note) lines.push((format === 'md' ? '> ' : '  Note: ') + l.note)
    })
    if (sec.checklist && sec.checklist.length) {
      sec.checklist.forEach((it) => {
        lines.push((format === 'md' ? '- [' + (it.done ? 'x' : ' ') + '] ' : it.done ? '[x] ' : '[ ] ') + it.text)
      })
    }
    lines.push('')
  })
  return { content: lines.join('\n'), ext: format === 'md' ? 'md' : 'txt' }
}

// Best-effort heuristic import of a freeform .txt/.md file: first line is
// the title, ALL-CAPS-ish short lines (or "## " lines) become section
// headings, everything else becomes lines (optionally "[TAG] " prefixed).
export function parseImportedText(text) {
  const lines = text.split(/\r?\n/)
  const title = (lines[0] || 'Imported script').trim() || 'Imported script'
  const body = lines.slice(1)
  const sections = []
  let current = null
  body.forEach((raw) => {
    const trimmed = raw.trim()
    if (!trimmed) return
    const isHeading =
      /^##\s+/.test(trimmed) ||
      (trimmed === trimmed.toUpperCase() && trimmed.length < 60 && /[A-Z]/.test(trimmed) && trimmed.split(' ').length <= 7 && !/^\[/.test(trimmed))
    if (isHeading) {
      current = mkSection(trimmed.replace(/^##\s+/, ''), [])
      sections.push(current)
    } else {
      if (!current) {
        current = mkSection('Section 1', [])
        sections.push(current)
      }
      let t = trimmed
      const m = t.match(/^\[([^\]]+)\]\s*(.*)$/)
      if (m) t = m[2]
      current.lines.push(mkLine(t, null))
    }
  })
  if (!sections.length) sections.push(mkSection('Section 1', [mkLine(title, null)]))
  return { title, sections }
}
