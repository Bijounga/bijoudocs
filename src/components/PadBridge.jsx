import { useEffect, useRef } from 'react'
import { useStore } from '../state/store.js'
import { getPad } from '../lib/scratchNotes.js'

// Runs in the app window: opens / closes the notepad's window (a window owned by this
// one, so it minimises, restores and closes with the app) when the notepad is set to be
// outside the app, keeps that window's copy of the notes, theme and keys up to date, and
// takes the edits and button presses it sends back. See PadWindowApp.jsx and
// electron/main/padWindow.js.
function snapshot() {
  const st = useStore.getState()
  const sc = st.scripts.find((s) => s.id === st.currentScriptId)
  const root = document.documentElement
  const attrs = {}
  ;['data-theme', 'data-variant', 'data-editor-contrast'].forEach((k) => {
    if (root.getAttribute(k)) attrs[k] = root.getAttribute(k)
  })
  return {
    scriptId: sc ? sc.id : null,
    title: sc ? sc.title : '',
    scratchpad: { zoom: st.scratchpad.zoom, lines: st.scratchpad.lines },
    book: sc ? JSON.parse(JSON.stringify(getPad(st.scratchPads, sc.id))) : null,
    keybinds: { bold: st.keybinds.bold, italic: st.keybinds.italic, toggleScratchpad: st.keybinds.toggleScratchpad },
    root: { attrs, style: root.getAttribute('style') || '' }
  }
}

export default function PadBridge({ script }) {
  const pad = useStore((s) => s.scratchpad)
  const api = window.bijou
  const want = !!(api && api.padOpen) && pad.open && pad.detached && !!script
  const skipNext = useRef(false) // a change that came from the pad window must not be sent back to it

  // Open / close its window.
  useEffect(() => {
    if (!api || !api.padOpen) return
    if (want) {
      const p = useStore.getState().scratchpad
      const rect = { x: p.x == null ? window.innerWidth - p.w - 28 : p.x, y: p.y == null ? window.innerHeight - p.h - 44 : p.y, w: p.w, h: p.h }
      api.padOpen(p.win, rect, snapshot())
    } else {
      api.padClose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [want])

  // Keep its copy current.
  useEffect(() => {
    if (!want) return undefined
    let t
    const push = () => {
      clearTimeout(t)
      t = setTimeout(() => api.padPush(snapshot()), 80)
    }
    const titleOf = (st) => {
      const sc = st.scripts.find((s) => s.id === st.currentScriptId)
      return sc ? sc.title : ''
    }
    const unsub = useStore.subscribe((st, prev) => {
      if (skipNext.current) return
      if (
        st.scratchPads !== prev.scratchPads ||
        st.scratchpad.zoom !== prev.scratchpad.zoom ||
        st.scratchpad.lines !== prev.scratchpad.lines ||
        st.currentScriptId !== prev.currentScriptId ||
        st.keybinds !== prev.keybinds ||
        titleOf(st) !== titleOf(prev)
      ) {
        push()
      }
    })
    // The theme lives in attributes on <html> (set by App.jsx).
    const mo = new MutationObserver(push)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'data-theme', 'data-variant', 'data-editor-contrast'] })
    return () => {
      clearTimeout(t)
      unsub()
      mo.disconnect()
    }
  }, [want, api])

  // What it sends back.
  useEffect(() => {
    if (!api || !api.onPadFromWindow) return undefined
    const offs = [
      api.onPadFromWindow((p) => {
        skipNext.current = true
        useStore.getState().applyPadFromWindow(p)
        skipNext.current = false
      }),
      api.onPadCommand((cmd) => {
        const st = useStore.getState()
        if (cmd === 'close') st.closeScratchpad()
        else if (cmd === 'dock') st.dockScratchpad()
      }),
      api.onPadBounds((b) => useStore.getState().setPadWindowBounds(b)),
      // Closed from outside (Alt+F4 on it): the notepad is put away, the notes stay.
      api.onPadClosed(() => {
        const st = useStore.getState()
        if (st.scratchpad.open && st.scratchpad.detached) st.closeScratchpad()
      })
    ]
    return () => offs.forEach((off) => off && off())
  }, [api])

  return null
}
