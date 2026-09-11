import React, { useState } from 'react'
import { useStore } from '../../state/store.js'
import Icon from '../icons.jsx'
import { THEME_TOKENS, DEFAULT_CUSTOM_THEME_COLORS } from '../../lib/themeTokens.js'

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

// The 4 tokens the small preview swatch strip shows, out of all 15 —
// enough to recognize a theme at a glance without a huge row.
const PREVIEW_KEYS = ['--bg', '--panel', '--ink', '--cyan']

export default function ThemeTab() {
  const theme = useStore((s) => s.theme)
  const setTheme = useStore((s) => s.setTheme)
  const editorPageContrast = useStore((s) => s.editorPageContrast)
  const toggleEditorPageContrast = useStore((s) => s.toggleEditorPageContrast)
  const customThemes = useStore((s) => s.customThemes)
  const saveCustomTheme = useStore((s) => s.saveCustomTheme)
  const updateCustomTheme = useStore((s) => s.updateCustomTheme)
  const renameCustomTheme = useStore((s) => s.renameCustomTheme)
  const deleteCustomTheme = useStore((s) => s.deleteCustomTheme)

  const [editingId, setEditingId] = useState(null)
  const editing = customThemes.find((t) => t.id === editingId) || null

  function startNewCustomTheme() {
    const id = saveCustomTheme('My theme', { ...DEFAULT_CUSTOM_THEME_COLORS })
    setEditingId(id)
  }

  function deleteEditing() {
    if (editingId) deleteCustomTheme(editingId)
    setEditingId(null)
  }

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

      {customThemes.length > 0 && <div className="insp-section-title">Your themes</div>}
      {customThemes.map((t) => (
        <div key={t.id} className={'theme-row theme-row-custom' + (theme === t.id ? ' active' : '')}>
          <button className="theme-row-main" onClick={() => setTheme(t.id)}>
            <div className="theme-swatches">
              {PREVIEW_KEYS.map((k) => (
                <span key={k} className="theme-swatch" style={{ background: t.colors[k] }} />
              ))}
            </div>
            <span className="theme-row-label">{t.name}</span>
            {theme === t.id && <Icon name="check" size={14} className="theme-row-check" />}
          </button>
          <button className="theme-row-edit" title="Edit this theme" onClick={() => setEditingId(t.id)}>
            <Icon name="edit" size={12} />
          </button>
          <button
            className="theme-row-edit"
            title="Delete this theme"
            onClick={() => {
              deleteCustomTheme(t.id)
              if (editingId === t.id) setEditingId(null)
            }}
          >
            <Icon name="trash" size={12} />
          </button>
        </div>
      ))}
      <button className="cat-add-btn" onClick={startNewCustomTheme}>+ New custom theme</button>

      {editing && (
        <div className="theme-editor">
          <input
            className="theme-editor-name"
            value={editing.name}
            onChange={(e) => renameCustomTheme(editing.id, e.target.value)}
            placeholder="Theme name"
          />
          {THEME_TOKENS.map(({ key, label }) => (
            <div className="theme-editor-row" key={key}>
              <input
                type="color"
                value={editing.colors[key]}
                onChange={(e) => updateCustomTheme(editing.id, { ...editing.colors, [key]: e.target.value })}
              />
              <span>{label}</span>
            </div>
          ))}
          <div className="theme-editor-actions">
            <button className="cat-open-btn" onClick={() => setEditingId(null)}>Done</button>
            <button className="cat-del" onClick={deleteEditing} title="Delete this theme">
              Delete
            </button>
          </div>
        </div>
      )}
    </>
  )
}
