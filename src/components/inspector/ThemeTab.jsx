import React from 'react'
import { useStore } from '../../state/store.js'
import Icon from '../icons.jsx'

// Swatch colors are hardcoded here (not read from CSS vars) so every theme's
// preview renders correctly regardless of which theme is currently active —
// picking the vars would just show whatever's already applied to the page.
const THEMES = [
  { id: 'dark', label: 'Dark', swatches: ['#14151a', '#1b1d23', '#ece9e2', '#4fd1c5'] },
  { id: 'light', label: 'MacBook Light', swatches: ['#e5e5e7', '#f7f7f8', '#1d1d1f', '#005bb8'] },
  { id: 'fable', label: 'Fable', swatches: ['#b9a26c', '#e8d9ab', '#3b2a17', '#9c2b2b'] },
  { id: 'fantasy', label: 'Earthen', swatches: ['#1a120b', '#241a10', '#f0e0c0', '#d4af37'] },
  { id: 'highContrast', label: 'High Contrast', swatches: ['#000000', '#0d0d0d', '#ffffff', '#00e5ff'] },
  { id: 'monochrome', label: 'Monochrome', swatches: ['#16171a', '#1c1d21', '#eaeaea', '#e8e8e8'] }
]

export default function ThemeTab() {
  const theme = useStore((s) => s.theme)
  const setTheme = useStore((s) => s.setTheme)
  const editorPageContrast = useStore((s) => s.editorPageContrast)
  const toggleEditorPageContrast = useStore((s) => s.toggleEditorPageContrast)

  return (
    <>
      <div className="insp-hint" style={{ marginBottom: 10 }}>
        Changes colors across the whole app. The Teleprompter stays dark regardless — meant for filming, not reading
        comfort.
      </div>
      <label className="theme-contrast-row">
        <input type="checkbox" checked={editorPageContrast} onChange={toggleEditorPageContrast} />
        Page contrast — give the script column its own background (lighter on light themes, darker on dark ones)
        instead of blending into the canvas
      </label>
      {THEMES.map((t) => (
        <button key={t.id} className={'theme-row' + (theme === t.id ? ' active' : '')} onClick={() => setTheme(t.id)}>
          <div className="theme-swatches">
            {t.swatches.map((c, i) => (
              <span key={i} className="theme-swatch" style={{ background: c }} />
            ))}
          </div>
          <span className="theme-row-label">{t.label}</span>
          {theme === t.id && <Icon name="check" size={14} className="theme-row-check" />}
        </button>
      ))}
    </>
  )
}
