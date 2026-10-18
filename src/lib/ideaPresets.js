// Idea-node presets can be chained: a preset's `then` is the id of another
// preset spawned with it — placed below and linked from it — and that one's
// own `then` continues the chain (But -> Therefore -> ...).

export const MAX_CHAIN = 8

// The presets spawned when `id` is used, in order, starting with `id` itself.
// A preset that's been deleted ends the chain, and so does one the chain has
// already passed through (so a loop can never run away).
export function presetChain(presets, id) {
  const chain = []
  const seen = new Set()
  let p = presets.find((q) => q.id === id)
  while (p && !seen.has(p.id) && chain.length < MAX_CHAIN) {
    seen.add(p.id)
    chain.push(p)
    p = p.then ? presets.find((q) => q.id === p.then) : null
  }
  return chain
}

// Would picking `candidateId` as preset `presetId`'s follow-up make a loop?
export function wouldLoop(presets, presetId, candidateId) {
  return presetChain(presets, candidateId).some((p) => p.id === presetId)
}
