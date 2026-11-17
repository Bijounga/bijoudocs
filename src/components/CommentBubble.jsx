import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../state/store.js'
import { getLineEl } from '../state/lineRefs.js'
import { uid } from '../lib/id.js'
import Icon from './icons.jsx'
import { Thread } from './inspector/CommentsTab.jsx'

const lineOf = (node) => {
  const el = node && (node.nodeType === 1 ? node : node.parentElement)
  return el && el.closest ? el.closest('[data-line-key]') : null
}

const CARD_W = 292
// The column to the right of the script page where comments float, like Google Docs.
// When the script shares the window (split view) there is no room for cards beside it,
// so each comment is a small dot at the edge of the page instead, and clicking the dot
// opens its card (over what is next to it).
function marginColumn() {
  const page = document.querySelector('.editor-wrap')
  const pr = page ? page.getBoundingClientRect() : null
  // In split view the script has just its half (.editor-split-pane), not the whole .main.
  const pane = page && (page.closest('.editor-split-pane') || page.closest('.main'))
  const pm = pane ? pane.getBoundingClientRect() : { top: 0, bottom: window.innerHeight, right: window.innerWidth }
  const room = pr ? pm.right - pr.right : window.innerWidth
  if (!pr || room >= CARD_W + 24) {
    const left = pr ? Math.min(pr.right + 14, window.innerWidth - CARD_W - 12) : window.innerWidth - CARD_W - 12
    return { mode: 'cards', left: Math.max(8, left), width: CARD_W, dotLeft: 0, pane: pm }
  }
  const dotLeft = Math.round(Math.min(pr.right + 8, pm.right - 30))
  const left = Math.max(8, Math.min(dotLeft + 28, window.innerWidth - CARD_W - 12))
  return { mode: 'dots', left, width: CARD_W, dotLeft, pane: pm }
}

