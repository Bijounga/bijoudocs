import React, { useEffect, useRef, useState } from 'react'
import { useStore } from '../state/store.js'
import { comboFromEvent } from '../lib/keybinds.js'
import { noteToHtml, htmlToNote, getPad } from '../lib/scratchNotes.js'
import Icon from './icons.jsx'

// A floating notepad for throwaway notes on the open script. Summoned from
// the tab bar / map toolbar or its keybind; it stays put (position, size,
// text zoom, ruled lines and whether it's showing are remembered) until you
// × it away. It has tabs — pages of notes — and each script has its own set,
// kept in the app's settings rather than the script file; closing the pad
// keeps every page. Bold and italic are allowed.
//
// The text area is an uncontrolled contentEditable, like a script line
// (see LineText.jsx): its markup is set from the store when the pad opens,
// the script changes or the tab changes, never while you type, so the cursor
// is never fought over.

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

export default function Scratchpad({ script }) {
  const pad = useStore((s) => s.scratchpad)
  const scriptId = script ? script.id : null
  const book = useStore((s) => getPad(s.scratchPads, scriptId))
  const setText = useStore((s) => s.setScratchText)
  const flush = useStore((s) => s.flushScratchpad)
  const closePad = useStore((s) => s.closeScratchpad)
  const setRect = useStore((s) => s.setScratchpadRect)
  const zoomPad = useStore((s) => s.zoomScratchpad)
  const toggleLines = useStore((s) => s.toggleScratchpadLines)
  const setTab = useStore((s) => s.setScratchTab)
  const addTab = useStore((s) => s.addScratchTab)
  const renameTab = useStore((s) => s.renameScratchTab)
  const closeTab = useStore((s) => s.closeScratchTab)
  const keybinds = useStore((s) => s.keybinds)
  const keybind = keybinds.toggleScratchpad

  const boxRef = useRef(null)
  const areaRef = useRef(null)
  const tabsRef = useRef(null)
  const wasOpen = useRef(pad.open)
  const [live, setLive] = useState(null) // position while dragging
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight })
  const [fmt, setFmt] = useState({ bold: false, italic: false })
  const [renaming, setRenaming] = useState(null) // tab id being renamed
  const renameDone = useRef(false) // Enter / Escape already decided; the blur that follows must not redo it

  const activeTab = book.tabs.find((t) => t.id === book.active) || book.tabs[0]
  const activeId = activeTab.id

  useEffect(() => {
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    window.addEventListener('beforeunload', flush)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('beforeunload', flush)
    }
  }, [flush])

  function focusEnd() {
    const el = areaRef.current
    if (!el) return
    el.focus()
    const range = document.createRange()
    range.selectNodeContents(el)
    range.collapse(false)
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(range)
  }

  // Put the tab's note into the editor when the pad opens, the script
  // changes or another tab is picked — and only then.
  useEffect(() => {
    const el = areaRef.current
    if (!el || !scriptId) return
    const tab = getPad(useStore.getState().scratchPads, scriptId)
    const cur = tab.tabs.find((t) => t.id === tab.active) || tab.tabs[0]
    el.innerHTML = noteToHtml(cur.body)
  }, [pad.open, scriptId, activeId])

  // Opening it puts the cursor in, at the end (not when it was already open
  // at launch, which shouldn't steal focus from the script).
  useEffect(() => {
    if (pad.open && !wasOpen.current) focusEnd()
    wasOpen.current = pad.open
  }, [pad.open])

  // The picked tab stays in view when there are more tabs than fit.
  useEffect(() => {
    const strip = tabsRef.current
    const el = strip && strip.querySelector('.scratchpad-tab.active')
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [pad.open, activeId, book.tabs.length])

  // Which formats are on at the cursor, for the B / I buttons.
  useEffect(() => {
    if (!pad.open) return
    const onSel = () => {
      const el = areaRef.current
      const sel = window.getSelection()
      if (!el || !sel.rangeCount || !el.contains(sel.anchorNode)) return
      const bold = document.queryCommandState('bold')
      const italic = document.queryCommandState('italic')
      setFmt((f) => (f.bold === bold && f.italic === italic ? f : { bold, italic }))
    }
    document.addEventListener('selectionchange', onSel)
    return () => document.removeEventListener('selectionchange', onSel)
  }, [pad.open])

  // Ctrl+scroll over the text zooms it. A native listener, since React's
  // wheel handlers are passive and couldn't stop the page zoom.
  useEffect(() => {
    const el = areaRef.current
    if (!el) return
    const onWheel = (e) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      e.stopPropagation()
      zoomPad(e.deltaY < 0 ? 0.1 : -0.1)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [pad.open, zoomPad])

  // Dragging its corner to resize: remember the new size once it settles.
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    let t
    const ro = new ResizeObserver(() => {
      clearTimeout(t)
      t = setTimeout(() => {
        const w = Math.round(el.offsetWidth)
        const h = Math.round(el.offsetHeight)
        const cur = useStore.getState().scratchpad
        if (Math.abs(w - cur.w) > 1 || Math.abs(h - cur.h) > 1) setRect({ w, h })
      }, 300)
    })
    ro.observe(el)
    return () => {
      ro.disconnect()
      clearTimeout(t)
    }
  }, [pad.open, setRect])

  if (!pad.open || !script) return null

  function save() {
    const el = areaRef.current
    if (!el) return
    // A cleared editor can keep a lone <br>; treat that as empty.
    if (!el.textContent && el.innerHTML) el.innerHTML = ''
    setText(scriptId, htmlToNote(el.innerHTML))
  }

  function format(command) {
    const el = areaRef.current
    if (!el) return
    if (document.activeElement !== el) el.focus()
    document.execCommand(command)
    save()
  }

  function onKeyDown(e) {
    const combo = comboFromEvent(e)
    // Follows the app's bold / italic keys (rebindable), not just Ctrl+B / I.
    if (combo === keybinds.bold) {
      e.preventDefault()
      format('bold')
    } else if (combo === keybinds.italic) {
      e.preventDefault()
      format('italic')
    } else if (combo === 'ctrl+b' || combo === 'ctrl+i' || combo === 'ctrl+u') {
      // The browser's own formatting keys: if bold / italic were rebound
      // they must not also work here, and underline isn't kept at all.
      e.preventDefault()
    }
  }

  // Pasted text goes in as plain text — no outside styles, links or images.
  function onPaste(e) {
    e.preventDefault()
    const text = e.clipboardData.getData('text/plain')
    if (text) document.execCommand('insertText', false, text)
  }

  function pickTab(id) {
    if (id === activeId) return
    flush()
    setTab(scriptId, id)
    requestAnimationFrame(focusEnd)
  }

  function startRename(id) {
    renameDone.current = false
    setRenaming(id)
  }

  // Enter and blur keep the name, Escape drops it.
  function endRename(tab, value, keep) {
    if (renameDone.current) return
    renameDone.current = true
    if (keep) renameTab(scriptId, tab.id, value)
    setRenaming(null)
    requestAnimationFrame(focusEnd)
  }

  function newTab() {
    flush()
    addTab(scriptId)
    requestAnimationFrame(focusEnd)
  }

  function dropTab(e, tab) {
    e.stopPropagation()
    const hasText = !!(tab.body && tab.body.length)
    if (hasText && !window.confirm('Close "' + tab.name + '"? Its notes will be deleted.')) return
    flush()
    closeTab(scriptId, tab.id)
    // Clearing the only page keeps the same tab, so the editor isn't reloaded for it.
    if (book.tabs.length === 1 && areaRef.current) areaRef.current.innerHTML = ''
  }

  // Bottom-right until it's been moved; always keep part of the header on screen.
  const clampPos = (p) => ({ x: clamp(p.x, 100 - pad.w, vp.w - 100), y: clamp(p.y, 0, vp.h - 44) })
  const home = { x: vp.w - pad.w - 28, y: vp.h - pad.h - 44 }
  const pos = clampPos(live || (pad.x == null ? home : { x: pad.x, y: pad.y }))

  function startDrag(e) {
    if (e.button !== 0 || e.target.closest('button')) return
    e.preventDefault()
    const sx = e.clientX
    const sy = e.clientY
    const origin = pos
    let last = origin
    const move = (ev) => {
      last = clampPos({ x: origin.x + ev.clientX - sx, y: origin.y + ev.clientY - sy })
      setLive(last)
    }
    const up = () => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
      setLive(null)
      setRect(last)
    }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
  }

  return (
    <div
      ref={boxRef}
      className={'scratchpad' + (pad.lines ? ' ruled' : '')}
      style={{ left: pos.x, top: pos.y, width: pad.w, height: pad.h, '--pad-zoom': pad.zoom }}
    >
      <div className="scratchpad-head" onMouseDown={startDrag} onDoubleClick={() => setRect({ x: null, y: null })} title="Drag to move — double-click to put it back in the corner">
        <Icon name="pad" size={13} />
        <span className="scratchpad-title">Notepad · {script.title || 'Untitled'}</span>
        <button
          className={'icon-btn tb-icon' + (pad.lines ? ' active' : '')}
          onClick={toggleLines}
          title={pad.lines ? 'Hide the ruled lines' : 'Show ruled lines'}
        >
          <Icon name="menu" size={12} />
        </button>
        <button className="icon-btn tb-icon scratchpad-close" onClick={closePad} title={'Put the notepad away — your notes stay (' + keybind + ')'}>
          <Icon name="x" size={12} />
        </button>
      </div>

      <div className="scratchpad-tabs">
        <div className="scratchpad-tabscroll" ref={tabsRef} role="tablist">
          {book.tabs.map((t) => (
            <div
              key={t.id}
              role="tab"
              aria-selected={t.id === activeId}
              className={'scratchpad-tab' + (t.id === activeId ? ' active' : '')}
              onClick={() => pickTab(t.id)}
              onDoubleClick={() => startRename(t.id)}
              title={t.name + ' — double-click to rename'}
            >
              {renaming === t.id ? (
                <input
                  className="scratchpad-tab-input"
                  autoFocus
                  defaultValue={t.name}
                  maxLength={24}
                  spellCheck={false}
                  onClick={(e) => e.stopPropagation()}
                  onFocus={(e) => e.target.select()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') endRename(t, e.target.value, true)
                    else if (e.key === 'Escape') endRename(t, '', false)
                  }}
                  onBlur={(e) => endRename(t, e.target.value, true)}
                />
              ) : (
                <span className="scratchpad-tab-name">{t.name}</span>
              )}
              <button className="scratchpad-tab-x" onClick={(e) => dropTab(e, t)} title={book.tabs.length === 1 ? 'Clear this page' : 'Close this page'}>
                <Icon name="x" size={9} />
              </button>
            </div>
          ))}
        </div>
        <button className="icon-btn tb-icon scratchpad-newtab" onClick={newTab} title="New page">
          <Icon name="plus" size={11} />
        </button>
      </div>

      <div
        ref={areaRef}
        className="scratchpad-text"
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        role="textbox"
        aria-multiline="true"
        data-placeholder="Throwaway notes for this script…"
        onInput={save}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onDrop={(e) => e.preventDefault()}
        onBlur={flush}
      />

      <div className="scratchpad-foot">
        {/* mousedown is stopped so the click doesn't take the cursor (and the selection) out of the text */}
        <span className="scratchpad-fmt">
          <button
            className={'icon-btn tb-icon' + (fmt.bold ? ' active' : '')}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => format('bold')}
            title={'Bold (' + keybinds.bold + ')'}
          >
            <b>B</b>
          </button>
          <button
            className={'icon-btn tb-icon' + (fmt.italic ? ' active' : '')}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => format('italic')}
            title={'Italic (' + keybinds.italic + ')'}
          >
            <i>I</i>
          </button>
        </span>
        <span className="scratchpad-zoom">
          <button className="icon-btn tb-icon" onClick={() => zoomPad(-0.1)} disabled={pad.zoom <= 0.7} title="Smaller text">
            <Icon name="minus" size={11} />
          </button>
          <button className="scratchpad-zoom-value" onClick={() => zoomPad(null)} title="Text size — click to reset (or Ctrl+scroll over the notes)">
            {Math.round(pad.zoom * 100)}%
          </button>
          <button className="icon-btn tb-icon" onClick={() => zoomPad(0.1)} disabled={pad.zoom >= 3} title="Bigger text">
            <Icon name="plus" size={11} />
          </button>
        </span>
      </div>
    </div>
  )
}
