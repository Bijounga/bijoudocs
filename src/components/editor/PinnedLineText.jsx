import React, { useEffect, useRef } from 'react'

// A second, independent editable copy of a line's rich text for the pinned
// margin — deliberately does NOT register in state/lineRefs.js's shared
// registry the way LineText.jsx does, since that registry assumes exactly
// one live element per line key; a second registrant would just steal
// focus-targeting for keybinds/undo away from whichever one mounted last.
// Kept minimal on purpose: syncs on blur like the main editor, but skips
// the main editor's Enter-splits/Tab-indents/image-paste — this is a quick
// read-and-tweak reference, not a second full line editor.
export default function PinnedLineText({ value, onCommit, onFocus }) {
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (document.activeElement !== el && el.innerHTML !== (value || '')) {
      el.innerHTML = value || ''
    }
  }, [value])

  return (
    <div
      ref={ref}
      className="pinned-line-text"
      contentEditable
      suppressContentEditableWarning
      data-placeholder="Write a line…"
      onFocus={onFocus}
      onBlur={() => onCommit(ref.current.innerHTML)}
    />
  )
}
