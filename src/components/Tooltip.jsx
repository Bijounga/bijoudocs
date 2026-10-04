import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'

// App-wide themed tooltip. Chromium's native `title` tooltip is drawn by the
// OS in its own colors and ignores the app's theme entirely, so instead of
// touching every component this takes over *every* `title` attribute in the
// document: on hover the attribute is moved to `data-tip` (which suppresses
// the native tooltip) and shown here, then put back on leave so React's own
// view of the DOM stays accurate for the rest of the time.
//
// A trailing "(Ctrl+Z)"-style suffix is split out and rendered as a key chip.

const SHOW_DELAY = 450
const WARM_WINDOW = 500 // moving between buttons right after a tip shows it instantly
const GAP = 7
const EDGE = 6

function splitShortcut(text) {
  const m = text.match(/^([\s\S]*?)\s*\(([^()\s]{1,24})\)$/)
  if (!m) return { body: text, key: null }
  const inner = m[2]
  const looksLikeKey = inner.includes('+') || inner.length <= 3 || /^F\d{1,2}$/.test(inner)
  return looksLikeKey && m[1] ? { body: m[1], key: prettyKey(inner) } : { body: text, key: null }
}

// Stored keybinds are lowercase ("ctrl+shift+m") — show them as "Ctrl+Shift+M".
function prettyKey(combo) {
  if (combo.length <= 1) return combo.toUpperCase()
  return combo
    .split('+')
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : '+'))
    .join('+')
    .replace(/\+\+\+/, '++')
}

function findTarget(node) {
  while (node && node.nodeType === 1) {
    if (node.tagName !== 'title' && (node.hasAttribute('title') || node.hasAttribute('data-tip'))) return node
    node = node.parentNode
  }
  return null
}

export default function Tooltip() {
  const [tip, setTip] = useState(null) // { text, rect }
  const [pos, setPos] = useState(null)
  const boxRef = useRef(null)

  useEffect(() => {
    let current = null
    let timer = null
    let lastHiddenAt = 0
    let visible = false

    function claim(el) {
      const t = el.getAttribute('title')
      if (t != null) {
        el.setAttribute('data-tip', t)
        el.removeAttribute('title')
      }
      return el.getAttribute('data-tip')
    }
    function release(el) {
      if (!el || !el.hasAttribute('data-tip')) return
      if (!el.hasAttribute('title')) el.setAttribute('title', el.getAttribute('data-tip'))
      el.removeAttribute('data-tip')
    }
    function hide() {
      clearTimeout(timer)
      if (visible) lastHiddenAt = Date.now()
      visible = false
      setTip(null)
    }
    function show(el) {
      if (!el.isConnected) return hide()
      const text = el.getAttribute('data-tip')
      if (!text) return hide()
      visible = true
      setTip({ text, rect: el.getBoundingClientRect() })
    }
    function onOver(e) {
      const el = findTarget(e.target)
      if (el === current) return
      release(current)
      current = el
      clearTimeout(timer)
      const text = el ? claim(el) : null
      if (!text) return hide()
      const warm = visible || Date.now() - lastHiddenAt < WARM_WINDOW
      if (visible) {
        visible = false
        setTip(null)
        lastHiddenAt = Date.now()
      }
      timer = setTimeout(() => show(el), warm ? 0 : SHOW_DELAY)
    }
    function onOut(e) {
      // Leaving the window entirely (relatedTarget null) — nothing else
      // will fire a mouseover to clean up.
      if (!e.relatedTarget) {
        release(current)
        current = null
        hide()
      }
    }
    function dismiss() {
      clearTimeout(timer)
      if (visible) hide()
    }

    // React may set a new `title` on an element while it's hovered (e.g. a
    // toggle whose description flips after a click) — claim it immediately
    // so the native tooltip can't sneak through, and refresh the text.
    const observer = new MutationObserver((records) => {
      for (const r of records) {
        const el = r.target
        if (el === current && el.hasAttribute('title')) {
          claim(el)
          if (visible) show(el)
        }
      }
    })
    observer.observe(document.body, { attributes: true, attributeFilter: ['title'], subtree: true })

    document.addEventListener('mouseover', onOver, true)
    document.addEventListener('mouseout', onOut, true)
    document.addEventListener('mousedown', dismiss, true)
    document.addEventListener('keydown', dismiss, true)
    document.addEventListener('wheel', dismiss, { capture: true, passive: true })
    window.addEventListener('blur', dismiss)
    return () => {
      observer.disconnect()
      release(current)
      clearTimeout(timer)
      document.removeEventListener('mouseover', onOver, true)
      document.removeEventListener('mouseout', onOut, true)
      document.removeEventListener('mousedown', dismiss, true)
      document.removeEventListener('keydown', dismiss, true)
      document.removeEventListener('wheel', dismiss, { capture: true })
      window.removeEventListener('blur', dismiss)
    }
  }, [])

  // Measure, then place below the target (above if it would run off the
  // bottom), clamped inside the window horizontally.
  useLayoutEffect(() => {
    if (!tip || !boxRef.current) return setPos(null)
    const box = boxRef.current.getBoundingClientRect()
    const { rect } = tip
    let top = rect.bottom + GAP
    let below = true
    if (top + box.height > window.innerHeight - EDGE) {
      top = rect.top - GAP - box.height
      below = false
    }
    let left = rect.left + rect.width / 2 - box.width / 2
    left = Math.max(EDGE, Math.min(left, window.innerWidth - box.width - EDGE))
    setPos({ top: Math.max(EDGE, top), left, below, tip })
  }, [tip])

  if (!tip) return null
  const { body, key } = splitShortcut(tip.text)
  // A position measured for the previous tip is never reused — the box
  // renders hidden at 0,0 first so its natural size can be measured.
  const at = pos && pos.tip === tip ? pos : null
  return (
    <div
      ref={boxRef}
      className={'app-tooltip' + (at ? ' shown ' + (at.below ? 'below' : 'above') : '')}
      style={at ? { top: at.top, left: at.left } : { top: 0, left: 0, visibility: 'hidden' }}
      role="tooltip"
    >
      <span className="app-tooltip-body">{body}</span>
      {key && <kbd className="app-tooltip-key">{key}</kbd>}
    </div>
  )
}
