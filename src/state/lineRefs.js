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

// Tracks which side of a script+Outline split view was last actually
// worked in, for disambiguating "jump/mark resume point" there —
// outlineViewOpen alone stays true the whole time split mode is on,
// regardless of which side the user's actually clicked into. A plain
// live `document.activeElement` check at click/keydown time doesn't
// work for the Topbar button specifically: clicking a <button> shifts
// focus to the button itself as part of the click's own default action,
// so by the time an onClick handler runs, activeElement is already the
// button, not whatever pane the user was just in. This listens for real
// focus entering either pane and remembers it, ignoring focus landing
// anywhere else (toolbar, sidebar, inspector, modals) — including the
// Resume button's own focus-on-click, so that doesn't overwrite it.
let lastFocusWasOutline = null
if (typeof document !== 'undefined') {
  document.addEventListener('focusin', (e) => {
    const t = e.target
    if (!t || !t.closest) return
    if (t.closest('.outline-main')) lastFocusWasOutline = true
    else if (t.closest('.editor-wrap')) lastFocusWasOutline = false
  })
}
export function wasOutlineLastFocused() {
  return lastFocusWasOutline
}

// Finds the word to look up synonyms for in a given line: whatever's
// currently selected, or (nothing selected — just a caret) the word the
// caret is sitting in, expanded via the Selection API's own word-boundary
// logic rather than a hand-rolled regex. Also focuses the line first, so
// this can be called straight from a keybind with no prior click there.
export function captureWordSelection(key) {
  const el = getLineEl(key)
  if (!el) return null
  el.focus()
  const sel = window.getSelection()
  if ((!sel.rangeCount || sel.getRangeAt(0).collapsed) && typeof sel.modify === 'function') {
    sel.modify('move', 'backward', 'word')
    sel.modify('extend', 'forward', 'word')
    // Chromium's forward-word extend lands at the START of the next word,
    // not the end of this one — it swallows the space between them into
    // the selection. Left alone, replacing "happy" would eat the space
    // and leave "joyfulsentence." Shrink back past any trailing
    // whitespace (only in this auto-expanded case — a selection the user
    // made themselves is left exactly as they made it).
    let guard = 0
    while (sel.rangeCount && /\s$/.test(sel.getRangeAt(0).toString()) && guard < 5) {
      sel.modify('extend', 'backward', 'character')
      guard++
    }
  }
  if (!sel.rangeCount || sel.getRangeAt(0).collapsed) return null
  const range = sel.getRangeAt(0)
  const word = range.toString().trim()
  if (!word) return null
  return { word, range: range.cloneRange() }
}

// Holds the live Range a word-replace action (synonym lookup, spellcheck)
// was triggered from, so clicking a result later (well after the
// triggering keydown or right-click) can restore exactly that selection
// before replacing it — document.execCommand('insertText', ...) only
// ever acts on the CURRENT selection, which would otherwise have moved on
// by click time. Plain module state, not the Zustand store, matching
// getLineEl/setLineRef above — a live DOM Range isn't serializable app
// state. Shared by both features since only one such popup is ever open
// on a given line at a time anyway.
let savedReplaceRange = null
let savedReplaceLineKey = null
export function saveWordReplaceSelection(key, range) {
  savedReplaceLineKey = key
  savedReplaceRange = range
}
// One-shot: returns the saved range for this exact line (null if it was
// for a different line, or nothing's saved) and clears it either way, so
// a stale range can never get reused for a later, unrelated pick.
export function consumeWordReplaceSelection(key) {
  if (savedReplaceLineKey !== key) return null
  const r = savedReplaceRange
  savedReplaceRange = null
  savedReplaceLineKey = null
  return r
}

// Restores the saved range and swaps its text for `newText`, then commits
// the line — the actual "replace" step for both synonym picks and
// spellcheck corrections. Returns false (no-op) if there's nothing valid
// to restore, e.g. the popup was left open long enough that its saved
// range no longer applies.
export function replaceCapturedSelection(key, newText, commitLineText, scriptId, sectionId, lineId) {
  const range = consumeWordReplaceSelection(key)
  const el = getLineEl(key)
  if (!el || !range) return false
  el.focus()
  const sel = window.getSelection()
  sel.removeAllRanges()
  sel.addRange(range)
  document.execCommand('insertText', false, newText)
  commitLineText(scriptId, sectionId, lineId, el.innerHTML)
  return true
}
