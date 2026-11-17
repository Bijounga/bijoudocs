import React, { useEffect, useRef, useState } from 'react'
import { useStore } from '../../state/store.js'
import { getLineEl } from '../../state/lineRefs.js'
import { commentIdsIn } from '../../lib/html.js'
import Icon from '../icons.jsx'

function ago(at) {
  const s = Math.max(0, (Date.now() - at) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return Math.floor(s / 60) + 'm ago'
  if (s < 86400) return Math.floor(s / 3600) + 'h ago'
  if (s < 86400 * 7) return Math.floor(s / 86400) + 'd ago'
  return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// Scrolls the script to a comment's highlighted text and flashes it.
function showInScript(scriptId, th) {
  const key = th.sectionId + ':' + th.lineId
  const go = () => {
    const el = getLineEl(key)
    const hl = el && el.querySelector('[data-cmt="' + th.id + '"]')
    if (!hl) return false
    hl.scrollIntoView({ block: 'center', behavior: 'smooth' })
    hl.classList.add('cmt-flash')
    setTimeout(() => hl.classList.remove('cmt-flash'), 1500)
    return true
  }
  if (!go()) {
    // Not on screen (another tab or section): bring it up, then try again.
    useStore.getState().jumpToSection(scriptId, th.sectionId, false)
    setTimeout(go, 250)
  }
}

// One comment thread. `compact` is the quiet card that floats in the margin beside the
// text (the text is right there, so no quote; resolve/delete appear in its corner when
// you hover it, and the reply box only once it is the one you are looking at).
export function Thread({ scriptId, th, active, present, compact }) {
  const reply = useStore((s) => s.replyToComment)
  const toggleResolved = useStore((s) => s.toggleCommentResolved)
  const del = useStore((s) => s.deleteComment)
  const delMsg = useStore((s) => s.deleteCommentMessage)
  const setActive = useStore((s) => s.setActiveComment)
  const [draft, setDraft] = useState('')
  const [replying, setReplying] = useState(false)

  function send() {
    if (!draft.trim()) return
    reply(scriptId, th.id, draft)
    setDraft('')
  }
  function remove() {
    if (th.messages.length > 1 && !window.confirm('Delete this comment and its ' + (th.messages.length - 1) + ' repl' + (th.messages.length === 2 ? 'y' : 'ies') + '?')) return
    del(scriptId, th.id)
  }
  const showReply = !th.resolved && (compact ? active : true)

  return (
    <div
      className={'cm-thread' + (active ? ' active' : '') + (th.resolved ? ' resolved' : '') + (compact ? ' compact' : '')}
      data-thread={th.id}
      onClick={() => {
        setActive(th.id)
        if (present && !compact) showInScript(scriptId, th)
      }}
    >
      {!compact && (
        <div className={'cm-quote' + (present ? '' : ' gone')} title={present ? 'Click to find it in the script' : 'The commented text was deleted'}>
          {present ? '“' + (th.quote.length > 140 ? th.quote.slice(0, 138) + '…' : th.quote) + '”' : 'Text deleted — “' + th.quote.slice(0, 60) + '”'}
        </div>
      )}
      {(th.resolved ? th.messages.slice(0, 1) : th.messages).map((m) => (
        <div className="cm-msg" key={m.id}>
          <div className="cm-msg-body">
            <div className="cm-text">{m.text}</div>
            {!compact && <div className="cm-time">{ago(m.at)}</div>}
          </div>
          {!compact && th.messages.length > 1 && (
            <button
              className="cm-x"
              title="Delete this message"
              onClick={(e) => {
                e.stopPropagation()
                delMsg(scriptId, th.id, m.id)
              }}
            >
              <Icon name="x" size={10} />
            </button>
          )}
        </div>
      ))}
      {th.resolved && th.messages.length > 1 && <div className="cm-more">+ {th.messages.length - 1} more</div>}
      {showReply && (
        <div className="cm-reply" onClick={(e) => e.stopPropagation()}>
          {replying || draft ? (
            <textarea
              className="cm-reply-input"
              autoFocus={replying}
              rows={1}
              placeholder="Reply…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => !draft && setReplying(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send()
                } else if (e.key === 'Escape') {
                  setDraft('')
                  setReplying(false)
                }
              }}
            />
          ) : (
            <button className="cm-reply-fake" onClick={() => setReplying(true)}>
              Reply…
            </button>
          )}
        </div>
      )}
      {compact ? (
        <div className="cm-corner" onClick={(e) => e.stopPropagation()}>
          <button className="cm-corner-btn" title={th.resolved ? 'Reopen' : 'Resolve'} onClick={() => toggleResolved(scriptId, th.id)}>
            <Icon name="check" size={12} />
          </button>
          <button className="cm-corner-btn danger" title="Delete" onClick={remove}>
            <Icon name="x" size={11} />
          </button>
        </div>
      ) : (
        <div className="cm-actions" onClick={(e) => e.stopPropagation()}>
          <button className="comment-btn" onClick={() => toggleResolved(scriptId, th.id)}>
            <Icon name="check" size={11} />
            {th.resolved ? 'Reopen' : 'Resolve'}
          </button>
          <button className="comment-btn danger" onClick={remove}>
            Delete
          </button>
        </div>
      )}
    </div>
  )
}

