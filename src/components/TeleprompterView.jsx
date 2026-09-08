import React, { useEffect, useRef, useState } from 'react'
import { useStore } from '../state/store.js'
import Icon from './icons.jsx'
import { stripHtmlToText } from '../lib/html.js'

// A reasonable starting point before the user ever asks for their full
// system font list — common cross-platform/Windows fonts that are almost
// always actually installed, so the dropdown isn't empty on first open.
const FALLBACK_FONTS = [
  'Segoe UI', 'Arial', 'Calibri', 'Cambria', 'Constantia', 'Georgia',
  'Palatino Linotype', 'Times New Roman', 'Trebuchet MS', 'Verdana', 'Tahoma',
  'Consolas', 'Courier New', 'Lucida Console', 'Comic Sans MS', 'Garamond'
]

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
  const showNotes = useStore((s) => s.teleprompterShowNotes)
  const toggleShowNotes = useStore((s) => s.toggleTeleprompterShowNotes)
  const width = useStore((s) => s.teleprompterWidth)
  const setWidth = useStore((s) => s.setTeleprompterWidth)
  const align = useStore((s) => s.teleprompterAlign)
  const setAlign = useStore((s) => s.setTeleprompterAlign)
  const font = useStore((s) => s.teleprompterFont)
  const setFont = useStore((s) => s.setTeleprompterFont)

  const scrollRef = useRef(null)
  const [fontOptions, setFontOptions] = useState(FALLBACK_FONTS)
  const [allFontsLoaded, setAllFontsLoaded] = useState(false)
  const [fontError, setFontError] = useState(null)

  // Chromium's Local Font Access API — only reachable from a real click (a
  // user gesture), not from an effect on mount, and it shows its own native
  // "allow access to fonts" prompt the first time. Falls back to the small
  // curated list above if it's unsupported, denied, or errors for any other
  // reason, so the font picker is never left empty.
  async function loadSystemFonts() {
    setFontError(null)
    if (typeof window.queryLocalFonts !== 'function') {
      setFontError("This system/version of the app can't list installed fonts — using a preset list instead.")
      return
    }
    try {
      const fonts = await window.queryLocalFonts()
      const families = [...new Set(fonts.map((f) => f.family))].sort((a, b) => a.localeCompare(b))
      setFontOptions(families)
      setAllFontsLoaded(true)
    } catch (e) {
      setFontError('Could not access system fonts (permission denied or unavailable) — using a preset list instead.')
    }
  }

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

  // Jumps straight to the "where I left off" line (set via right-click in
  // the script) instead of always starting at the top — falls back to top
  // if nothing's marked, or the marked line isn't actually visible here
  // (struck, silent-category, or its section is collapsed).
  useEffect(() => {
    if (!teleprompterOpen || !scrollRef.current) return
    const key = script.resumeLineKey
    const target = key && scrollRef.current.querySelector('[data-line-key="' + key + '"]')
    if (target) target.scrollIntoView({ block: 'center' })
    else scrollRef.current.scrollTop = 0
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        <button className={'tp-btn' + (showNotes ? ' active' : '')} onClick={toggleShowNotes} title="Show each line's note, in small italics">
          Notes
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
        <input
          type="range"
          min="500"
          max="1800"
          step="50"
          value={width}
          onChange={(e) => setWidth(parseInt(e.target.value, 10))}
          title="Text column width"
        />
        <div className="tp-align-group">
          <button className={'tp-btn tp-align-btn' + (align === 'left' ? ' active' : '')} onClick={() => setAlign('left')} title="Align left">
            <Icon name="alignLeft" size={14} />
          </button>
          <button className={'tp-btn tp-align-btn' + (align === 'center' ? ' active' : '')} onClick={() => setAlign('center')} title="Align center">
            <Icon name="alignCenter" size={14} />
          </button>
          <button className={'tp-btn tp-align-btn' + (align === 'right' ? ' active' : '')} onClick={() => setAlign('right')} title="Align right">
            <Icon name="alignRight" size={14} />
          </button>
        </div>
        <select className="tp-font-select" value={font} onChange={(e) => setFont(e.target.value)} title="Teleprompter font">
          <option value="">Default</option>
          {fontOptions.map((f) => (
            <option key={f} value={f} style={{ fontFamily: f }}>
              {f}
            </option>
          ))}
        </select>
        <button className="tp-btn" onClick={loadSystemFonts} title="List every font installed on this PC (asks permission the first time)">
          {allFontsLoaded ? 'All fonts loaded' : 'Load all fonts'}
        </button>
        <button className="tp-btn tp-close" onClick={closeTeleprompter} title="Close (Escape)">
          <Icon name="collapse" size={13} /> Exit
        </button>
      </div>
      {fontError && <div className="tp-font-error">{fontError}</div>}
      <div className="teleprompter-body" ref={scrollRef}>
        <div className="teleprompter-inner" style={{ fontSize, maxWidth: width, textAlign: align, fontFamily: font || undefined }}>
          <div className="tp-title">{script.title}</div>
          {script.sections.map((sec) => {
            // A collapsed section is the writer saying "not now" — skip its
            // spoken lines here too, same as it's hidden in the normal
            // editor's mind map, but still show a small greyed marker so
            // it's clear something was deliberately skipped, not missing.
            if (sec.collapsed) {
              return (
                <div className="tp-section tp-section-collapsed" key={sec.id}>
                  <div className="tp-section-label tp-section-label-collapsed">{sec.heading}</div>
                </div>
              )
            }
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
                  const isResumePoint = script.resumeLineKey === sec.id + ':' + l.id
                  return (
                    <React.Fragment key={l.id}>
                      <p
                        data-line-key={sec.id + ':' + l.id}
                        className={(isNote ? 'tp-line-note' : '') + (isResumePoint ? ' tp-resume-point' : '')}
                        dangerouslySetInnerHTML={{ __html: l.text || '' }}
                      />
                      {showNotes && l.note && l.note.trim() && <p className="tp-note-aside">{l.note}</p>}
                    </React.Fragment>
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
