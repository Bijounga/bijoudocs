# BijouDocs Tags — Premiere Pro extension

A small Premiere Pro panel for working with a BijouDocs script's **tags**
(categories) while editing, without opening BijouDocs itself or seeing the
whole script. Reads and writes the same `<id>.json` files BijouDocs uses —
see [SCHEMA.md](SCHEMA.md) for the on-disk format this was built against.

## What it does

- **Sections tab**: every section's heading, with pills for whatever tags
  appear in it. Click a pill to expand just that section's lines tagged
  with it — you see the line text and its note, and can check the line off
  or edit its note right there.
- **Search tab**: type part of a line's text to find it (nothing is shown
  until you type — the whole script is never dumped into view). Each match
  shows its section, lets you set/change its tag (including creating a new
  tag on the fly), edit its note, and check it off.
- **Checklist tab**: to-dos you can pin to the Premiere timeline. Pick which
  checklist (the Project one, or any section's), type what you need, and press
  **Add + marker** (or Enter) - it adds the to-do to BijouDocs and drops a
  marker at the playhead of the active sequence. **Add** alone skips the
  marker, and any existing to-do (including ones you wrote in BijouDocs) has a
  **Marker** button. Click the pin to jump the playhead to its marker.
  **Checking a to-do off deletes its marker.** The x on the pin removes the
  marker but keeps the to-do. If you delete a marker by hand in Premiere the
  to-do shows "marker missing" - click it to place a fresh one. Items you
  check off inside BijouDocs lose their marker the next time you click back
  into the panel.
  The tab also lists every **tagged line** (B-Roll, Fact-Check, ...) as a
  to-do, grouped by section with its tag; ticking one marks the line done in
  BijouDocs. **Marker colour** defaults to *Auto*: the marker takes the
  closest Premiere colour to the line's tag colour (a plain to-do gets
  orange), or pick any of Premiere's 8 colours. Filter by **status**,
  **section** and **tag**, and **Delete completed** removes the finished
  checklist items currently shown (it never deletes tagged lines - they're
  script text - so use the Status filter to hide those).
- **Nothing the panel adds goes into your script text.** To-dos added here - with
  or without a tag, from a preset or the Tag picker - are saved as items in
  BijouDocs' per-section **Checkpoints** panel (the checklist toggle on each
  section), and a tagged one carries its tag as a chip. They still count toward
  that tag in the Tags tab and Sections tab. If you added tagged lines to the
  script with an older version, the arrow button on a row has "Out of the
  script, into the checklist" to take it out of the text (undoable).
