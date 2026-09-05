// Datamuse's free, keyless word-lookup API. Uses "means like" (ml=) rather
// than its own strict rel_syn= (WordNet's synonym relation) — rel_syn comes
// back sparse or empty for a lot of everyday words, where ml= reads much
// closer to a real thesaurus. No API key, no account — just a plain fetch.
const ENDPOINT = 'https://api.datamuse.com/words'

export async function fetchSynonyms(word) {
  const w = (word || '').trim()
  if (!w) return []
  const url = ENDPOINT + '?ml=' + encodeURIComponent(w) + '&max=16'
  const res = await fetch(url)
  if (!res.ok) throw new Error('Datamuse request failed: ' + res.status)
  const data = await res.json()
  const lower = w.toLowerCase()
  return data.map((d) => d.word).filter((s) => s && s.toLowerCase() !== lower)
}
