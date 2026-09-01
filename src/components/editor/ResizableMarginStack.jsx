import React, { useRef } from 'react'
import { useStore } from '../../state/store.js'

// Wraps a stack of MarginPanels with a drag handle on the edge facing the
// editor, and makes the stack sticky so it stays in view while the (often
// much taller) editor column scrolls past it. `anyOpen` tells us whether
// any panel inside is currently expanded — when every panel in the stack
// is collapsed there's nothing to resize, so we shrink the whole stack
// down to the collapsed-strip width and hide the handle instead of
// leaving it stranded out at the old expanded width.
export default function ResizableMarginStack({ side, children, anyOpen }) {
  const width = useStore((s) => (side === 'left' ? s.leftMarginWidth : s.rightMarginWidth))
  const setWidth = useStore((s) => (side === 'left' ? s.setLeftMarginWidth : s.setRightMarginWidth))
  const dragRef = useRef(null)

  function handleMouseDown(e) {
    dragRef.current = { startX: e.clientX, startWidth: width }
    function onMouseMove(ev) {
      const d = dragRef.current
      if (!d) return
      const delta = side === 'left' ? ev.clientX - d.startX : d.startX - ev.clientX
      setWidth(d.startWidth + delta)
    }
    function onMouseUp() {
      dragRef.current = null
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  return (
    <div className={'margin-stack-outer ' + side} style={{ width: anyOpen ? width : 26 }}>
      <div className="margin-stack">{children}</div>
      {anyOpen && (
        <div className={'margin-resize-handle ' + side} onMouseDown={handleMouseDown} title="Drag to resize" />
      )}
    </div>
  )
}
