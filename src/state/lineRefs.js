// Registry of live DOM nodes for line-text / heading elements, keyed by
// "sectionId:lineId" or "heading:sectionId". Lets store actions that create
// or restructure lines (Enter, Backspace-merge, Delete, new section) move
// focus to the right place after React commits, without querying the DOM
// by data-attribute the way the prototype did.
const registry = new Map()

export function setLineRef(key, el) {
  if (el) registry.set(key, el)
  else registry.delete(key)
}

export function getLineEl(key) {
  return registry.get(key) || null
}

export function placeCaretEnd(el) {
  if (!el) return
  const range = document.createRange()
  range.selectNodeContents(el)
  range.collapse(false)
  const sel = window.getSelection()
  sel.removeAllRanges()
  sel.addRange(range)
}

export function placeCaretAtTextOffset(el, offset) {
  if (!el) return
  let remaining = offset
  let node = null
  let nodeOffset = 0
  ;(function walk(n) {
    if (remaining < 0) return true
    if (n.nodeType === 3) {
      if (remaining <= n.textContent.length) {
        node = n
        nodeOffset = remaining
        remaining = -1
        return true
      }
      remaining -= n.textContent.length
      return false
    }
    for (const child of Array.from(n.childNodes)) {
      if (walk(child)) return true
    }
    return false
  })(el)
  if (!node) {
    node = el
    nodeOffset = el.childNodes.length
  }
  const range = document.createRange()
  range.setStart(node, nodeOffset)
  range.collapse(true)
  const sel = window.getSelection()
  sel.removeAllRanges()
  sel.addRange(range)
}

// Splits an element's live rich-text content into "before" and "after" HTML
// at the current caret position, via two ranges cloned from its contents —
// the Range API handles re-closing any element (a <span style="color:...">,
// etc.) that the caret falls in the middle of, on both sides of the split.
export function splitHtmlAtCaret(el) {
  const sel = window.getSelection()
  if (!sel.rangeCount) return { before: el.innerHTML, after: '' }
  const caret = sel.getRangeAt(0)
  const beforeRange = document.createRange()
  beforeRange.selectNodeContents(el)
  beforeRange.setEnd(caret.startContainer, caret.startOffset)
  const afterRange = document.createRange()
  afterRange.selectNodeContents(el)
  afterRange.setStart(caret.startContainer, caret.startOffset)
  const beforeEl = document.createElement('div')
  beforeEl.appendChild(beforeRange.cloneContents())
  const afterEl = document.createElement('div')
  afterEl.appendChild(afterRange.cloneContents())
  return { before: beforeEl.innerHTML, after: afterEl.innerHTML }
}

export function caretAtStart(el) {
  const sel = window.getSelection()
  if (!sel.rangeCount) return false
  const range = sel.getRangeAt(0)
  if (!range.collapsed) return false
  const t = range.cloneRange()
  t.selectNodeContents(el)
  t.setEnd(range.startContainer, range.startOffset)
  return t.toString().length === 0
}

// If the caret sits right at the start of a soft-wrapped visual line (a
// <br> within one line's own rich text, e.g. from Shift+Enter) that's
// preceded by ANOTHER <br> — i.e. a blank line — returns the <br>
// immediately before the caret (removing it collapses just the blank
// line, leaving the other <br> as the boundary between the two real
// lines of text). Returns null for every other caret position, including
// a normal single-<br> boundary between two lines of real text, which
// should keep native backspace behavior untouched.
export function blankLineBreakBeforeCaret(el) {
  const sel = window.getSelection()
  if (!sel.rangeCount) return null
  const range = sel.getRangeAt(0)
  if (!range.collapsed) return null
  const { startContainer, startOffset } = range
  if (!el.contains(startContainer)) return null
  let before
  if (startContainer.nodeType === 3) {
    if (startOffset > 0) return null
    before = startContainer.previousSibling
  } else {
    if (startOffset === 0) return null
    before = startContainer.childNodes[startOffset - 1]
  }
  if (!before || before.nodeName !== 'BR') return null
  const beforeThat = before.previousSibling
  return beforeThat && beforeThat.nodeName === 'BR' ? before : null
}

export function caretAtEnd(el) {
  const sel = window.getSelection()
  if (!sel.rangeCount) return false
  const range = sel.getRangeAt(0)
  if (!range.collapsed) return false
  const t = range.cloneRange()
  t.selectNodeContents(el)
  t.setStart(range.endContainer, range.endOffset)
  return t.toString().length === 0
}

// setTimeout, not requestAnimationFrame: rAF can be throttled to
// effectively never firing when the window isn't OS-focused, which would
// silently strand focus mid-edit.
export function focusLineEnd(key) {
  setTimeout(() => {
    const el = getLineEl(key)
    if (el) {
      el.focus()
      placeCaretEnd(el)
    }
  }, 0)
}

export function focusLineAtOffset(key, offset) {
  setTimeout(() => {
    const el = getLineEl(key)
    if (el) {
      el.focus()
      placeCaretAtTextOffset(el, offset)
    }
  }, 0)
}
