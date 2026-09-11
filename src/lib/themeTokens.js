// The full set of CSS custom properties a theme controls — shared between
// App.jsx (applying a custom theme's colors as inline overrides) and
// ThemeTab.jsx (the per-token color picker that builds one). A built-in
// theme instead defines these as a `[data-theme='x']` block in styles.css;
// a custom one has no CSS of its own, so every token needs a value here.
export const THEME_TOKENS = [
  { key: '--bg', label: 'Background' },
  { key: '--panel', label: 'Panel' },
  { key: '--panel-2', label: 'Panel (alt)' },
  { key: '--panel-3', label: 'Panel (alt 2)' },
  { key: '--ink', label: 'Text' },
  { key: '--ink-dim', label: 'Text (dim)' },
  { key: '--ink-faint', label: 'Text (faint)' },
  { key: '--line', label: 'Border' },
  { key: '--line-soft', label: 'Border (soft)' },
  { key: '--cyan', label: 'Accent (primary)' },
  { key: '--amber', label: 'Accent (amber)' },
  { key: '--pink', label: 'Accent (pink)' },
  { key: '--danger', label: 'Danger' },
  { key: '--green', label: 'Success' },
  { key: '--editor-page', label: 'Page background' }
]

// The built-in Dark theme's own values — used as the starting point for a
// brand-new custom theme, regardless of which theme happens to be active
// when "New custom theme" is clicked (predictable > "whatever's on screen").
export const DEFAULT_CUSTOM_THEME_COLORS = {
  '--bg': '#14151a',
  '--panel': '#1b1d23',
  '--panel-2': '#20222b',
  '--panel-3': '#262833',
  '--ink': '#ece9e2',
  '--ink-dim': '#9a9da6',
  '--ink-faint': '#63656f',
  '--line': '#2c2f38',
  '--line-soft': '#23252e',
  '--cyan': '#4fd1c5',
  '--amber': '#f2a65a',
  '--pink': '#d46fb0',
  '--danger': '#e2665b',
  '--green': '#4ade80',
  '--editor-page': '#0d0e12'
}
