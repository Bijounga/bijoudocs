import React, { useState } from 'react'
import { useStore } from '../../state/store.js'
import Icon from '../icons.jsx'
import { THEME_TOKENS, DEFAULT_CUSTOM_THEME_COLORS } from '../../lib/themeTokens.js'
import { THEME_VARIANTS, activeVariant } from '../../lib/themeVariants.js'
import { familyOfTheme, defaultMemberOf, baseThemeOf } from '../../lib/themeFamilies.js'

// Swatch colors are hardcoded here (not read from CSS vars) so every theme's
// preview renders correctly regardless of which theme is currently active —
// picking the vars would just show whatever's already applied to the page.
const THEMES = [
  { id: 'dark', label: 'Dark', swatches: ['#14151a', '#1b1d23', '#ece9e2', '#4fd1c5'] },
  { id: 'midnight', label: 'Midnight', swatches: ['#0a0b0d', '#0f1014', '#ece9e2', '#4fd1c5'] },
  { id: 'liquidGlass', label: 'Liquid Glass', swatches: ['#6f8db0', '#f4f5f9', '#1d1d1f', '#007aff'] },
  { id: 'liquidGlassDark', label: 'Liquid Glass Dark', swatches: ['#111216', '#1c1c1f', '#f5f5f7', '#0a84ff'] },
  { id: 'dos', label: 'MS-DOS', swatches: ['#0000aa', '#0000aa', '#ffffff', '#ffff55'] },
  { id: 'aero', label: 'Frutiger Aero', swatches: ['#0a3d62', '#eaf6ff', '#0b2545', '#0f9fdb'] },
  { id: 'vaporwave', label: 'Vaporwave', swatches: ['#2b1055', '#e8d9ff', '#2a1a4a', '#ff4fb8'] },
  { id: 'aeroDark', label: 'Frutiger Aero Dark', swatches: ['#0a1120', '#16223a', '#eef4fb', '#4cc2ff'] },
  { id: 'y2kChrome', label: 'Y2K Chrome', swatches: ['#cdd1d6', '#eef0f2', '#14171b', '#c9640a'] },
  { id: 'y2kGunmetal', label: 'Y2K Gunmetal', swatches: ['#1c1f23', '#26292e', '#e6e8eb', '#ffa526'] },
  { id: 'minecraft', label: 'Minecraft', swatches: ['#2a2018', '#c6c6c6', '#1e1e1e', '#3a7a22'] },
  { id: 'terraria', label: 'Terraria', swatches: ['#4a90df', '#353a85', '#ffffff', '#ffd84a'] },
  { id: 'xp', label: 'Windows XP', swatches: ['#245edb', '#ece9d8', '#000000', '#316ac5'] },
  { id: 'doodleClub', label: 'Doodle Club', swatches: ['#2459a6', '#fffbe9', '#202031', '#ffe45c'] },
  { id: 'tiki', label: 'Tiki', swatches: ['#2a1407', '#ffd36b', '#19c3d3', '#ff8a1f'] },
  { id: 'inkWash', label: 'Ink Wash', swatches: ['#1d1b18', '#f3eddd', '#fcfaf3', '#b3261e'] },
  { id: 'cyanotype', label: 'Cyanotype', swatches: ['#0f2236', '#14304b', '#f6f1e3', '#a8d8f0'] },
  { id: 'cardCatalog', label: 'Card Catalog', swatches: ['#3a2a1a', '#e9d7ab', '#fbf7ea', '#34338a'] },
  { id: 'risoZine', label: 'Riso Zine', swatches: ['#1c1930', '#f4efe4', '#f15060', '#00838a'] },
  { id: 'spellbound', label: 'Spellbound', swatches: ['#120e16', '#1a1520', '#f7efd9', '#e9c46a'] },
  { id: 'ronin', label: 'Ronin', swatches: ['#0e0e10', '#f2ede3', '#faf7f0', '#c8102e'] },
  { id: 'light', label: 'MacBook Light', swatches: ['#e5e5e7', '#f7f7f8', '#1d1d1f', '#005bb8'] },
  { id: 'fable', label: 'Fable', swatches: ['#b9a26c', '#e8d9ab', '#3b2a17', '#9c2b2b'] },
  { id: 'fantasy', label: 'Earthen', swatches: ['#1a120b', '#241a10', '#f0e0c0', '#d4af37'] },
  { id: 'highContrast', label: 'High Contrast', swatches: ['#000000', '#0d0d0d', '#ffffff', '#00e5ff'] },
  { id: 'monochrome', label: 'Monochrome', swatches: ['#16171a', '#1c1d21', '#eaeaea', '#e8e8e8'] },
  // The other half of each illustrated theme (themeFamilies.js): same world, opposite light.
  { id: 'inkWashDark', label: 'Ink Wash Night', swatches: ['#14130f', '#1c1a16', '#ece5d3', '#e2574c'] },
  { id: 'cyanotypeLight', label: 'Cyanotype Paper', swatches: ['#e9e3d2', '#f6f1e3', '#14263d', '#17507f'] },
  { id: 'cardCatalogDark', label: 'Card Catalog Walnut', swatches: ['#1f150b', '#2e2114', '#f3e6c4', '#e8c35a'] },
  { id: 'risoZineDark', label: 'Riso Zine Black', swatches: ['#14121f', '#1c1930', '#f4efe4', '#3fd0d6'] },
  { id: 'spellboundLight', label: 'Spellbound Parchment', swatches: ['#e6d9b8', '#f7efd9', '#2a1d10', '#7a1626'] },
  { id: 'roninLight', label: 'Ronin Paper', swatches: ['#e9e4d8', '#faf7f0', '#141414', '#b80f2a'] },
  { id: 'xpDark', label: 'Windows XP Noir', swatches: ['#1a1a1a', '#2b2b2b', '#f0f0f0', '#ff8a2a'] },
  { id: 'minecraftDark', label: 'Minecraft Deepslate', swatches: ['#101012', '#2c2c30', '#ececec', '#6fd24a'] },
  { id: 'terrariaLight', label: 'Terraria Day', swatches: ['#9cc4f5', '#dfe6ff', '#171a52', '#2a35b0'] },
  { id: 'terrariaDark', label: 'Terraria Underground', swatches: ['#07081c', '#11132e', '#eef0ff', '#ffd84a'] },
  { id: 'aeroBlack', label: 'Frutiger Aero Black', swatches: ['#020305', '#07090d', '#f2f6fa', '#3fd0e8'] }
]

