// Click-and-drag range selection across line-text elements (mousedown on a
// line, drag over others). Kept as plain module state — like the
// prototype's own `dragActive`/`dragAnchorKey`/`dragMoved` variables —
// since it's transient pointer-tracking state, not app data.
import { useStore } from './store.js'

let dragActive = false
let dragAnchorKey = null
let dragMoved = false

export function beginLineDragSelect(key) {
  dragActive = true
  dragAnchorKey = key
  dragMoved = false
}

// Call once (e.g. in App.jsx). Returns a cleanup function. Always reads the
// current script id fresh from the store rather than a closed-over value.
export function installGlobalDragSelectListeners() {
  function onMouseMove(e) {
    if (!dragActive) return
    const el = document.elementFromPoint(e.clientX, e.clientY)
    const lineEl = el && el.closest && el.closest('.line-text')
    if (lineEl && lineEl.dataset.lineKey !== dragAnchorKey) {
      if (!dragMoved) {
        window.getSelection().removeAllRanges()
        document.body.style.userSelect = 'none'
      }
      dragMoved = true
      const scriptId = useStore.getState().currentScriptId
      if (scriptId) {
        useStore.getState().rangeSelectLines(scriptId, dragAnchorKey, lineEl.dataset.lineKey)
        window.getSelection().removeAllRanges()
      }
    }
  }
  function onMouseUp() {
    if (dragActive && dragMoved) {
      window.getSelection().removeAllRanges()
      const ae = document.activeElement
      if (ae && ae.blur) ae.blur()
    }
    document.body.style.userSelect = ''
    dragActive = false
    dragMoved = false
  }
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
  return () => {
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }
}
