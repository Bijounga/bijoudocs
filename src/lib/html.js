// Rich-text helpers for line content, which is stored as a small whitelist
// of inline HTML (bold, strike, colored spans, inline images). Ported
// verbatim from the prototype's own escaping/sanitizing/stripping logic.

export function escapeHtml(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function stripHtmlToText(html) {
  const d = document.createElement('div')
  d.innerHTML = html || ''
  return d.textContent || ''
}

// Whitelists B/STRONG/S/STRIKE/DEL/I/EM/U, IMG (data: URIs only, width style),
// SPAN (color style only), FONT->SPAN, BR, DIV (attrs stripped); anything
// else gets unwrapped to its children. This is what backs the line-text
// contentEditable so pasted content can't smuggle in scripts/styles/links.
export function sanitizeHtml(html) {
  const tmp = document.createElement('div')
  tmp.innerHTML = html
  ;(function walk(node) {
    Array.from(node.childNodes).forEach((child) => {
      if (child.nodeType === 3) return
      if (child.nodeType !== 1) {
        child.remove()
        return
      }
      const tag = child.tagName
      if (tag === 'B' || tag === 'STRONG' || tag === 'S' || tag === 'STRIKE' || tag === 'DEL' || tag === 'I' || tag === 'EM' || tag === 'U') {
        while (child.attributes.length) child.removeAttribute(child.attributes[0].name)
        walk(child)
      } else if (tag === 'IMG') {
        const src = child.getAttribute('src') || ''
        const w = child.style && child.style.width
        Array.from(child.attributes).forEach((a) => child.removeAttribute(a.name))
        if (src.indexOf('data:image/') === 0) {
          child.setAttribute('src', src)
          if (w) child.setAttribute('style', 'width:' + w + ';')
        } else child.remove()
      } else if (tag === 'SPAN') {
        const color = child.style && child.style.color
        Array.from(child.attributes).forEach((a) => {
          if (a.name !== 'style') child.removeAttribute(a.name)
        })
        if (color) child.setAttribute('style', 'color:' + color + ';')
        else child.removeAttribute('style')
        walk(child)
      } else if (tag === 'FONT') {
        const color = child.getAttribute('color')
        const span = document.createElement('span')
        if (color) span.setAttribute('style', 'color:' + color + ';')
        span.innerHTML = child.innerHTML
        child.replaceWith(span)
        walk(span)
      } else if (tag === 'BR') {
        // keep
      } else if (tag === 'DIV') {
        while (child.attributes.length) child.removeAttribute(child.attributes[0].name)
        walk(child)
      } else {
        while (child.firstChild) child.parentNode.insertBefore(child.firstChild, child)
        child.remove()
      }
    })
  })(tmp)
  return tmp.innerHTML
}

export function hexToRgb(hex) {
  hex = hex.replace('#', '')
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('')
  const n = parseInt(hex, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function getInk(hex) {
  try {
    const [r, g, b] = hexToRgb(hex)
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    return lum > 0.55 ? '#141414' : '#ffffff'
  } catch (e) {
    return '#141414'
  }
}
