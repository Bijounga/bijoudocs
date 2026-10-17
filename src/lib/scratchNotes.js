// The notepad's text: a tiny whitelist of HTML — bold, italic, line breaks —
// kept as a string per script in the app's settings.
//
// Stored as 'h:' + html. A string without the prefix is a plain-text note
// from before the notepad could format; it's read as text (never as HTML),
// so a "<b>" typed back then stays a literal "<b>".

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Rebuilds the markup from nothing but a whitelist: B/STRONG -> <b>,
// I/EM -> <i>, BR, DIV/P -> <div>; every other element is unwrapped to its
// text. Parsed with DOMParser, which runs nothing (no scripts, no image
// loads), so even a hostile paste can't do anything on the way through.
export function cleanNoteHtml(html) {
  const doc = new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html')
  const walk = (node) => {
    let out = ''
    for (const c of node.childNodes) {
      if (c.nodeType === 3) {
        out += esc(c.nodeValue)
      } else if (c.nodeType === 1) {
        const tag = c.tagName
        const inner = walk(c)
        if (tag === 'B' || tag === 'STRONG') out += inner ? '<b>' + inner + '</b>' : ''
        else if (tag === 'I' || tag === 'EM') out += inner ? '<i>' + inner + '</i>' : ''
        else if (tag === 'BR') out += '<br>'
        else if (tag === 'DIV' || tag === 'P') out += '<div>' + (inner || '<br>') + '</div>'
        else if (tag === 'SCRIPT' || tag === 'STYLE') out += ''
        else out += inner
      }
    }
    return out
  }
  return walk(doc.body)
}

// What goes into the editor for a stored note.
export function noteToHtml(stored) {
  if (!stored) return ''
  if (stored.startsWith('h:')) return cleanNoteHtml(stored.slice(2))
  return stored
    .split('\n')
    .map((line) => '<div>' + (esc(line) || '<br>') + '</div>')
    .join('')
}

// What gets stored for the editor's current markup; '' when there's
// nothing in it (so an emptied note disappears instead of piling up).
export function htmlToNote(html) {
  const clean = cleanNoteHtml(html)
  const text = new DOMParser().parseFromString('<body>' + clean + '</body>', 'text/html').body.textContent
  return text.trim() ? 'h:' + clean : ''
}

// ---- tabs ----
// scratchPads[scriptId] = { tabs: [{ id, name, body }], active: tabId }, with
// each body in the 'h:' format above. A script nobody has typed in yet has no
// entry; it reads as this one empty tab (the store creates the real entry
// on the first write, reusing the same ids).
export const MAIN_TAB_ID = 'main'
export const DEFAULT_PAD = Object.freeze({
  tabs: Object.freeze([Object.freeze({ id: MAIN_TAB_ID, name: 'Notes', body: '' })]),
  active: MAIN_TAB_ID
})
export const getPad = (pads, scriptId) => (scriptId && pads[scriptId]) || DEFAULT_PAD

// "Note 2", "Note 3"… — the first free number.
export function nextTabName(tabs) {
  const used = new Set(tabs.map((t) => t.name))
  for (let n = 2; ; n++) if (!used.has('Note ' + n)) return 'Note ' + n
}