// One card per family (themeFamilies.js) or per lone theme, in the order the
// themes are listed above. A family's card shows its first member's swatches.
const CARDS = []
THEMES.forEach((t) => {
  const fam = familyOfTheme(t.id)
  if (!fam) return CARDS.push({ id: t.id, label: t.label, swatches: t.swatches, members: [{ id: t.id, label: t.label }] })
  if (CARDS.some((c) => c.id === fam.id)) return
  const first = THEMES.find((x) => x.id === defaultMemberOf(fam)) || t
  CARDS.push({ id: fam.id, label: fam.label, swatches: first.swatches, members: fam.members, start: defaultMemberOf(fam) })
})

// The 4 tokens the small preview swatch strip shows, out of all 15 —
// enough to recognize a theme at a glance without a huge row.
const PREVIEW_KEYS = ['--bg', '--panel', '--ink', '--cyan']

export default function ThemeTab() {
  const theme = useStore((s) => s.theme)
  const setTheme = useStore((s) => s.setTheme)
  const themeVariants = useStore((s) => s.themeVariants)
  const setThemeVariant = useStore((s) => s.setThemeVariant)
  const glassFrost = useStore((s) => s.glassFrost)
  const themeFamilyPick = useStore((s) => s.themeFamilyPick)
  const setGlassFrost = useStore((s) => s.setGlassFrost)
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
      <label
        className="theme-contrast-row"
        title="Give the script column its own background — lighter on light themes, darker on dark ones — instead of blending into the canvas"
      >
        <input type="checkbox" checked={editorPageContrast} onChange={toggleEditorPageContrast} />
        Page contrast
      </label>
      {CARDS.map((c) => {
        const open = c.members.some((m) => m.id === theme)
        // The member shown: the open one, else the one last used in this family, else the first.
        const pick = open ? theme : c.members.some((m) => m.id === themeFamilyPick[c.id]) ? themeFamilyPick[c.id] : c.start || c.members[0].id
        const swatches = (THEMES.find((x) => x.id === pick) || c).swatches
        return (
        <React.Fragment key={c.id}>
          <button className={'theme-row' + (open ? ' active' : '')} onClick={() => setTheme(pick)}>
            <div className="theme-swatches">
              {swatches.map((s, i) => (
                <span key={i} className="theme-swatch" style={{ background: s }} />
              ))}
            </div>
            <span className="theme-row-label">
              {c.label}
              {c.members.length > 1 && <span className="theme-row-sub">{c.members.length} variations</span>}
            </span>
            {open && <Icon name="check" size={14} className="theme-row-check" />}
          </button>
          {open && c.members.length > 1 && (
            <div className="theme-variations" role="radiogroup" aria-label="Variation">
              {c.members.map((m) => (
                <button
                  key={m.id}
                  role="radio"
                  aria-checked={theme === m.id}
                  className={'theme-variation' + (theme === m.id ? ' active' : '')}
                  onClick={() => setTheme(m.id)}
                >
                  <span className="theme-variation-dot" />
                  {m.label}
                </button>
              ))}
            </div>
          )}
          {open && THEME_VARIANTS[baseThemeOf(theme)] && (
            <div className="theme-variants">
              {THEME_VARIANTS[baseThemeOf(theme)].map((v) => (
                <button
                  key={v.id}
                  className={'theme-variant' + (activeVariant(baseThemeOf(theme), themeVariants).id === v.id ? ' active' : '')}
                  style={{ backgroundImage: v.css || 'url("' + v.url + '")', imageRendering: v.pixel ? 'pixelated' : 'auto' }}
                  onClick={() => setThemeVariant(baseThemeOf(theme), v.id)}
                  title={v.label}
                  aria-label={v.label}
                />
              ))}
            </div>
          )}
          {open && (theme === 'liquidGlass' || theme === 'liquidGlassDark') && (
            <label className="glass-frost" title="How frosted the glass is: clear shows the picture sharply, frosted blurs it">
              Frosted
              <input type="range" min="0" max="100" value={glassFrost} onChange={(e) => setGlassFrost(+e.target.value)} aria-label="Frosted" />
            </label>
          )}
        </React.Fragment>
        )
      })}

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
