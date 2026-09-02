import React, { useEffect, useState } from 'react'

// Temporary diagnostic only — shows exactly what Electron's context-menu
// event reported for the last right-click, since that event can't be
// triggered by test automation at all (real OS mouse input only) and the
// native spellcheck-suggestions menu it's meant to drive has been reported
// not to appear. Nothing here is logged or sent anywhere; it only ever
// shows on this device's own screen. Remove once the real bug is found.
export default function SpellcheckDebugOverlay() {
  const [last, setLast] = useState(null)

  useEffect(() => {
    if (window.bijou && window.bijou.onSpellcheckDebug) {
      window.bijou.onSpellcheckDebug((payload) => setLast({ ...payload, at: new Date().toLocaleTimeString() }))
    }
  }, [])

  if (!last) return null

  return (
    <div className="spellcheck-debug-overlay">
      <div className="spellcheck-debug-title">Right-click debug (temporary)</div>
      <div>time: {last.at}</div>
      <div>misspelledWord: {JSON.stringify(last.misspelledWord)}</div>
      <div>suggestions: {JSON.stringify(last.suggestions)}</div>
      <div>isEditable: {JSON.stringify(last.isEditable)}</div>
      <button className="spellcheck-debug-close" onClick={() => setLast(null)}>
        Dismiss
      </button>
    </div>
  )
}
