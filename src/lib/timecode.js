import { stripHtmlToText } from './html.js'

const WPM = 150

export function formatRelative(ts) {
  const diff = Date.now() - ts
  const min = Math.round(diff / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return min + 'm ago'
  const hr = Math.round(min / 60)
  if (hr < 24) return hr + 'h ago'
  return Math.round(hr / 24) + 'd ago'
}

// { text, urgency } for a script's dueDate ('YYYY-MM-DD' or null), used by
// the sidebar and topbar deadline indicators.
export function dueDateInfo(dueDate) {
  if (!dueDate) return null
  const days = Math.ceil((new Date(dueDate + 'T00:00:00') - new Date(new Date().toDateString())) / 86400000)
  const label = new Date(dueDate + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const urgency = days < 0 ? 'overdue' : days <= 3 ? 'soon' : ''
  return { text: 'Due ' + label, urgency }
}

export function formatTC(sec) {
  sec = Math.max(0, Math.round(sec))
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0')
}

export function wordCount(text) {
  const t = (text || '').trim()
  return t ? t.split(/\s+/).length : 0
}

function catInfo(script, id) {
  return script.categories.find((c) => c.id === id)
}

// Cumulative spoken-word timecode per section, in seconds at WPM=150.
// Lines whose category is marked spoken:false (on-screen text, notes, etc.)
// don't advance the clock.
export function sectionTimecodes(script) {
  let cum = 0
  return script.sections.map((sec) => {
    const start = cum
    sec.lines.forEach((l) => {
      const cat = l.categoryId ? catInfo(script, l.categoryId) : null
      if (cat && cat.spoken === false) return
      cum += (wordCount(stripHtmlToText(l.text)) / WPM) * 60
    })
    return { start, end: cum }
  })
}

// Every word in the script, spoken or not — used for the daily work log
// ("words written" progress), unlike scriptTotalStats which only counts
// spoken words (for the runtime estimate).
export function totalWordCountAll(script) {
  let total = 0
  script.sections.forEach((sec) => {
    sec.lines.forEach((l) => {
      total += wordCount(stripHtmlToText(l.text))
    })
  })
  return total
}

// Whole-script spoken word count + estimated runtime, for the topbar. Uses
// the same start-to-end cumulative value already shown per-section, so the
// two stay consistent with each other.
export function scriptTotalStats(script) {
  const tcs = sectionTimecodes(script)
  const totalSeconds = tcs.length ? tcs[tcs.length - 1].end : 0
  const totalWords = Math.round((totalSeconds / 60) * WPM)
  return { totalSeconds, totalWords }
}
