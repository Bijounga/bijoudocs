// Hand-written release notes, shown once in a "What's new" popup the first
// time the app launches on a newer version than it last recorded. Add an
// entry here as part of shipping any version you want users to actually
// notice — silent bumps (an unlisted version) are simply skipped over.
export const CHANGELOG = {
  '0.5.17': [
    'Fixed idea nodes sometimes getting deleted while typing in a different node',
    'Fixed multi-node drags on the mind map accidentally selecting text instead of moving',
    'Idea node text boxes now grow with what you write, instead of a fixed size',
    'Idea node titles can be bolded, and their text can be hidden — good for marking beats',
    'Select multiple mind-map nodes and press Ctrl+Shift+E to link them in a chain',
    'Right-click multiple selected nodes to align, snap to grid, or space them evenly',
    'More contrast on mind-map nodes and their text',
    'Misspelled words now show real spelling suggestions on right-click'
  ],
  '0.5.18': ['Fixed the "what\'s new" popup not showing up on the update that introduced it'],
  '0.5.19': [
    'Fixed a real bug: the app could silently reset your storage folder back to the default on launch, breaking sync with other devices',
    'Save status is now always visible next to the title (like Google Docs), not just a brief flash — and it now shows for mind-map edits too',
    'New "Save now" button forces an immediate save and checkpoint',
    'New "History" panel lets you see and restore earlier saved versions of a script yourself',
    'Right-click a script in the library to reveal its file, or change where scripts are stored'
  ],
  '0.5.20': [
    'Fixed idea-node title bolding not being visible on some systems',
    'Fixed dragging on the mind-map canvas sometimes highlighting the whole page instead of just selecting nodes',
    'Fixed the save-status text jumping the toolbar around every time it updated',
    'Checklist, bookmarks, timestamps, and pinned panels now remember whether you left them open or closed',
    'Improved spellcheck suggestion setup — still tracking down one report that it doesn\'t show on right-click yet'
  ],
  '0.5.21': [
    'Actually fixed the save-status toolbar jumping this time — the previous fix only covered one of two things that were shifting it',
    'A small red debug box will appear in the corner after any right-click, temporarily, to help track down the spellcheck suggestions issue — safe to ignore or dismiss, nothing is sent anywhere'
  ],
  '0.5.22': [
    'Spelling suggestions now show up right at the top of the normal right-click menu on a misspelled word, instead of trying to pop a separate menu — removed the debug box now that this is in'
  ],
  '0.5.23': [
    'New "Outline" tab: a flattened, editable list of everything on the mind map, in one linear reading order — sections follow the main thread if you\'ve set one, then any other connected threads, then anything not yet connected'
  ],
  '0.5.24': [
    'Fixed a real bug: rebinding a keyboard shortcut never actually saved — it silently reset back to default on every relaunch, not just after an update',
    'Fixed backspacing at the start of a sentence with a blank line above it: it now just closes the gap, instead of welding the sentence onto the blank line and running them together'
  ]
}

function parseVersion(v) {
  return String(v || '')
    .split('.')
    .map((n) => parseInt(n, 10) || 0)
}

// True if `a` is a strictly newer semver than `b`.
export function isNewerVersion(a, b) {
  const pa = parseVersion(a)
  const pb = parseVersion(b)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] || 0
    const db = pb[i] || 0
    if (da !== db) return da > db
  }
  return false
}

// Every changelog entry newer than `fromVersion` (exclusive) and no newer
// than `toVersion` (inclusive) — covers the case where auto-update or a
// manual Mac download jumps across more than one released version at once.
export function changelogSince(fromVersion, toVersion) {
  return Object.keys(CHANGELOG)
    .filter((v) => isNewerVersion(v, fromVersion) && !isNewerVersion(v, toVersion))
    .sort((a, b) => (isNewerVersion(a, b) ? 1 : isNewerVersion(b, a) ? -1 : 0))
    .flatMap((v) => CHANGELOG[v])
}
