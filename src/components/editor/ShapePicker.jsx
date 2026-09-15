import React, { useEffect, useRef, useState } from 'react'
import Icon from '../icons.jsx'

export const SHAPES = [
  { id: 'rectangle', icon: 'shapeRectangle', label: 'Rectangle (Process)' },
  { id: 'diamond', icon: 'shapeDiamond', label: 'Diamond (Decision)' },
  { id: 'parallelogram', icon: 'shapeParallelogram', label: 'Parallelogram (Input/Output)' },
  { id: 'pill', icon: 'shapePill', label: 'Rounded pill (Start/End)' }
]

// A small button showing the current shape, opening a 4-icon row to pick
// a different one — same lightweight popover pattern as the map's own
// idea-preset dropdown, not a full modal. Used both on a live idea node
// (change its shape anytime, same as its color already can) and in the
// preset manager (bundle a shape into a preset).
export default function ShapePicker({ value, onChange, className }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const current = SHAPES.find((s) => s.id === value) || SHAPES[0]

  useEffect(() => {
    if (!open) return
    function onDocMouseDown(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [open])

  return (
    <div className={'shape-picker-wrap' + (className ? ' ' + className : '')} ref={ref}>
      <button
        className="shape-picker-btn"
        title="Change shape"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
      >
        <Icon name={current.icon} size={13} />
      </button>
      {open && (
        <div className="shape-picker-menu" onMouseDown={(e) => e.stopPropagation()}>
          {SHAPES.map((s) => (
            <button
              key={s.id}
              className={'shape-picker-option' + (s.id === value ? ' active' : '')}
              title={s.label}
              onClick={(e) => {
                e.stopPropagation()
                onChange(s.id)
                setOpen(false)
              }}
            >
              <Icon name={s.icon} size={14} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
