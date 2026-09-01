import { useState, useCallback } from 'react'

// Shared "which edge is the drag hovering" tracker for reorder drop
// targets (lines, sections, checklist items). Renders as a thin bar via the
// `.drop-indicator-before` / `.drop-indicator-after` CSS classes on the
// element that uses it.
export function useDropIndicator() {
  const [edge, setEdge] = useState(null)

  const onDragOver = useCallback((e, accept) => {
    if (!accept(e)) return false
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    setEdge(e.clientY - rect.top > rect.height / 2 ? 'after' : 'before')
    return true
  }, [])

  const onDragLeave = useCallback(() => setEdge(null), [])
  const clear = useCallback(() => setEdge(null), [])

  return { edge, onDragOver, onDragLeave, clear }
}
