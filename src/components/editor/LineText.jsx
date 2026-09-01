import React, { useEffect, useRef } from 'react'
import { setLineRef } from '../../state/lineRefs.js'

// Uncontrolled rich-text contentEditable: React never re-renders its
// children on keystroke (that's what caused cursor/scroll loss in the
// prototype's full-DOM-rebuild approach). Its innerHTML is only ever set
// imperatively — on mount, and again if `value` changes for a reason other
// than this element's own edit (undo/redo, checkpoint restore), guarded so
// it never clobbers an element the user is actively typing in.
const IMAGE_SIZES = [150, 300, 450, 650]

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

async function urlToDataUrl(url) {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    if (!blob.type.startsWith('image/')) return null
    return await fileToDataUrl(blob)
  } catch (e) {
    return null
  }
}

function looksLikeImageTransfer(dt) {
  if (!dt) return false
  if (dt.files && Array.from(dt.files).some((f) => f.type.startsWith('image/'))) return true
  if (dt.items && Array.from(dt.items).some((it) => it.kind === 'file' && it.type.startsWith('image/'))) return true
  const html = dt.getData && dt.getData('text/html')
  if (html && /<img[^>]+src=/i.test(html)) return true
  return false
}

// Pulls an image out of a paste/drop no matter where it came from: a raw
// file (screenshot, OS drag), or — the case that used to silently fail —
// an <img> copied from a webpage, whose src is a remote http(s) URL rather
// than a data: URI. sanitizeHtml only ever keeps data: URIs, so without
// this the image would get stripped the moment the line lost focus.
async function extractImageDataUrl(dt) {
  if (!dt) return null
  const fileFromItems = dt.items && Array.from(dt.items).find((it) => it.kind === 'file' && it.type.startsWith('image/'))
  if (fileFromItems) {
    const file = fileFromItems.getAsFile()
    if (file) return await fileToDataUrl(file)
  }
  const fileFromFiles = dt.files && Array.from(dt.files).find((f) => f.type.startsWith('image/'))
  if (fileFromFiles) return await fileToDataUrl(fileFromFiles)
  const html = dt.getData && dt.getData('text/html')
  if (html) {
    const match = html.match(/<img[^>]+src=["']([^"']+)["']/i)
    if (match) {
      if (match[1].indexOf('data:image/') === 0) return match[1]
      return await urlToDataUrl(match[1])
    }
  }
  const uri = (dt.getData && (dt.getData('text/uri-list') || dt.getData('text/plain')) || '').trim()
  if (/^https?:\/\/\S+\.(png|jpe?g|gif|webp|bmp|svg)(\?\S*)?$/i.test(uri)) {
    return await urlToDataUrl(uri)
  }
  return null
}

export default function LineText({ dataKey, value, placeholder, onCommit, onFocus, onKeyDown, onMouseDown, className, style }) {
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (document.activeElement !== el && el.innerHTML !== (value || '')) {
      el.innerHTML = value || ''
    }
  }, [value])

  // Custom image handling for paste/drop: intercepted only when the
  // transfer actually looks like an image, so plain text paste/drop still
  // goes through the browser's native (and already-working) path.
  async function insertImageFromTransfer(dt, dropPoint) {
    if (!looksLikeImageTransfer(dt)) return false
    const el = ref.current
    // Drop doesn't move the caret the way native drop-handling would (we
    // pre-empted that by calling preventDefault), so place it at the drop
    // point ourselves, before the async fetch below can let focus drift.
    // el.focus() here also doubles as the undo snapshot when the line
    // wasn't already focused (via the real focus event it fires, same as
    // any other edit) — a paste always starts from an already-focused
    // line, so that session's existing snapshot already covers it; adding
    // another pushUndo call here would just create the same redundant
    // double-undo-step bug that recordNewTake had.
    if (dropPoint && el) {
      el.focus()
      const range = document.caretRangeFromPoint ? document.caretRangeFromPoint(dropPoint.x, dropPoint.y) : null
      if (range) {
        const sel = window.getSelection()
        sel.removeAllRanges()
        sel.addRange(range)
      }
    }
    const dataUrl = await extractImageDataUrl(dt)
    if (dataUrl && el) {
      el.focus()
      document.execCommand('insertHTML', false, '<img src="' + dataUrl + '" style="width:300px;">')
      onCommit(el.innerHTML)
    }
    return true
  }

  function handlePaste(e) {
    if (!looksLikeImageTransfer(e.clipboardData)) return
    e.preventDefault()
    insertImageFromTransfer(e.clipboardData)
  }

  function handleDragOver(e) {
    if (looksLikeImageTransfer(e.dataTransfer)) e.preventDefault()
  }

  function handleDrop(e) {
    if (!looksLikeImageTransfer(e.dataTransfer)) return
    e.preventDefault()
    e.stopPropagation()
    insertImageFromTransfer(e.dataTransfer, { x: e.clientX, y: e.clientY })
  }

  // Click a pasted image to cycle its display width — 150/300/450/650px —
  // so a full-resolution screenshot doesn't take over the whole line.
  function handleClick(e) {
    if (e.target.tagName === 'IMG') {
      e.preventDefault()
      const current = parseInt(e.target.style.width || '300', 10) || 300
      const idx = IMAGE_SIZES.indexOf(current)
      const nextIdx = (idx < 0 ? 0 : idx + 1) % IMAGE_SIZES.length
      e.target.style.width = IMAGE_SIZES[nextIdx] + 'px'
      onCommit(ref.current.innerHTML)
    }
  }

  return (
    <div
      ref={(el) => {
        ref.current = el
        setLineRef(dataKey, el)
      }}
      className={className}
      style={style}
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder}
      data-line-key={dataKey}
      onFocus={onFocus}
      onBlur={() => onCommit(ref.current.innerHTML)}
      onKeyDown={(e) => onKeyDown(e, ref.current)}
      onMouseDown={onMouseDown}
      onClick={handleClick}
      onPaste={handlePaste}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    />
  )
}