- **Presets** (SFX, POV, VFX...): the coloured chips next to Add. **+ Preset**
  makes one (a name and a marker colour); the pencil lets you rename, recolour
  or delete them. Each project keeps its own. Click a chip and it adds a to-do
  (your typed text, or the preset's name if the box is empty) to the "Goes in"
  list with a marker in the preset's colour. It never changes your Goes in /
  Tag / Marker colour pickers (Auto stays Auto) and ignores the Tag picker, so
  a preset never takes a tag's colour. The to-do wears the preset's chip, and
  the Tag filter can filter by preset.
- **Show in BijouDocs**: the arrow-out button on a tagged line (or on a section's
  to-do) opens BijouDocs at that line (or that section), starting BijouDocs if
  it isn't running. It works through a `bijoudocs://` link, so it needs a BijouDocs
  build that includes link support: after updating BijouDocs, open it once so it
  registers the link with Windows. (Until then Windows may ask which app should
  open the link.)
- **The panel opens on the Checklist tab** (it's the first tab now).
- **Editing a to-do**: click its text, type, and press Enter (or click away) to
  save; Escape cancels. If it has a marker, the marker in Premiere is renamed to
  match. Undo/redo rename it back and forth. Only the panel's own checklist items
  are editable here - tagged lines are script text with formatting, so edit those
  in BijouDocs. (BijouDocs picks up an edit from here only if it's newer than its
  own copy, so it can't overwrite something you typed there.)
- **Moving a to-do**: each row has a small arrow button that opens "Move to..."
  (Project or any section), for when you forgot to pick where it goes. Tagged
  lines can move between sections. It's undoable, and an open BijouDocs follows
  the move instead of keeping a duplicate.
- **Presets based on a tag**: in the preset editor, "Same as tag" lets you pick a
  tag you already have (it names the preset after it), or just name a preset the
  same as a tag and it links to it automatically, so there are no duplicates.
  Using it adds a to-do carrying that tag (to the "Goes in" list) with the preset's
  own marker colour (never the tag's).
- **Undo / redo** (the two arrows in the Checklist tab, or Ctrl+Z / Ctrl+Shift+Z):
  covers adding to-dos, placing and removing markers, checking off, and
  deleting. Undo also fixes Premiere: it deletes a marker the earlier state
  didn't have, and puts back one that was deleted (at the same time, colour
  and range). Deleting never asks first - undo is the safety net. Switching
  scripts, or BijouDocs changing the file, clears the history.
- **Range markers** show as a bar and `start-end` (hover for the duration),
  and the pin follows the marker's range and colour if you change them in
  Premiere.
- **+ Line** on any section: add a brand-new line with a tag directly from
  Premiere — e.g. "need ocean b-roll here" tagged B-Roll — without touching
  BijouDocs.

Every change writes straight back to the script's `.json` file on disk
(bumping `updatedAt`, same as BijouDocs itself), so it shows up next time
that script is opened in BijouDocs.

## Setup (Windows)

1. Open BijouDocs, check **Settings** for the folder it's saving scripts to
   (default `~/Documents/BijouDocs/`, but you may have pointed it somewhere
   else, e.g. a synced Drive folder).
2. Run `install.ps1` in this folder (right-click → Run with PowerShell, or
   open a PowerShell window here and run `.\install.ps1`). This enables
   Adobe's CEP debug mode (required to load an unsigned, locally-built
   extension like this one) and links this folder into Premiere's
   extensions directory.
   - If you ever edit the extension's code again later, you only need to
     re-run `install.ps1` if it fell back to a plain copy (it'll say so) —
     a symlink picks up edits automatically.
3. Restart Premiere Pro completely (quit, not just close a project).
4. **Window → Extensions → BijouDocs Tags** opens the panel.
5. Paste the BijouDocs scripts folder path from step 1 into the panel's
   top field and click **Load**. Pick your script from the dropdown.

## After updating the panel

The panel is installed as a copy, so re-run `install.ps1` after any update and
then **fully restart Premiere** (a new host script and a changed manifest are
only picked up on startup, not by reopening the panel).

## Limitations / things to know

- **This couldn't be tested inside real Premiere** — Claude doesn't have
  Adobe Premiere Pro to launch. Every feature was verified by running the
  actual data logic (`js/dataLayer.js`) against real fixture script files
  through Node directly, and the UI (`index.html`/`js/app.js`) was
  exercised end-to-end in a browser with the on-disk parts mocked out.
  What's *not* verified: that Premiere's CEP host actually loads the panel,
  that `--enable-nodejs` behaves as expected in your Premiere version, and
  the debug-mode registry setup above. If the panel doesn't open or shows
  a blank/error screen after following Setup, that's the first place to
  look — say what you see and it can be fixed from there.
- **Markers are verified against a stand-in, not real Premiere**: the host script
  (`host/hostscript.jsx`) was run against a mock of Premiere's marker API and
  the panel UI against a mock of that script. If a marker ever lands in the
  wrong place, fails to delete, or the pin shows the wrong time, say what you
  see. Markers go on the active *sequence*, at the playhead.
- **Premiere's own undo (Ctrl+Z on the timeline)**: Premiere logs each thing a
  script sets on a marker (colour, then name) as a separate undo step, so one
  Ctrl+Z only blanks the marker's name and leaves a plain marker behind. The
  panel notices (within about a second, while the Checklist tab is showing) and
  removes the leftover marker, keeping the to-do and showing "Marker missing"
  state cleared so you can pin it again. This only applies to markers the panel
  placed in the last 3 minutes, and only when their name has been emptied, so
  recolouring or moving a marker never triggers it (clearing a fresh marker's
  name by hand would). The panel's own undo arrow also removes a marker in one
  go.
- **Two apps, one file**: if BijouDocs is open on the same script at the
  same time you edit it here, whichever one saves last wins — there's no
  lock between them. Safe in practice if you're not editing the exact same
  script in both at the exact same moment.
- The panel only ever writes plain text into new lines (no bold/italic/etc
  — that richness is BijouDocs' own editor's job).
- No connection to the Premiere timeline/markers (nothing here reads or
  writes your sequence) — it's purely a viewer/editor for the script's own
  tags, notes, and done-state, positioned as a sidebar while you edit.
