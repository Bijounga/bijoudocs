// bijoudocs://open?script=<id>&section=<id>&line=<id> — lets another tool
// (the Premiere panel's "show in BijouDocs" button) point this app at a spot
// in a script. Parsing is strict: only that shape, and ids limited to the
// characters this app's own ids use, so nothing arbitrary reaches the
// renderer.
const SCHEME = 'bijoudocs'
const ID = /^[A-Za-z0-9_-]{1,64}$/

// The link in a launch command line (Windows/Linux pass it as an argument).
export function findDeepLinkArg(argv) {
  return (argv || []).find((a) => typeof a === 'string' && a.toLowerCase().startsWith(SCHEME + '://')) || null
}

export function parseDeepLink(url) {
  if (!url) return null
  let u
  try {
    u = new URL(url)
  } catch (err) {
    return null
  }
  if (u.protocol !== SCHEME + ':' || u.hostname.toLowerCase() !== 'open') return null
  const pick = (name) => {
    const v = u.searchParams.get(name)
    return v && ID.test(v) ? v : null
  }
  const scriptId = pick('script')
  if (!scriptId) return null
  return { scriptId, sectionId: pick('section'), lineId: pick('line') }
}
