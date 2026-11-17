import React, { useEffect, useState } from 'react'
import { useStore } from '../state/store.js'
import { getPad } from '../lib/scratchNotes.js'
import Scratchpad from './Scratchpad.jsx'

// What the notepad's own window shows (outside the app window: loaded with #notepad,
// see main.jsx and electron/main/padWindow.js). It is the same notepad component with
// a store of its own that is only a mirror: the app window owns the real notes and
// settings, pushes them here, and gets the edits back (relayed by the main process).

let currentScriptId = null
let dirty = false // edits made here not yet sent to the app window

function applyRoot(root) {
  if (!root) return
  const el = document.documentElement
  ;['data-theme', 'data-variant', 'data-editor-contrast'].forEach((k) => {
    if (root.attrs && root.attrs[k]) el.setAttribute(k, root.attrs[k])
    else el.removeAttribute(k)
  })
  el.setAttribute('style', root.style || '')
}

export default function PadWindowApp() {
  const [script, setScript] = useState(null)

  useEffect(() => {
    document.documentElement.classList.add('pad-window')
    document.title = 'Notepad'
    let timer
    // The store's own "save settings" is how every notepad action says it changed
    // something: here that means "tell the app window".
    const relay = () => {
      dirty = true
      clearTimeout(timer)
      timer = setTimeout(() => {
        const st = useStore.getState()
        if (!currentScriptId) return
        window.bijou.padSend({
          scriptId: currentScriptId,
          book: JSON.parse(JSON.stringify(getPad(st.scratchPads, currentScriptId))),
          scratchpad: { zoom: st.scratchpad.zoom, lines: st.scratchpad.lines }
        })
        dirty = false
      }, 120)
    }
    useStore.setState({ saveAppSettings: relay })

    function apply(snap) {
      if (!snap) return
      applyRoot(snap.root)
      currentScriptId = snap.scriptId
      useStore.setState((s) => {
        // Edits made here that the app window has not heard yet win over what it sends.
        if (!dirty) s.scratchPads[snap.scriptId] = snap.book
        s.scratchpad.open = true
        s.scratchpad.detached = true
        s.scratchpad.zoom = snap.scratchpad.zoom
        s.scratchpad.lines = snap.scratchpad.lines
        s.keybinds = { ...s.keybinds, ...snap.keybinds }
      })
      setScript({ id: snap.scriptId, title: snap.title })
    }
    window.bijou.padGetInit().then(apply)
    const off = window.bijou.onPadSnapshot(apply)
    const flush = () => {
      if (dirty) relay()
    }
    window.addEventListener('beforeunload', flush)
    return () => {
      off && off()
      window.removeEventListener('beforeunload', flush)
      clearTimeout(timer)
    }
  }, [])

  if (!script) return null
  return <Scratchpad script={script} mode="window" />
}
