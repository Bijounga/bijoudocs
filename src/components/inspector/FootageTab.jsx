import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../../state/store.js'
import Icon from '../icons.jsx'

// Bijou Footage's notes and markers for this script's footage, read-only
// (electron/main/footage.js reads Footage's own files). Two views: the raw
// recordings, or one of the project's edit sections (the cut), where notes
// are timed in the cut the way Footage's Edit list shows them. Click one to
// open Bijou Footage there.

// Same palettes as Bijou Footage (footage-review/src/lib/beats.js).
const MARKER_COLORS = {
  green: { label: 'Green', hex: '#5cc45f' },
  red: { label: 'Red', hex: '#e2483f' },
  purple: { label: 'Purple', hex: '#b15fd0' },
  orange: { label: 'Orange', hex: '#f08c2a' },
  yellow: { label: 'Yellow', hex: '#f2c230' },
  white: { label: 'White', hex: '#e8e8e8' },
  blue: { label: 'Blue', hex: '#4b8fe8' },
  cyan: { label: 'Cyan', hex: '#3fc8d8' }
}
const BEAT_LABEL = { SETUP: 'Setup', AND_THEN: 'And then', BECAUSE: 'Because', BUT: 'But', THEREFORE: 'Therefore', NOTE: 'Note' }
const BEAT_COLORS = { SETUP: '#7fbf7f', AND_THEN: '#6b6b6b', BECAUSE: '#a374db', BUT: '#d99a2b', THEREFORE: '#4a90d9', NOTE: '#8a8d99' }

// One filter "colour" per marker colour and per beat type.
function swatchOf(n, beatColors) {
  if (n.type === 'MARKER') {
    const c = MARKER_COLORS[n.color] ? n.color : 'yellow'
    return { id: 'm:' + c, label: MARKER_COLORS[c].label + ' marker', hex: MARKER_COLORS[c].hex }
  }
  return { id: 'b:' + n.type, label: BEAT_LABEL[n.type] || n.type, hex: (beatColors && beatColors[n.type]) || BEAT_COLORS[n.type] || '#888' }
}

// Like Footage: a sketch counts as something written.
const hasContent = (n) => !!(n.text.trim() || n.sketch)

function clock(t) {
  const s = Math.max(0, Math.floor(t))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

// OBS names recordings "2026-04-10 14-06-20"; show those as a date.
function recordingDate(name) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ _](\d{2})-(\d{2})/.exec(name)
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : null
}
function recordingLabel(name) {
  const d = recordingDate(name)
  if (!d) return name
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) + ' · ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}
function recordingShort(name) {
  const d = recordingDate(name)
  return d ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ', ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : name
}

