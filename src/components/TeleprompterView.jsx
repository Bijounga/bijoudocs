import React, { useEffect, useRef } from 'react'
import { useStore } from '../state/store.js'
import Icon from './icons.jsx'
import { stripHtmlToText } from '../lib/html.js'

// Distraction-free reading view for filming: spoken lines only (categories
// marked spoken:false — On-Screen Text, Note by default — and struck-through
// lines are skipped), big text, optional auto-scroll.
export default function TeleprompterView({ script }) {
  const teleprompterOpen = useStore((s) => s.teleprompterOpen)
  const closeTeleprompter = useStore((s) => s.closeTeleprompter)
  const fontSize = useStore((s) => s.teleprompterFontSize)
  const setFontSize = useStore((s) => s.setTeleprompterFontSize)
  const autoScroll = useStore((s) => s.teleprompterAutoScroll)
  const toggleAutoScroll = useStore((s) => s.toggleTeleprompterAutoScroll)
  const speed = useStore((s) => s.teleprompterSpeed)
  const setSpeed = useStore((s) => s.setTeleprompterSpeed)

  const scrollRef = useRef(null)

  useEffect(() => {
    if (!teleprompterOpen) return
    function onKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeTeleprompter()
        return
      }
      if (e.key === ' ') {
        e.preventDefault()
        toggleAutoScroll()
        return
      }
      if (e.key === '+' || e.key === '=') {
        e.preventDefault()
        setFontSize(fontSize + 4)
        return
      }
      if (e.key === '-') {
        e.preventDefault()
        setFontSize(fontSize - 4)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [teleprompterOpen, fontSize, setFontSize, toggleAutoScroll, closeTeleprompter])

  useEffect(() => {
    if (!autoScroll) return
    const id = setInterval(() => {
      if (scrollRef.current) scrollRef.current.scrollTop += speed * 1.2
    }, 30)
    return () => clearInterval(id)
  }, [autoScroll, speed])

  useEffect(() => {
    if (teleprompterOpen && scrollRef.current) scrollRef.current.scrollTop = 0
  }, [teleprompterOpen])

  if (!teleprompterOpen) return null

  function catInfo(id) {
    return script.categories.find((c) => c.id === id)
  }

  return (
    <div className="teleprompter-overlay">
      <div className="teleprompter-controls">
        <button className="tp-btn" onClick={() => setFontSize(fontSize - 4)} title="Smaller text (-)">A&minus;</button>
        <button className="tp-btn" onClick={() => setFontSize(fontSize + 4)} title="Larger text (+)">A+</button>
        <button className={'tp-btn' + (autoScroll ? ' active' : '')} onClick={toggleAutoScroll} title="Auto-scroll (Space)">
          {autoScroll ? 'Pause' : 'Auto-scroll'}
        </button>
        <input
          type="range"
          min="0.25"
          max="3"
          step="0.25"
          value={speed}
          onChange={(e) => setSpeed(parseFloat(e.target.value))}
          title="Auto-scroll speed"
        />
        <button className="tp-btn tp-close" onClick={closeTeleprompter} title="Close (Escape)">
          <Icon name="collapse" size={13} /> Exit
        </button>
      </div>
      <div className="teleprompter-body" ref={scrollRef}>
        <div className="teleprompter-inner" style={{ fontSize }}>
          <div className="tp-title">{script.title}</div>
          {script.sections.map((sec) => {
            const visibleLines = sec.lines.filter((l) => {
              if (l.struck) return false
              if (!stripHtmlToText(l.text).trim()) return false
              const cat = l.categoryId ? catInfo(l.categoryId) : null
              if (!cat || cat.spoken !== false) return true
              return !!cat.teleprompterNote
            })
            if (!visibleLines.length) return null
            return (
              <div className="tp-section" key={sec.id}>
                <div className="tp-section-label">{sec.heading}</div>
                {visibleLines.map((l) => {
                  const cat = l.categoryId ? catInfo(l.categoryId) : null
                  const isNote = cat && cat.spoken === false && cat.teleprompterNote
                  return (
                    <p
                      key={l.id}
                      className={isNote ? 'tp-line-note' : undefined}
                      dangerouslySetInnerHTML={{ __html: l.text || '' }}
                    />
                  )
                })}
              </div>
            )
          })}
          <div className="tp-end">— End —</div>
        </div>
      </div>
    </div>
  )
}
