// Themes that are one look in several lights share a card in the Theme tab:
// the card is the family, each member a "variation" (Light, Dark, ...), listed
// light to dark. A theme in no family is its own card.
//
// A member with `base` / `variant` is the same world in another light: it is
// applied as data-theme=<base> data-variant=<variant> (so every rule of the
// base theme still applies, and styles.css swaps the colours and materials in
// [data-theme='base'][data-variant='variant'] blocks), and it shares the base
// theme's backgrounds. `default` marks the one the card opens on the first time.
export const THEME_FAMILIES = [
  {
    id: 'bijou',
    label: 'Bijou',
    members: [
      { id: 'light', label: 'Light' },
      { id: 'dark', label: 'Dark', default: true },
      { id: 'midnight', label: 'Midnight' },
      { id: 'highContrast', label: 'High contrast' },
      { id: 'monochrome', label: 'Monochrome' }
    ]
  },
  {
    id: 'liquidGlass',
    label: 'Liquid Glass',
    members: [
      { id: 'liquidGlass', label: 'Light' },
      { id: 'liquidGlassDark', label: 'Dark' }
    ]
  },
  {
    id: 'aero',
    label: 'Frutiger Aero',
    members: [
      { id: 'aero', label: 'Light' },
      { id: 'aeroDark', label: 'Dark' },
      { id: 'aeroBlack', label: 'Black', base: 'aeroDark', variant: 'black' }
    ]
  },
  {
    id: 'y2k',
    label: 'Y2K',
    members: [
      { id: 'y2kChrome', label: 'Chrome' },
      { id: 'y2kGunmetal', label: 'Gunmetal' }
    ]
  },
  {
    id: 'fable',
    label: 'Fable',
    members: [
      { id: 'fable', label: 'Parchment' },
      { id: 'fantasy', label: 'Earthen' }
    ]
  },
  {
    id: 'inkWash',
    label: 'Ink Wash',
    members: [
      { id: 'inkWash', label: 'Light' },
      { id: 'inkWashDark', label: 'Night', base: 'inkWash', variant: 'dark' }
    ]
  },
  {
    id: 'cyanotype',
    label: 'Cyanotype',
    members: [
      { id: 'cyanotypeLight', label: 'Paper', base: 'cyanotype', variant: 'light' },
      { id: 'cyanotype', label: 'Blue', default: true }
    ]
  },
  {
    id: 'cardCatalog',
    label: 'Card Catalog',
    members: [
      { id: 'cardCatalog', label: 'Manila' },
      { id: 'cardCatalogDark', label: 'Walnut', base: 'cardCatalog', variant: 'dark' }
    ]
  },
  {
    id: 'risoZine',
    label: 'Riso Zine',
    members: [
      { id: 'risoZine', label: 'Paper' },
      { id: 'risoZineDark', label: 'Black', base: 'risoZine', variant: 'dark' }
    ]
  },
  {
    id: 'spellbound',
    label: 'Spellbound',
    members: [
      { id: 'spellboundLight', label: 'Parchment', base: 'spellbound', variant: 'light' },
      { id: 'spellbound', label: 'Night', default: true }
    ]
  },
  {
    id: 'ronin',
    label: 'Ronin',
    members: [
      { id: 'roninLight', label: 'Paper', base: 'ronin', variant: 'light' },
      { id: 'ronin', label: 'Ink', default: true }
    ]
  },
  {
    id: 'xp',
    label: 'Windows XP',
    members: [
      { id: 'xp', label: 'Luna' },
      { id: 'xpDark', label: 'Noir', base: 'xp', variant: 'dark' }
    ]
  },
  {
    id: 'minecraft',
    label: 'Minecraft',
    members: [
      { id: 'minecraft', label: 'Stone' },
      { id: 'minecraftDark', label: 'Deepslate', base: 'minecraft', variant: 'dark' }
    ]
  },
  {
    id: 'terraria',
    label: 'Terraria',
    members: [
      { id: 'terrariaLight', label: 'Day', base: 'terraria', variant: 'light' },
      { id: 'terraria', label: 'Night', default: true },
      { id: 'terrariaDark', label: 'Underground', base: 'terraria', variant: 'dark' }
    ]
  }
]

export function familyOfTheme(themeId) {
  return THEME_FAMILIES.find((f) => f.members.some((m) => m.id === themeId)) || null
}

// What goes on <html>: data-theme (the base theme's id) and data-variant.
export function themeAttrs(themeId) {
  const fam = familyOfTheme(themeId)
  const m = fam && fam.members.find((x) => x.id === themeId)
  return { theme: (m && m.base) || themeId, variant: (m && m.variant) || '' }
}

// The theme whose backgrounds (themeVariants.js) a theme uses: its base, or itself.
export const baseThemeOf = (themeId) => themeAttrs(themeId).theme

// The member a family card opens on when it is clicked.
export const defaultMemberOf = (family) => (family.members.find((m) => m.default) || family.members[0]).id