// "just now", "12 min ago", "3 h ago", "2 days ago"
function ago(at) {
  const min = Math.max(0, Math.round((Date.now() - at) / 60000))
  if (min < 1) return 'just now'
  if (min < 60) return min + ' min ago'
  if (min < 60 * 48) return Math.round(min / 60) + ' h ago'
  return Math.round(min / 1440) + ' days ago'
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')

// Per-viewer conveniences (which project, view, filters) — fine to lose.
function remember(key, fallback) {
  try {
    const v = localStorage.getItem('footageTab:' + key)
    return v == null ? fallback : JSON.parse(v)
  } catch {
    return fallback
  }
}
function store(key, value) {
  try {
    localStorage.setItem('footageTab:' + key, JSON.stringify(value))
  } catch {}
}

// A section's rows: its own markers, plus every recording note inside one
// of its clips, at that moment's place in the cut (clips play back to
// back; the same note can show twice if two clips both include it).
function sectionRows(section, byKey, project) {
  const rows = section.markers.map((m) => ({
    id: 'seq:' + m.id,
    t: m.t,
    n: { type: 'MARKER', color: m.color, text: m.text, star: false, sketch: false },
    seq: true,
    from: project.from || null,
    open: { projectId: project.id, sectionId: section.id, t: m.t }
  }))
  let start = 0
  for (const c of section.clips) {
    const rec = byKey.get(c.key)
    if (rec) {
      for (const n of rec.notes) {
        if (n.t < c.in || n.t >= c.out) continue
        const t = start + n.t - c.in
        rows.push({ id: n.id + '@' + c.id, t, n, from: project.from || rec.from || null, source: recordingShort(rec.name), open: { projectId: project.id, sectionId: section.id, t } })
      }
    }
    start += c.out - c.in
  }
  return rows.sort((a, b) => a.t - b.t)
}

export default function FootageTab({ scriptId, script }) {
  const [data, setData] = useState(null)
  const [projectChoice, setProjectChoice] = useState(() => remember('project:' + scriptId, null))
  const [viewChoice, setViewChoice] = useState(() => remember('view:' + scriptId, 'recordings'))
  const [textFilter, setTextFilter] = useState(() => remember('text', 'all')) // all | text | empty
  const [colors, setColors] = useState(() => remember('colors', []))
  const [query, setQuery] = useState('')
  const [textSize, setTextSize] = useState(() => remember('size', 1)) // list text scale
  const [status, setStatus] = useState(null)
  // Where you stopped (one flagged note per script) and the jump back to it.
  const stop = useStore((s) => s.footageStops[scriptId]) || null
  const setStop = useStore((s) => s.setFootageStop)
  const [jump, setJump] = useState(null) // { rowId, relaxed } while going to the flagged note

  useEffect(() => {
    let alive = true
    const load = () =>
      window.bijou
        .loadFootage()
        .then((d) => alive && setData(d))
        .catch(() => alive && setData({ available: false }))
    load()
    const off = window.bijou.onFootageChanged(load)
    return () => {
      alive = false
      off()
    }
  }, [])

  useEffect(() => {
    setProjectChoice(remember('project:' + scriptId, null))
    setViewChoice(remember('view:' + scriptId, 'recordings'))
  }, [scriptId])

  // Default project: the one sent to this script from Footage, else a
  // name match ("OmniWield" for "Omniwield"), else all footage.
  const projects = (data && data.projects) || []
  const autoProject =
    projects.find((p) => p.bijouScriptId === scriptId) || projects.find((p) => norm(p.name) === norm(script.title)) || null
  const projectId = projectChoice === 'all' ? null : projectChoice && projects.some((p) => p.id === projectChoice) ? projectChoice : autoProject && autoProject.id
  const project = projects.find((p) => p.id === projectId) || null
  // Sections belong to a project; "All footage" only has recordings.
  const section = (project && project.sections.find((s) => s.id === viewChoice)) || null

  // Groups of rows: one per recording, or the whole section as one.
  const groups = useMemo(() => {
    if (!data || !data.recordings) return []
    if (section) {
      const byKey = new Map(data.recordings.map((r) => [r.key, r]))
      return [{ key: section.id, rows: sectionRows(section, byKey, project) }]
    }
    const keys = project && new Set(project.keys)
    return data.recordings
      .filter((r) => !keys || keys.has(r.key))
      .map((r) => ({
        key: r.key,
        label: recordingLabel(r.name),
        rows: r.notes.map((n) => ({ id: n.id, t: n.t, n, from: r.from || null, open: { key: r.key, t: n.t, noteId: n.id } })).sort((a, b) => a.t - b.t)
      }))
  }, [data, project, section])

  const q = query.trim().toLowerCase()
  const passesText = (n) =>
    (textFilter === 'text' ? hasContent(n) : textFilter === 'empty' ? !hasContent(n) : true) && (!q || n.text.toLowerCase().includes(q))

  // Colour chips count what the text filter and search leave.
  const swatches = useMemo(() => {
    const map = new Map()
    for (const g of groups)
      for (const r of g.rows) {
        if (!passesText(r.n)) continue
        const sw = swatchOf(r.n, data && data.beatColors)
        const e = map.get(sw.id) || { ...sw, count: 0 }
        e.count++
        map.set(sw.id, e)
      }
    return [...map.values()].sort((a, b) => a.id.localeCompare(b.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, textFilter, q, data])

  const active = colors.filter((c) => swatches.some((s) => s.id === c))
  const shown = groups
    .map((g) => ({ ...g, shown: g.rows.filter((r) => passesText(r.n) && (!active.length || active.includes(swatchOf(r.n, data.beatColors).id))) }))
    .filter((g) => g.shown.length)
  const total = shown.reduce((a, g) => a + g.shown.length, 0)

  function pickProject(v) {
    setProjectChoice(v)
    store('project:' + scriptId, v)
  }
  function pickView(v) {
    setViewChoice(v)
    store('view:' + scriptId, v)
  }
  // step: +0.1 / -0.1 from the current size, or null to reset.
  function resize(step) {
    setTextSize((prev) => {
      const v = step == null ? 1 : Math.round(Math.max(0.8, Math.min(2.2, prev + step)) * 10) / 10
      store('size', v)
      return v
    })
  }
  // Ctrl+scroll over the list resizes its text. A native listener, since
  // React's wheel handlers are passive and couldn't stop the page zoom.
  const listRef = useRef(null)
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    const onWheel = (e) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      e.stopPropagation()
      resize(e.deltaY < 0 ? 0.1 : -0.1)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  })
  function pickText(v) {
    setTextFilter(v)
    store('text', v)
  }
  function toggleColor(id) {
    const next = active.includes(id) ? active.filter((c) => c !== id) : [...active, id]
    setColors(next)
    store('colors', next)
  }

  // Flags a note as where you stopped (or clears it if it already is).
  function toggleStop(r) {
    if (stop && stop.rowId === r.id) {
      setStop(scriptId, null)
      return
    }
    const sw = swatchOf(r.n, data.beatColors)
    const words = r.n.text.trim() || (r.n.sketch ? 'Sketch' : sw.label)
    setStop(scriptId, {
      projectId: projectId || null,
      view: section ? section.id : 'recordings',
      rowId: r.id,
      t: r.t,
      text: clock(r.t) + ' · ' + (words.length > 38 ? words.slice(0, 37) + '…' : words)
    })
  }

  // Back to the flagged note: its project and view, then scrolled to it.
  function goToStop() {
    if (!stop) return
    const wantProject = stop.projectId || 'all'
    if ((projectId || 'all') !== wantProject) pickProject(wantProject)
    if (viewChoice !== stop.view) pickView(stop.view)
    setJump({ rowId: stop.rowId, relaxed: false })
  }
  // Runs after the project/view switch has rendered. If a filter is hiding the
  // note, the filters are cleared once; if it still isn't there it's gone.
  useEffect(() => {
    if (!jump) return
    const list = listRef.current
    const el = list && Array.from(list.querySelectorAll('[data-row-id]')).find((e) => e.dataset.rowId === jump.rowId)
    if (el) {
      el.scrollIntoView({ block: 'center' })
      el.classList.add('flash')
      setTimeout(() => el.classList.remove('flash'), 1800)
      setJump(null)
      return
    }
    if (!jump.relaxed && (textFilter !== 'all' || active.length || q)) {
      pickText('all')
      setColors([])
      store('colors', [])
      setQuery('')
      setJump({ ...jump, relaxed: true })
      return
    }
    setStatus({ text: 'That note isn’t in this list anymore — it may have been deleted or moved.', error: true })
    setJump(null)
  })

  async function open(row) {
    // A note synced from another computer: the footage itself isn't here to open.
    if (row.from) {
      setStatus({ text: 'That footage is on ' + row.from + ' — open this note in Bijou Footage there.', error: true })
      return
    }
    setStatus({ text: 'Opening in Bijou Footage…' })
    const res = await window.bijou.openInFootage(row.open).catch((e) => ({ error: String(e) }))
    setStatus(res && res.error ? { text: res.error, error: true } : null)
  }

  if (!data) return <div className="ft-empty">Loading Bijou Footage notes…</div>
  if (!data.available)
    return <div className="ft-empty">Bijou Footage’s notes weren’t found on this computer. Once you’ve written notes or markers there, they show up here.</div>

  return (
    <div className="ft">
      {data.synced && data.synced.length > 0 && (
        <div className="ft-sync" title="Bijou Footage's computer saves these into your BijouDocs folder, which syncs">
          Includes notes synced from{' '}
          {data.synced.map((s, i) => (
            <span key={s.host}>
              {i > 0 && ', '}
              <b>{s.host}</b> ({ago(s.at)})
            </span>
          ))}
          . Those are read-only here.
        </div>
      )}
      <select className="ft-project" value={projectId || 'all'} onChange={(e) => pickProject(e.target.value)} title="Which Bijou Footage project">
        <option value="all">All footage</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
            {p.from ? ' · ' + p.from : ''}
          </option>
        ))}
      </select>

      {project && project.sections.length > 0 && (
        <select className="ft-project" value={section ? section.id : 'recordings'} onChange={(e) => pickView(e.target.value)} title="The raw recordings, or one of your edit sections (times in the cut)">
          <option value="recordings">Recordings</option>
          <optgroup label="Edit sections">
            {project.sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </optgroup>
        </select>
      )}

      <div className="ft-seg" role="group" aria-label="Text filter">
        {[
          ['all', 'All'],
          ['text', 'With text'],
          ['empty', 'No text']
        ].map(([v, label]) => (
          <button key={v} className={textFilter === v ? 'active' : ''} onClick={() => pickText(v)}>
            {label}
          </button>
        ))}
      </div>

      {swatches.length > 0 && (
        <div className="ft-chips">
          {swatches.map((s) => (
            <button
              key={s.id}
              className={'ft-chip' + (active.includes(s.id) ? ' active' : '')}
              onClick={() => toggleColor(s.id)}
              title={(active.includes(s.id) ? 'Stop filtering by ' : 'Only show ') + s.label.toLowerCase()}
            >
              <i style={{ background: s.hex }} />
              {s.count}
            </button>
          ))}
          {active.length > 0 && (
            <button className="ft-chip ft-clear" onClick={() => (setColors([]), store('colors', []))} title="Show every colour">
              Clear
            </button>
          )}
        </div>
      )}

      <input className="ft-search" placeholder="Search note text" value={query} onChange={(e) => setQuery(e.target.value)} />

      {status && <div className={'ft-status' + (status.error ? ' error' : '')}>{status.text}</div>}

      {stop && (
        <div className="ft-stop">
          <button className="ft-stop-go" onClick={goToStop} title="Go to the note you flagged as where you stopped">
            <Icon name="bookmark" size={13} />
            <span className="ft-stop-label">
              <b>Where I stopped</b>
              <span>{stop.text}</span>
            </span>
          </button>
          <button className="ft-stop-x" onClick={() => setStop(scriptId, null)} title="Clear the stop flag">
            <Icon name="x" size={11} />
          </button>
        </div>
      )}

      <div className="ft-count-row">
        <span className="ft-count">
          {total} {total === 1 ? 'note' : 'notes'}
          {section ? ' in ' + section.name + ' (times in the cut)' : project ? ' in ' + project.name : ''}
        </span>
        <span className="ft-size">
          <button className="icon-btn tb-icon" onClick={() => resize(-0.1)} disabled={textSize <= 0.8} title="Smaller text">
            <Icon name="minus" size={11} />
          </button>
          <button className="ft-size-value" onClick={() => resize(null)} title="Text size — click to reset (or Ctrl+scroll over the list)">
            {Math.round(textSize * 100)}%
          </button>
          <button className="icon-btn tb-icon" onClick={() => resize(0.1)} disabled={textSize >= 2.2} title="Bigger text">
            <Icon name="plus" size={11} />
          </button>
        </span>
      </div>

      <div className="ft-list" ref={listRef} style={{ '--ft-scale': textSize }}>
      {shown.map((g) => (
        <div key={g.key} className="ft-group">
          {g.label && (
            <div className="insp-section-title ft-rec" title={g.key}>
              {g.label}
              <span className="ft-rec-count">{g.shown.length}</span>
            </div>
          )}
          {g.shown.map((r) => {
            const sw = swatchOf(r.n, data.beatColors)
            const isStop = !!stop && stop.rowId === r.id
            return (
              <div key={r.id} className={'ft-row' + (isStop ? ' is-stop' : '')} data-row-id={r.id}>
              <button
                className="ft-note"
                onClick={() => open(r)}
                title={(r.from ? 'Synced from ' + r.from + ' — ' : 'Open in Bijou Footage at ') + clock(r.t) + (section ? ' in ' + section.name : '') + (r.source ? ' — from the ' + r.source + ' recording' : '')}
              >
                <i className="ft-dot" style={{ background: sw.hex }} />
                <span className="ft-time">{clock(r.t)}</span>
                <span className={'ft-text' + (r.n.text.trim() ? '' : ' none')}>
                  {r.seq && <b>Marker</b>}
                  {r.n.type !== 'MARKER' && <b>{sw.label}</b>}
                  {r.n.text.trim() || (r.n.sketch ? 'Sketch' : 'No text')}
                </span>
                {r.n.star && <span className="ft-star">★</span>}
              </button>
              <button
                className="ft-flag"
                onClick={() => toggleStop(r)}
                title={isStop ? 'This is where you stopped — click to clear it' : 'Flag this note as where you stopped'}
              >
                <Icon name="bookmark" size={12} />
              </button>
              </div>
            )
          })}
        </div>
      ))}
      </div>
      {total === 0 && <div className="ft-empty">No notes match these filters.</div>}
    </div>
  )
}