// Comments on the script, like Google Docs: select text in a line and a Comment button
// appears in the right margin (or press the shortcut, or use the button on the line);
// write the comment in the card that floats beside the text. The text is highlighted
// (a span carrying the thread id in the line's own HTML, so it moves with the text as
// you edit) and each open thread floats in the margin next to its text, with the whole
// list in the Comments tab. This component also keeps the highlight styles: resolved
// threads lose their highlight, the open one stands out.
export default function CommentBubble({ script }) {
  const [hasSel, setHasSel] = useState(false) // text is selected in a line: show the margin button
  const [compose, setCompose] = useState(null) // { lineKey, range, quote }
  const [text, setText] = useState('')
  const [layout, setLayout] = useState({ col: { mode: 'cards', left: 0, width: CARD_W, dotLeft: 0 }, tops: {}, dots: {}, composeTop: 0, selTop: null })
  const request = useStore((s) => s.commentRequest)
  const activeId = useStore((s) => s.activeCommentId)
  const inMargin = useStore((s) => s.commentsInMargin)
  const boxRef = useRef(null)
  const heights = useRef({})
  const raf = useRef(0)
  const composeRef = useRef(null)
  composeRef.current = compose
  const scriptId = script ? script.id : null
  const comments = script ? script.comments : null

  // Where everything sits: the margin column, each open thread beside its highlighted text
  // (pushed down so they don't overlap), the compose card and the selection button.
  function recompute() {
    cancelAnimationFrame(raf.current)
    raf.current = requestAnimationFrame(() => {
      const st = useStore.getState()
      const sc = st.scripts.find((s) => s.id === scriptId)
      if (!sc) return
      const col = marginColumn()
      const mr = col.pane
      const items = []
      if (st.commentsInMargin) {
        ;(sc.comments || []).forEach((th) => {
          if (th.resolved) return
          const el = getLineEl(th.sectionId + ':' + th.lineId)
          const hl = el && el.querySelector('[data-cmt="' + th.id + '"]')
          if (!hl) return
          const y = hl.getBoundingClientRect().top
          if (y < mr.top - 4 || y > mr.bottom - 30) return
          items.push({ id: th.id, y })
        })
      }
      items.sort((a, b) => a.y - b.y)
      const tops = {}
      const dots = {}
      if (col.mode === 'dots') {
        // A dot per comment, beside its text (not closer than a dot apart); only the open one has a card.
        let last = -1e9
        items.forEach((it) => {
          const t = Math.max(it.y + 2, last + 24)
          dots[it.id] = Math.round(t)
          last = t
        })
        const open = st.activeCommentId
        if (open && dots[open] != null) tops[open] = dots[open] - 6
      } else {
        let floor = -1e9
        items.forEach((it) => {
          const h = heights.current[it.id] || 120
          const t = Math.max(it.y, floor)
          tops[it.id] = Math.round(t)
          floor = t + h + 10
        })
      }
      let composeTop = 0
      if (composeRef.current) {
        const r = composeRef.current.range.getBoundingClientRect()
        composeTop = Math.round(Math.max(mr.top + 8, Math.min(r.top, window.innerHeight - 190)))
      }
      let selTop = null
      const s = window.getSelection()
      if (s && s.rangeCount && !s.isCollapsed) selTop = Math.round(s.getRangeAt(0).getBoundingClientRect().top)
      setLayout((prev) => {
        const next = { col: { mode: col.mode, left: col.left, width: col.width, dotLeft: col.dotLeft }, tops, dots, composeTop, selTop }
        return JSON.stringify(prev) === JSON.stringify(next) ? prev : next
      })
    })
  }

  useEffect(() => {
    const on = () => recompute()
    window.addEventListener('scroll', on, true)
    window.addEventListener('resize', on)
    document.addEventListener('input', on)
    document.addEventListener('keyup', on)
    document.addEventListener('mouseup', on)
    // The layout can change without an event of ours (split view opened, a panel toggled): look again now and then.
    const tick = setInterval(on, 700)
    return () => {
      clearInterval(tick)
      window.removeEventListener('scroll', on, true)
      window.removeEventListener('resize', on)
      document.removeEventListener('input', on)
      document.removeEventListener('keyup', on)
      document.removeEventListener('mouseup', on)
      cancelAnimationFrame(raf.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptId])
  useEffect(() => {
    recompute()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comments, activeId, inMargin, compose, hasSel, Object.keys(layout.tops).length])

  // Watches the selection: one run of text within a single line.
  useEffect(() => {
    function onSelection() {
      const s = window.getSelection()
      if (!s || s.isCollapsed || !s.rangeCount) {
        setHasSel(false)
        return
      }
      const range = s.getRangeAt(0)
      const a = lineOf(range.startContainer)
      const b = lineOf(range.endContainer)
      setHasSel(!!a && a === b && !!s.toString().trim())
    }
    document.addEventListener('selectionchange', onSelection)
    return () => document.removeEventListener('selectionchange', onSelection)
  }, [])

  // What to comment on: the text you selected in a line; failing that the word the caret is
  // in, failing that the whole line (the one you are in, or the one whose button was clicked).
  function openFromSelection(lineKeyHint) {
    const s = window.getSelection()
    let lineEl = null
    let range = null
    if (s && s.rangeCount && !s.isCollapsed) {
      const r0 = s.getRangeAt(0)
      const a = lineOf(r0.startContainer)
      const b = lineOf(r0.endContainer)
      if (a && a === b && s.toString().trim() && (!lineKeyHint || a.dataset.lineKey === lineKeyHint)) {
        lineEl = a
        range = r0.cloneRange()
      }
    }
    if (!range) {
      lineEl = lineKeyHint ? getLineEl(lineKeyHint) : lineOf(document.activeElement) || (s && s.rangeCount ? lineOf(s.getRangeAt(0).startContainer) : null)
      if (!lineEl) return false
      range = document.createRange()
      const n = s && s.rangeCount && s.isCollapsed ? s.anchorNode : null
      if (n && n.nodeType === 3 && lineEl.contains(n)) {
        const t = n.textContent
        const word = /[\p{L}\p{N}'’]/u
        let from = s.anchorOffset
        let to = from
        while (from > 0 && word.test(t[from - 1])) from--
        while (to < t.length && word.test(t[to])) to++
        if (to > from) {
          range.setStart(n, from)
          range.setEnd(n, to)
        } else range.selectNodeContents(lineEl)
      } else range.selectNodeContents(lineEl)
    }
    const quote = range.toString().replace(/\s+/g, ' ').trim()
    if (!quote) {
      useStore.getState().flashSaved('That line is empty — write something to comment on')
      return false
    }
    setCompose({ lineKey: lineEl.dataset.lineKey, range, quote })
    setText('')
    return true
  }

  // The shortcut / the button on a line.
  const firstRun = useRef(true)
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false
      return
    }
    if (!openFromSelection(useStore.getState().commentRequestLine)) useStore.getState().flashSaved('Click into a line first, then add a comment')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request])

  // Click anywhere else (or press Esc) and the selected comment lets go.
  useEffect(() => {
    if (!activeId) return undefined
    function onDown(e) {
      if (e.target.closest && e.target.closest('.cm-margin-card, .cm-thread, .cm-dot, [data-cmt]')) return
      useStore.getState().setActiveComment(null)
    }
    function onKey(e) {
      if (e.key === 'Escape' && !document.querySelector('.cm-compose')) useStore.getState().setActiveComment(null)
    }
    document.addEventListener('mousedown', onDown, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [activeId])

  // While the card is open the text it is about stays lit (the editor's own selection is lost once you type).
  useEffect(() => {
    if (!compose || typeof CSS === 'undefined' || !CSS.highlights || typeof Highlight === 'undefined') return undefined
    CSS.highlights.set('cmt-pending', new Highlight(compose.range))
    return () => CSS.highlights.delete('cmt-pending')
  }, [compose])

  useEffect(() => {
    if (!compose) return undefined
    function onDown(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setCompose(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [compose])

  function submit() {
    const t = text.trim()
    if (!t || !compose || !scriptId) return
    const st = useStore.getState()
    const [secId, lineId] = compose.lineKey.split(':')
    const el = getLineEl(compose.lineKey)
    if (!el || !el.isConnected || !el.contains(compose.range.commonAncestorContainer)) {
      st.flashSaved('That text moved — select it again')
      setCompose(null)
      return
    }
    st.pushUndo(scriptId)
    const id = uid()
    const span = document.createElement('span')
    span.setAttribute('data-cmt', id)
    try {
      span.appendChild(compose.range.extractContents())
      compose.range.insertNode(span)
    } catch (e) {
      st.flashSaved('Could not attach a comment there')
      setCompose(null)
      return
    }
    st.commitLineText(scriptId, secId, lineId, el.innerHTML)
    st.addComment(scriptId, { commentId: id, sectionId: secId, lineId, quote: compose.quote, text: t })
    st.focusComment(id)
    const s = window.getSelection()
    if (s) s.removeAllRanges()
    setCompose(null)
    setText('')
  }

  // Resolved comments lose their highlight; the open one stands out.
  const css = useMemo(() => {
    let out = '::highlight(cmt-pending){background-color:rgb(255 159 10 / 0.14)}\n'
    ;(comments || []).forEach((c) => {
      if (c.resolved) out += '.line-text [data-cmt="' + c.id + '"]{background:none;border-bottom-color:transparent;cursor:text}\n'
    })
    const active = (comments || []).find((c) => c.id === activeId)
    if (active && !active.resolved) out += '.line-text [data-cmt="' + activeId + '"]{background:color-mix(in srgb,var(--amber) 13%,transparent)}\n'
    return out
  }, [comments, activeId])

  const { col, tops, dots, composeTop, selTop } = layout
  const dotThreads = col.mode === 'dots' ? (comments || []).filter((c) => !c.resolved && dots[c.id] != null) : []
  const margin = (comments || []).filter((c) => !c.resolved && tops[c.id] != null)

  return (
    <>
      <style>{css}</style>
      {dotThreads.map((th) => (
        <button
          key={th.id}
          className={'cm-dot' + (activeId === th.id ? ' active' : '')}
          style={{ left: col.dotLeft, top: dots[th.id] }}
          title={activeId === th.id ? 'Close this comment' : 'Open this comment'}
          onClick={() => useStore.getState().setActiveComment(activeId === th.id ? null : th.id)}
        >
          <Icon name="comment" size={10} />
        </button>
      ))}
      <div className="cm-margin" style={{ left: col.left, width: col.width }}>
        {hasSel && !compose && selTop != null && (
          <button
            className="comment-bubble"
            style={{ top: Math.max(8, selTop) }}
            title="Comment on this text (Ctrl+Alt+M)"
            // Keeps the selection while you click it.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => openFromSelection()}
          >
            <Icon name="comment" size={13} />
            Comment
          </button>
        )}
        {margin.map((th) => (
          <div
            key={th.id}
            className="cm-margin-card"
            style={{ top: tops[th.id] }}
            ref={(el) => {
              if (el) heights.current[th.id] = el.offsetHeight
            }}
          >
            <Thread scriptId={scriptId} th={th} active={activeId === th.id} present compact />
          </div>
        ))}
        {compose && (
          <div className="cm-margin-card cm-compose" ref={boxRef} style={{ top: composeTop }}>
            <textarea
              className="comment-compose-input"
              autoFocus
              rows={2}
              placeholder="Add a comment…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault()
                  setCompose(null)
                } else if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  submit()
                }
              }}
            />
            <div className="cm-compose-row">
              <button className="cm-link" onClick={() => setCompose(null)}>
                Cancel
              </button>
              <button className="cm-pill" disabled={!text.trim()} onClick={submit}>
                Comment
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
