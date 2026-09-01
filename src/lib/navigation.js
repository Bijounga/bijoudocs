import { caretAtStart, caretAtEnd, placeCaretEnd } from '../state/lineRefs.js'

// Ordered list of "nav stops" (line-content search / selection-extend order):
// a heading followed by its lines, skipped entirely if the section is
// collapsed. Scoped to the single open tab if one is active.
export function buildNavList(script) {
  const list = []
  const addSection = (sec) => {
    list.push({ type: 'heading', id: sec.id })
    if (!sec.collapsed) sec.lines.forEach((l) => list.push({ type: 'line', key: sec.id + ':' + l.id }))
  }
  if (script.activeTabId && script.activeTabId !== 'all') {
    const sec = script.sections.find((s) => s.id === script.activeTabId)
    if (sec) addSection(sec)
  } else {
    script.sections.forEach(addSection)
  }
  return list
}

// Every focusable heading input / line-text div currently in the DOM, in
// visual (document) order — used for plain Up/Down and boundary Left/Right
// navigation between them.
export function getNavElements() {
  return Array.from(document.querySelectorAll('.main .section-heading-input, .main .line-text'))
}

export function focusNavElement(target, position) {
  if (!target) return
  target.focus()
  if (target.tagName === 'INPUT') {
    const pos = position === 'start' ? 0 : target.value.length
    if (target.setSelectionRange) target.setSelectionRange(pos, pos)
  } else if (position === 'start') {
    const r = document.createRange()
    r.selectNodeContents(target)
    r.collapse(true)
    const s = window.getSelection()
    s.removeAllRanges()
    s.addRange(r)
  } else {
    placeCaretEnd(target)
  }
  target.scrollIntoView({ block: 'nearest' })
}

// Returns true if it handled (and preventDefault'd) the event.
export function handleHorizontalNav(e, el, isInput) {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return false
  if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return false
  let atStart, atEnd
  if (isInput) {
    atStart = el.selectionStart === 0 && el.selectionEnd === 0
    atEnd = el.selectionStart === el.value.length && el.selectionEnd === el.value.length
  } else {
    atStart = caretAtStart(el)
    atEnd = caretAtEnd(el)
  }
  if (e.key === 'ArrowRight' && !atEnd) return false
  if (e.key === 'ArrowLeft' && !atStart) return false
  const items = getNavElements()
  const idx = items.indexOf(el)
  if (idx < 0) return false
  const nextIdx = e.key === 'ArrowRight' ? idx + 1 : idx - 1
  if (nextIdx < 0 || nextIdx >= items.length) return false
  e.preventDefault()
  focusNavElement(items[nextIdx], e.key === 'ArrowRight' ? 'start' : 'end')
  return true
}

// Whether the caret is already on the element's first/last visual row —
// lets a multi-row line (wrapped, or containing <br>s from pasted
// multi-line text) tell "caret already on the first/last row" apart from
// "caret merely in the first/last text node", which a plain
// caretAtStart/caretAtEnd check can't do.
//
// Measures via the range from content-start-to-caret ('top' check) or
// caret-to-content-end ('bottom' check) rather than the caret's own
// collapsed position — a collapsed Range's getClientRects() can come back
// empty right at a content boundary (caret at the very start or end of the
// element) in Chromium, which used to make this fall back to "treat as
// edge" unconditionally and jump straight to the line above/below even
// from the last row of a multi-row line.
function caretRowEdge(el, edge) {
  const sel = window.getSelection()
  if (!sel.rangeCount) return true
  const caret = sel.getRangeAt(0)
  const contentRange = document.createRange()
  contentRange.selectNodeContents(el)
  const contentRects = contentRange.getClientRects()
  if (!contentRects.length) return true

  const spanRange = document.createRange()
  if (edge === 'top') {
    spanRange.setStart(contentRange.startContainer, contentRange.startOffset)
    spanRange.setEnd(caret.startContainer, caret.startOffset)
  } else {
    spanRange.setStart(caret.startContainer, caret.startOffset)
    spanRange.setEnd(contentRange.endContainer, contentRange.endOffset)
  }
  if (spanRange.collapsed) return true // caret at the very start/end of all content
  const spanRects = spanRange.getClientRects()
  if (!spanRects.length) return true

  if (edge === 'top') {
    const nearCaretRect = spanRects[spanRects.length - 1]
    return Math.abs(nearCaretRect.top - contentRects[0].top) < 2
  }
  const nearCaretRect = spanRects[0]
  return Math.abs(nearCaretRect.bottom - contentRects[contentRects.length - 1].bottom) < 2
}

// Returns true if it handled the event (always preventDefault's on Up/Down
// with no modifiers once it decides to jump lines, matching the prototype —
// but for a multi-row line-text, only once the caret has already reached
// that row's top/bottom edge; otherwise it lets the browser move the caret
// within the line as normal, same as any plain multi-line text field).
export function handleVerticalNav(e, el) {
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return false
  if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return false
  if (el.tagName !== 'INPUT') {
    const atEdge = caretRowEdge(el, e.key === 'ArrowUp' ? 'top' : 'bottom')
    if (!atEdge) return false
  }
  e.preventDefault()
  const items = getNavElements()
  const idx = items.indexOf(el)
  if (idx < 0) return true
  const nextIdx = e.key === 'ArrowDown' ? idx + 1 : idx - 1
  if (nextIdx < 0 || nextIdx >= items.length) return true
  focusNavElement(items[nextIdx])
  return true
}
