# BijouDocs script file format — reference for the Premiere extension

Written 2026-09-11, from the real BijouDocs source (`src/lib/model.js`,
`electron/main/scriptSchema.js`, `electron/main/fileStore.js`), not from
memory or the compiled bundle. This is the ground truth for how BijouDocs
actually reads and writes its data — paste this whole file into the
Premiere-extension session as the starting reference.

## Where the files actually live

- **One JSON file per script**, named `<script.id>.json` — e.g. `id185a6.json`.
- Default folder: `~/Documents/BijouDocs/` (the OS's real Documents folder).
- **But the user can point BijouDocs at a different folder** (e.g. inside a
  Google Drive sync folder) — that choice is stored in BijouDocs' *own*
  Electron settings file, which lives in a separate, OS-specific,
  app-specific location (`app.getPath('userData')`, not anywhere obvious
  or easy for another app to find reliably). **Don't try to auto-detect
  this from the Premiere extension** — give the extension its own simple
  settings field where the user pastes/picks the same folder path they
  already chose in BijouDocs. They'll know it.
- A companion file, **`globalCategories.json`**, sits in that *same*
  folder (see "Global categories" below) — skip this exact filename when
  scanning the folder for scripts, it isn't one.
- Also skip any filename containing `.conflict-` or `.snapshot-` —
  BijouDocs' own internal backup/history files, not real scripts either.
- The schema is intentionally permissive on load (BijouDocs fills in any
  missing field with a sane default rather than rejecting the file) — you
  don't need to be exhaustively perfect when writing a script back out.

## Top-level Script object

```jsonc
{
  "id": "id185a6",
  "title": "My Script",
  "pinned": false,
  "dueDate": "2026-08-30", // or null
  "updatedAt": 1789085306442, // ms epoch — bump this whenever you write
  "sections": [ /* Section[] — see below */ ],
  "categories": [ /* Category[] — see below, these are the "tags" */ ],
  "mapLayout": { /* mind map / outline state — see below, probably not needed */ }
  // plus a handful of fields you almost certainly don't need: workLogHistory,
  // dailyBaseline, timestampLog, projectChecklist, checkpoints,
  // pinnedSectionIds, resumeLineKey, resumeOutlineNodeId, openTabs,
  // activeTabId, tabHistory, tabHistoryIndex
}
```

## Section

```jsonc
{
  "id": "id29wob",
  "heading": "Hook",
  "beatSummary": "", // one-line summary shown on the mind map, plain text
  "collapsed": false,
  "titleColor": null, // or a hex string
  "done": false,
  "checklist": [{ "id": "...", "text": "...", "done": false }], // per-section checkpoints, unrelated to line tags
  "checklistOpen": false,
  "lines": [ /* Line[] — see below, the actual thing you want */ ]
}
```

## Line — search this, tag it, check it off

```jsonc
{
  "id": "id4hvso",
  "text": "This is <b>rich</b> HTML, not plain text — see note below",
  "categoryId": "broll", // or null — this IS the tag
  "note": "plain text, not HTML",
  "noteOpen": false,
  "done": false, // the checkbox — this is what "check them off" should flip
  "indent": 0,
  "struck": false,
  "bookmarked": false,
  "takes": [] // A/B take history, ignore
}
```

**Important: `line.text` is HTML, not plain text.** BijouDocs renders it
in a rich contentEditable field — it can contain `<b>`, `<i>`, `<u>`,
`<s>` (strikethrough), `<span style="color:...">`, `<br>`, and inline
`<img>` tags (pasted images, as `data:` URIs). For search/display, strip
the tags first. BijouDocs' own way of doing this (`stripHtmlToText` in
`src/lib/html.js`) is just:
```js
function stripHtmlToText(html) {
  const d = document.createElement('div')
  d.innerHTML = html || ''
  return d.textContent || ''
}
```
If your extension's runtime has a `document` available (Premiere UXP/CEP
panels run in a Chromium webview, so it should), you can use this exact
trick. If not, a regex strip (`html.replace(/<[^>]+>/g, '')` plus basic
entity-decoding for `&amp;`/`&lt;`/`&gt;`) gets you close enough for
search purposes.

