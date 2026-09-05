// LanguageTool's free, keyless public API — checked ourselves instead of
// relying on Electron's native context-menu event, which never reliably
// delivered misspelledWord/dictionarySuggestions in real use (confirmed
// across several attempts; see feedback memory). The inline red-squiggly
// underlines are unaffected — those are Chromium's own spellchecker,
// which works fine on its own; this only replaces the right-click
// suggestions, which is the part that was actually broken.
const ENDPOINT = 'https://api.languagetool.org/v2/check'

// A small in-memory, per-session cache (word -> result) — right-clicking
// the same word again (or a run of repeats, e.g. a name used throughout
// the script) shouldn't re-hit the network every time. Capped so a very
// long session can't grow this unboundedly.
const cache = new Map()
const CACHE_LIMIT = 500

function cacheSet(key, value) {
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value
    cache.delete(oldest)
  }
  cache.set(key, value)
}

export async function checkSpelling(word) {
  const w = (word || '').trim()
  // Only a single token is a real "misspelled word" question — a multi-
  // word selection would pull in LanguageTool's grammar/style rules too,
  // which isn't what this menu is for.
  if (!w || /\s/.test(w)) return { misspelled: false, suggestions: [] }
  const key = w.toLowerCase()
  if (cache.has(key)) return cache.get(key)

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ text: w, language: 'en-US' })
  })
  if (!res.ok) throw new Error('LanguageTool request failed: ' + res.status)
  const data = await res.json()
  const match = (data.matches || []).find((m) => m.rule && m.rule.issueType === 'misspelling')
  const result = match
    ? { misspelled: true, suggestions: (match.replacements || []).slice(0, 8).map((r) => r.value) }
    : { misspelled: false, suggestions: [] }
  cacheSet(key, result)
  return result
}
