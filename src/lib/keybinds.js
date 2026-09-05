export const DEFAULT_KEYBINDS = {
  bold: 'ctrl+b',
  italic: 'ctrl+i',
  underline: 'ctrl+u',
  color: 'ctrl+shift+h',
  tagLine: 'ctrl+shift+t',
  clearTag: 'ctrl+shift+u',
  noteLine: 'ctrl+shift+n',
  clearNote: 'ctrl+shift+d',
  focusMode: 'ctrl+shift+f',
  hideTags: 'ctrl+shift+g',
  hideNotes: 'ctrl+shift+j',
  newSection: 'ctrl+shift+s',
  strike: 'ctrl+shift+x',
  search: 'ctrl+/',
  tabBack: 'ctrl+shift+[',
  tabForward: 'ctrl+shift+]',
  checklistToggle: 'ctrl+shift+k',
  selectLine: 'ctrl+shift+l',
  newTake: 'ctrl+shift+r',
  bookmark: 'ctrl+shift+b',
  mapAddSection: 'ctrl+shift+m',
  mapToggleSummaries: 'ctrl+shift+y',
  mapAddIdeaNode: 'ctrl+shift+i',
  duplicate: 'ctrl+d',
  mapLinkNodes: 'ctrl+shift+e',
  mapSelectDownstream: 'ctrl+shift+.',
  mapSelectUpstream: 'ctrl+shift+,',
  mapSelectConnected: 'ctrl+shift+/',
  markResumePoint: 'ctrl+shift+p',
  jumpToResumePoint: 'ctrl+shift+o',
  findSynonyms: 'ctrl+shift+w'
}

export const SHORTCUT_META = [
  { id: 'bold', label: 'Bold selected text', desc: 'Bolds the current selection inside a line.' },
  { id: 'italic', label: 'Italicize selected text', desc: 'Italicizes the current selection inside a line.' },
  { id: 'underline', label: 'Underline selected text', desc: 'Underlines the current selection inside a line.' },
  { id: 'color', label: 'Color selected text', desc: 'Cycles the selection through a small color palette.' },
  { id: 'strike', label: 'Strikethrough', desc: 'Strikes selected text, selected lines, or a whole focused section.' },
  { id: 'tagLine', label: 'Tag current line', desc: 'Opens the tag menu for the line your cursor is in. Arrows + Enter, or a number, picks a category.' },
  { id: 'clearTag', label: 'Clear tag', desc: 'Removes the category tag from the line your cursor is in.' },
  { id: 'noteLine', label: 'Note current line', desc: 'Opens (or closes) the note box for the line your cursor is in.' },
  { id: 'clearNote', label: 'Clear note', desc: 'Deletes the note (if any) from the line your cursor is in and closes it.' },
  { id: 'selectLine', label: 'Select current line', desc: 'Selects the line your cursor is in, as if you clicked its grip handle.' },
  { id: 'newTake', label: 'Record a new take', desc: 'Archives the current line text as a take and clears the line for a new version. Cycle takes from the layers icon.' },
  { id: 'bookmark', label: 'Bookmark current line', desc: 'Bookmarks (or unbookmarks) the line your cursor is in. Find them all in the Bookmarks panel in the right margin.' },
  { id: 'checklistToggle', label: 'Toggle checkpoints', desc: 'Opens or closes the checkpoints panel for the section you are currently in.' },
  { id: 'search', label: 'Search lines', desc: 'Opens the line-content search.' },
  { id: 'hideTags', label: 'Hide tags & categories', desc: 'Toggles whether tag pills and colored borders show.' },
  { id: 'hideNotes', label: 'Hide notes', desc: 'Toggles whether note boxes and the note icon show.' },
  { id: 'newSection', label: 'New section', desc: 'Inserts a section after the current one and focuses its title.' },
  { id: 'tabBack', label: 'Back a tab', desc: 'Returns to the tab you were viewing before.' },
  { id: 'tabForward', label: 'Forward a tab', desc: 'Goes forward again after going back.' },
  { id: 'focusMode', label: 'Toggle focus mode', desc: 'Hides the library and inspector panels.' },
  { id: 'mapAddSection', label: 'Add section in mind map', desc: 'Adds a new section as a node, while the mind map is open.' },
  {
    id: 'mapToggleSummaries',
    label: 'Toggle mind map summaries',
    desc: 'Hides or shows every beat summary in the mind map at once — or, if a node is selected, just that node’s summary.'
  },
  {
    id: 'mapAddIdeaNode',
    label: 'Add idea node in mind map',
    desc: 'Opens the idea-node menu while the mind map is open — press a number for a specific preset (or Blank), or Enter/click as usual.'
  },
  {
    id: 'duplicate',
    label: 'Duplicate selection',
    desc: 'Duplicates whatever is currently highlighted — selected lines, the line your cursor is in, a selected section, or (in the mind map) selected nodes.'
  },
  {
    id: 'mapLinkNodes',
    label: 'Link selected mind-map nodes',
    desc: 'With 2+ nodes selected on the mind map, connects them into one chain in selection order — one press instead of dragging each edge by hand.'
  },
  {
    id: 'mapSelectDownstream',
    label: 'Select everything after this node',
    desc: 'With a mind-map node selected, extends the selection to everything reachable by following its outgoing connections — handy before deleting or moving a whole downstream thread.'
  },
  {
    id: 'mapSelectUpstream',
    label: 'Select everything before this node',
    desc: 'With a mind-map node selected, extends the selection to everything reachable by following its incoming connections, upstream.'
  },
  {
    id: 'mapSelectConnected',
    label: 'Select everything connected to this node',
    desc: 'With a mind-map node selected, extends the selection to everything reachable in either direction — the whole connected thread it\'s part of.'
  },
  {
    id: 'markResumePoint',
    label: 'Mark as resume point',
    desc: 'Marks the line your cursor is in (in the script) or the item you\'re editing (in the Outline) as where you left off — press again on the same one to clear it.'
  },
  {
    id: 'jumpToResumePoint',
    label: 'Jump to resume point',
    desc: 'Scrolls straight to your resume point — the script\'s if you\'re in the script, the Outline\'s if you\'re in the Outline.'
  },
  {
    id: 'findSynonyms',
    label: 'Find synonyms',
    desc: 'Looks up synonyms for the selected text, or the word your cursor is in — click one to swap it in.'
  }
]

export const COLOR_PALETTE = ['#4FD1C5', '#F2A65A', '#D46FB0', '#E2665B', '#7FA9F2', '#ECE9E2']

export function comboFromEvent(e) {
  const parts = []
  if (e.ctrlKey || e.metaKey) parts.push('ctrl')
  if (e.shiftKey) parts.push('shift')
  if (e.altKey) parts.push('alt')
  const key = e.key.toLowerCase()
  if (!['control', 'shift', 'alt', 'meta'].includes(key)) parts.push(key)
  return parts.join('+')
}