## Category (the "tags") — lives in `script.categories`

```jsonc
{
  "id": "broll",
  "label": "B-Roll",
  "color": "#4FD1C5",
  "spoken": true, // whether lines with this tag count toward runtime/appear in the teleprompter
  "teleprompterNote": false,
  "globalId": "id238qq" // OPTIONAL — only present if linked to a shared/global category, see below
}
```

Every new script starts with 4 defaults (`broll`/B-Roll, `onscreen`/On-Screen
Text, `factcheck`/Fact-Check, `note`/Note) but the user can rename, recolor,
delete, or add freely — don't treat these ids as fixed/meaningful, just
read whatever categories actually exist on the script you're looking at.

**To add a new tag to a line**: set `line.categoryId` to an existing
category's `id`. If the category you want doesn't exist yet on this
script, create it first (push a new `{id, label, color, spoken: true}`
onto `script.categories`, generate a fresh unique id).

### Global categories (new as of BijouDocs v0.5.41)

A category can be shared across every script instead of staying local to
one. The shared definitions live in `globalCategories.json`, in the same
folder as the scripts:
```jsonc
[{ "id": "id238qq", "label": "B-Roll", "color": "#4FD1C5", "spoken": true, "teleprompterNote": false }]
```
A script's own local category entry that's linked to one of these carries
a `globalId` field matching this file's `id`. **You almost certainly don't
need to touch this file** — from the Premiere side, just read/write
`script.categories` on the script itself; BijouDocs handles keeping a
linked category in sync with the shared definition on its own end (when
the script is opened/saved in BijouDocs).

## mapLayout — mind map / outline state (probably not relevant to you)

```jsonc
{
  "nodes": {
    "<a section's own id, or a generated id for a free node>": {
      "x": 60, "y": 60,
      "collapsed": false,
      "struck": false, // optional — can be undefined on older nodes, treat as falsy
      // idea nodes only:
      "type": "idea", "title": "...", "text": "...", "color": "#e2665b" // or null
      // chapter nodes only:
      "type": "chapter", "label": "...", "number": 1
      // a section-backed node (the common case) has NO "type" field at all
    }
  },
  "edges": [{ "id": "...", "from": "<nodeId>", "to": "<nodeId>" }],
  "mainThreadId": "<nodeId>", // or null
  "hideSummaries": false,
  "viewPan": { "x": 0, "y": 0 }, // optional, last pan position
  "viewZoom": 1 // optional, last zoom level
}
```

## Practical recipes for what you described wanting to build

1. **See sections + tags alongside them**: `script.sections.map(sec => ({
   heading: sec.heading, tags: [...new Set(sec.lines.map(l => l.categoryId))] }))`.
2. **See lines + notes for a specific tag**: for a chosen `categoryId`,
   collect every line across every section where `line.categoryId ===
   categoryId`, showing the note (`line.note`, already plain text)
   alongside the line's stripped `text`.
3. **Check lines off**: flip `line.done` and write the file back.
4. **Search a line, add B-roll/edit to it**: strip HTML from every line's
   `text`, run your search against the plain text, then set the matched
   line's `categoryId` to whichever tag's id means "B-roll"/"Edit" on
   that script.
5. **Writing back to disk — the one real risk**: if BijouDocs is *also*
   open on the same script at the same time your extension writes to its
   file, there's a genuine save race — whichever write lands last on disk
   wins. Always bump `updatedAt` to `Date.now()` when you write (BijouDocs'
   own conflict detection compares the file's on-disk `updatedAt` against
   what it last loaded, so this at least gives it a chance to notice and
   warn the user, the same way it already would between two BijouDocs
   installs sharing a synced folder). There's no lock file or IPC channel
   between the two apps — this is an inherent limitation of two separate
   programs editing the same file, not something either side can fully
   solve alone.