export default function CommentsTab({ scriptId, script }) {
  const activeId = useStore((s) => s.activeCommentId)
  const showResolved = useStore((s) => s.commentsShowResolved)
  const toggleShowResolved = useStore((s) => s.toggleCommentsShowResolved)
  const inMargin = useStore((s) => s.commentsInMargin)
  const toggleInMargin = useStore((s) => s.toggleCommentsInMargin)
  const listRef = useRef(null)

  // Threads in the order their text appears in the script; which are still attached to text.
  const comments = script.comments || []
  const order = new Map()
  const present = new Set()
  let i = 0
  script.sections.forEach((sec) =>
    sec.lines.forEach((l) => {
      order.set(sec.id + ':' + l.id, i++)
      commentIdsIn(l.text).forEach((id) => present.add(id))
    })
  )
  const pos = (c) => (order.has(c.sectionId + ':' + c.lineId) ? order.get(c.sectionId + ':' + c.lineId) : 1e9)
  const sorted = [...comments].sort((a, b) => pos(a) - pos(b) || a.createdAt - b.createdAt)
  const open = sorted.filter((c) => !c.resolved)
  const done = sorted.filter((c) => c.resolved)

  // A highlight was clicked in the script: bring its card into view.
  useEffect(() => {
    if (!activeId || !listRef.current) return
    const el = listRef.current.querySelector('[data-thread="' + activeId + '"]')
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [activeId, comments.length])

  return (
    <div className="cm-tab">
      <div className="cm-head">
        <div className="cm-title">
          {open.length} open comment{open.length === 1 ? '' : 's'}
        </div>
        {done.length > 0 && (
          <button className={'comment-btn' + (showResolved ? ' active' : '')} onClick={toggleShowResolved}>
            {showResolved ? 'Hide' : 'Show'} {done.length} resolved
          </button>
        )}
      </div>
      <label className="cm-toggle" title="Show each open comment next to its text, in the margin of the page">
        <input type="checkbox" checked={inMargin} onChange={toggleInMargin} />
        Show comments in the page margin
      </label>
      <div className="cm-list" ref={listRef}>
        {comments.length === 0 && (
          <div className="cm-empty">
            <Icon name="comment" size={22} />
            <p>No comments yet.</p>
            <p>Select some text in a line, then click the <b>Comment</b> button that appears (or press Ctrl+Alt+M).</p>
          </div>
        )}
        {open.map((th) => (
          <Thread key={th.id} scriptId={scriptId} th={th} active={activeId === th.id} present={present.has(th.id)} />
        ))}
        {showResolved && done.map((th) => <Thread key={th.id} scriptId={scriptId} th={th} active={activeId === th.id} present={present.has(th.id)} />)}
      </div>
    </div>
  )
}
