// Reads/writes BijouDocs script JSON files. See premiere-extension/README.md
// and the schema reference this was built from for the on-disk format.
//
// The fs-touching functions (listScriptFiles/loadScript/saveScript) need
// Node's require('fs'), which only exists inside the CEP panel (Node
// integration is enabled in CSXS/manifest.xml). Everything else is pure
// data transformation and works anywhere, including a plain browser tab,
// so the UI logic can be exercised without Premiere itself.

(function (root) {
  'use strict';

  function hasNode() {
    return typeof require === 'function';
  }

  function genId() {
    return 'id' + Math.random().toString(36).slice(2, 8);
  }

  // ---- filesystem ----------------------------------------------------

  function listScriptFiles(folderPath) {
    if (!hasNode()) throw new Error('listScriptFiles requires Node (CEP only)');
    var fs = require('fs');
    var path = require('path');
    if (!fs.existsSync(folderPath)) return [];
    return fs.readdirSync(folderPath)
      .filter(function (name) {
        if (!name.endsWith('.json')) return false;
        if (name === 'globalCategories.json') return false;
        if (name.indexOf('.conflict-') !== -1) return false;
        if (name.indexOf('.snapshot-') !== -1) return false;
        return true;
      })
      .map(function (name) {
        return { id: name.replace(/\.json$/, ''), path: path.join(folderPath, name) };
      });
  }

  function loadScript(filePath) {
    if (!hasNode()) throw new Error('loadScript requires Node (CEP only)');
    var fs = require('fs');
    var raw = fs.readFileSync(filePath, 'utf8');
    return normalizeScript(JSON.parse(raw));
  }

  function saveScript(filePath, script) {
    if (!hasNode()) throw new Error('saveScript requires Node (CEP only)');
    var fs = require('fs');
    script.updatedAt = Date.now();
    fs.writeFileSync(filePath, JSON.stringify(script, null, 2), 'utf8');
  }

  // Shared category *definitions* (see BijouDocs' own "make this tag
  // global" feature) — a script only actually carries one of these in its
  // own `categories` array once something has explicitly linked it there
  // (BijouDocs' addExistingGlobalCategoryToScript, or linkGlobalCategoryTo
  // Script below). Missing/corrupt file just means "no globals yet".
  function listGlobalCategories(folderPath) {
    if (!hasNode()) throw new Error('listGlobalCategories requires Node (CEP only)');
    var fs = require('fs');
    var path = require('path');
    var file = path.join(folderPath, 'globalCategories.json');
    try {
      var raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      return Array.isArray(raw) ? raw : [];
    } catch (e) {
      return [];
    }
  }

  // Fill in anything missing with a sane default, same spirit as
  // BijouDocs' own permissive loader — never reject a real script file.
  function normalizeScript(script) {
    script.sections = script.sections || [];
    script.categories = script.categories || [];
    script.sections.forEach(function (sec) {
      sec.lines = sec.lines || [];
      sec.heading = sec.heading || '';
    });
    return script;
  }

  // ---- plain-text rendering -------------------------------------------

  function stripHtmlToText(html) {
    if (!html) return '';
    if (typeof document !== 'undefined') {
      var d = document.createElement('div');
      d.innerHTML = html;
      return d.textContent || '';
    }
    return String(html)
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  }

  // ---- category helpers -------------------------------------------------

  function categoryById(script, categoryId) {
    return script.categories.find(function (c) { return c.id === categoryId; }) || null;
  }

  // Finds an existing category by (case-insensitive) label, or creates one.
  function ensureCategory(script, label, color) {
    var existing = script.categories.find(function (c) {
      return c.label.toLowerCase() === label.toLowerCase();
    });
    if (existing) return existing;
    var cat = { id: genId(), label: label, color: color || '#4FD1C5', spoken: true, teleprompterNote: false };
    script.categories.push(cat);
    return cat;
  }

  // Mirrors BijouDocs' own "use this global category here too" action
  // (addExistingGlobalCategoryToScript in src/state/store.js) — a global
  // category only actually shows up as usable on a script once something
  // has created this local, globalId-linked copy of it. Idempotent: if
  // this script already linked that global, returns the existing copy
  // instead of creating a duplicate.
  function linkGlobalCategoryToScript(script, globalCat) {
    var existing = script.categories.find(function (c) { return c.globalId === globalCat.id; });
    if (existing) return existing;
    var cat = {
      id: genId(),
      globalId: globalCat.id,
      label: globalCat.label,
      color: globalCat.color,
      spoken: globalCat.spoken !== false,
      teleprompterNote: !!globalCat.teleprompterNote
    };
    script.categories.push(cat);
    return cat;
  }

  // ---- read views used by the UI ----------------------------------------

  // [{ id, heading, done, tags: [{id,label,color}] }]
  function sectionsWithTags(script) {
    return script.sections.map(function (sec) {
      var seen = {};
      var tags = [];
      sec.lines.forEach(function (line) {
        if (!line.categoryId || seen[line.categoryId]) return;
        var cat = categoryById(script, line.categoryId);
        if (!cat) return;
        seen[line.categoryId] = true;
        tags.push({ id: cat.id, label: cat.label, color: cat.color });
      });
      return { id: sec.id, heading: sec.heading, done: !!sec.done, tags: tags };
    });
  }

  // Every line tagged with categoryId, across every section.
  // [{ sectionId, sectionHeading, lineId, text, note, done, bookmarked }]
  function linesForTag(script, categoryId) {
    var out = [];
    script.sections.forEach(function (sec) {
      sec.lines.forEach(function (line) {
        if (line.categoryId !== categoryId) return;
        out.push({
          sectionId: sec.id,
          sectionHeading: sec.heading,
          lineId: line.id,
          text: stripHtmlToText(line.text),
          note: line.note || '',
          done: !!line.done
        });
      });
    });
    return out;
  }

  // One row per category with how many lines carry it, across the whole
  // script (not just one section) — "remaining" is the not-done count,
  // which is what a checklist-style counter actually wants to show.
  // [{ id, label, color, total, remaining }]
  function tagCounts(script) {
    return script.categories.map(function (cat) {
      var total = 0, remaining = 0;
      script.sections.forEach(function (sec) {
        sec.lines.forEach(function (line) {
          if (line.categoryId !== cat.id) return;
          total++;
          if (!line.done) remaining++;
        });
      });
      return { id: cat.id, label: cat.label, color: cat.color, total: total, remaining: remaining };
    });
  }

  // Substring search (case-insensitive) over plain-text line content only —
  // deliberately doesn't return anything until the user types a query, so
  // the whole script is never dumped into view.
  // [{ sectionId, sectionHeading, lineId, text, note, done, categoryId }]
  function searchLines(script, query) {
    var q = (query || '').trim().toLowerCase();
    if (!q) return [];
    var out = [];
    script.sections.forEach(function (sec) {
      sec.lines.forEach(function (line) {
        var text = stripHtmlToText(line.text);
        if (text.toLowerCase().indexOf(q) === -1) return;
        out.push({
          sectionId: sec.id,
          sectionHeading: sec.heading,
          lineId: line.id,
          text: text,
          note: line.note || '',
          done: !!line.done,
          categoryId: line.categoryId || null
        });
      });
    });
    return out;
  }

  function findLine(script, lineId) {
    for (var i = 0; i < script.sections.length; i++) {
      var sec = script.sections[i];
      for (var j = 0; j < sec.lines.length; j++) {
        if (sec.lines[j].id === lineId) return sec.lines[j];
      }
    }
    return null;
  }

  // ---- mutations ---------------------------------------------------------

  function setLineTag(script, lineId, categoryId) {
    var line = findLine(script, lineId);
    if (!line) throw new Error('line not found: ' + lineId);
    line.categoryId = categoryId;
  }

  function toggleLineDone(script, lineId) {
    var line = findLine(script, lineId);
    if (!line) throw new Error('line not found: ' + lineId);
    line.done = !line.done;
    return line.done;
  }

  function setLineNote(script, lineId, note) {
    var line = findLine(script, lineId);
    if (!line) throw new Error('line not found: ' + lineId);
    line.note = note;
  }

  // Appends a new line (plain text only — this panel never authors rich
  // HTML) to the given section, tagged with categoryId. Returns the new line.
  function addLineToSection(script, sectionId, opts) {
    var sec = script.sections.find(function (s) { return s.id === sectionId; });
    if (!sec) throw new Error('section not found: ' + sectionId);
    var line = {
      id: genId(),
      text: escapeHtml(opts.text || ''),
      categoryId: opts.categoryId || null,
      note: opts.note || '',
      noteOpen: false,
      done: false,
      indent: 0,
      struck: false,
      bookmarked: false,
      takes: []
    };
    sec.lines.push(line);
    return line;
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ---- to-dos + Premiere marker links --------------------------------------
  // A "to-do" is either a checklist item (section.checklist /
  // script.projectChecklist, {id, text, done}) or a tagged line (done =
  // line.done). Either can carry an optional `marker` once it's linked to a
  // Premiere sequence marker: {seqId, seqName, guid, time, name, color}.

  // Premiere's 8 marker colours, in the index order setColorByIndex uses.
  var MARKER_COLORS = [
    { index: 0, name: 'Green', hex: '#4fb34f' },
    { index: 1, name: 'Red', hex: '#e0443e' },
    { index: 2, name: 'Purple', hex: '#a06be0' },
    { index: 3, name: 'Orange', hex: '#f2994a' },
    { index: 4, name: 'Yellow', hex: '#f2d33b' },
    { index: 5, name: 'White', hex: '#f2f2f2' },
    { index: 6, name: 'Blue', hex: '#4a7be0' },
    { index: 7, name: 'Cyan', hex: '#35c7d4' }
  ];
  var DEFAULT_MARKER_COLOR = 3;

  function hexToRgb(hex) {
    var c = String(hex || '').replace('#', '');
    if (c.length === 3) c = c.split('').map(function (ch) { return ch + ch; }).join('');
    if (!/^[0-9a-fA-F]{6}$/.test(c)) return null;
    return [parseInt(c.substr(0, 2), 16), parseInt(c.substr(2, 2), 16), parseInt(c.substr(4, 2), 16)];
  }

  // The Premiere marker colour closest to a tag/section colour.
  function nearestMarkerColor(hex) {
    var rgb = hexToRgb(hex);
    if (!rgb) return DEFAULT_MARKER_COLOR;
    // Greys have no hue to match - white is the sensible marker.
    if (Math.max(rgb[0], rgb[1], rgb[2]) - Math.min(rgb[0], rgb[1], rgb[2]) < 40) return 5;
    var best = DEFAULT_MARKER_COLOR, bestD = Infinity;
    MARKER_COLORS.forEach(function (mc) {
      var m = hexToRgb(mc.hex);
      var d = (m[0] - rgb[0]) * (m[0] - rgb[0]) + (m[1] - rgb[1]) * (m[1] - rgb[1]) + (m[2] - rgb[2]) * (m[2] - rgb[2]);
      if (d < bestD) { bestD = d; best = mc.index; }
    });
    return best;
  }

  function tagOf(script, categoryId) {
    var cat = categoryId ? categoryById(script, categoryId) : null;
    return cat ? { id: cat.id, label: cat.label, color: cat.color } : null;
  }

  // The colour a new marker gets when the user hasn't picked one: its
  // preset's colour, else the line's tag colour, else its section's, else orange.
  function defaultMarkerColor(entry) {
    if (entry.preset && typeof entry.preset.color === 'number') return entry.preset.color;
    if (entry.tag && entry.tag.color) return nearestMarkerColor(entry.tag.color);
    if (entry.sectionColor) return nearestMarkerColor(entry.sectionColor);
    return DEFAULT_MARKER_COLOR;
  }

  // ---- marker presets (per script) ---------------------------------------
  // Quick-add buttons like SFX / POV / VFX: {id, label, color (Premiere marker
  // colour index)}. Stored on the script as markerPresets, so each project has
  // its own. A to-do made from one keeps a copy as item.preset.
  function listPresets(script) { return script.markerPresets || []; }

  // tagId (optional): an existing tag (category id) this preset is based on, so
  // the preset IS that tag instead of a duplicate of it - using it adds a
  // line carrying that tag. The marker colour stays the preset's own.
  function addPreset(script, label, color, tagId) {
    if (!script.markerPresets) script.markerPresets = [];
    var p = { id: genId(), label: String(label).trim(), color: color };
    if (tagId) p.tagId = tagId;
    script.markerPresets.push(p);
    return p;
  }

  function updatePreset(script, id, label, color, tagId) {
    var p = listPresets(script).find(function (x) { return x.id === id; });
    if (!p) throw new Error('preset not found: ' + id);
    p.label = String(label).trim();
    p.color = color;
    if (tagId) p.tagId = tagId; else delete p.tagId;
    // Keep the copy stored on each to-do current, so it still reads right if the
    // preset is deleted later.
    function sync(list) {
      (list || []).forEach(function (it) {
        if (it.preset && it.preset.id === id) it.preset = { id: id, label: p.label, color: p.color };
      });
    }
    sync(script.projectChecklist);
    script.sections.forEach(function (sec) { sync(sec.checklist); });
    return p;
  }

  function deletePreset(script, id) {
    script.markerPresets = listPresets(script).filter(function (x) { return x.id !== id; });
  }

  // The live preset an item was made from (so renaming/recolouring it shows
  // up), falling back to the copy stored on the item if it was deleted since.
  function presetOf(script, item) {
    if (!item.preset) return null;
    var live = listPresets(script).find(function (x) { return x.id === item.preset.id; });
    return live || item.preset;
  }

  // Every to-do as one flat list, in script order: the project checklist
  // first, then per section its checklist items followed by its tagged lines.
  // [{ kind: 'check'|'line', id, text (plain), note, done, marker, sectionId (null = project),
  //    sectionHeading, sectionColor, tag: {id,label,color}|null, raw }]
  function todoEntries(script) {
    var out = [];
    (script.projectChecklist || []).forEach(function (item) {
      out.push({ kind: 'check', id: item.id, text: item.text, note: '', done: !!item.done, marker: item.marker || null,
        sectionId: null, sectionHeading: 'Project', sectionColor: null, tag: null, preset: presetOf(script, item), raw: item });
    });
    script.sections.forEach(function (sec) {
      (sec.checklist || []).forEach(function (item) {
        out.push({ kind: 'check', id: item.id, text: item.text, note: '', done: !!item.done, marker: item.marker || null,
          sectionId: sec.id, sectionHeading: sec.heading || '(untitled section)', sectionColor: sec.titleColor || null, tag: null, preset: presetOf(script, item), raw: item });
      });
      sec.lines.forEach(function (line) {
        var tag = tagOf(script, line.categoryId);
        if (!tag) return;
        out.push({ kind: 'line', id: line.id, text: stripHtmlToText(line.text), note: line.note || '', done: !!line.done,
          marker: line.marker || null, sectionId: sec.id, sectionHeading: sec.heading || '(untitled section)',
          sectionColor: sec.titleColor || null, tag: tag, preset: null, raw: line });
      });
    });
    return out;
  }

  function findChecklistItem(script, itemId) {
    var all = todoEntries(script);
    for (var i = 0; i < all.length; i++) {
      if (all[i].id === itemId) {
        var e = all[i];
        // `item` stays the raw object so callers can mutate done/marker on it.
        return { item: e.raw, kind: e.kind, text: e.text, tag: e.tag, sectionId: e.sectionId,
          sectionHeading: e.sectionHeading, sectionColor: e.sectionColor };
      }
    }
    return null;
  }

  // sectionId null = the script-wide project checklist.
  function addChecklistItem(script, sectionId, text) {
    var item = { id: genId(), text: String(text).trim(), done: false };
    if (sectionId === null || sectionId === undefined || sectionId === '') {
      if (!script.projectChecklist) script.projectChecklist = [];
      script.projectChecklist.push(item);
      return item;
    }
    var sec = script.sections.find(function (s) { return s.id === sectionId; });
    if (!sec) throw new Error('section not found: ' + sectionId);
    if (!sec.checklist) sec.checklist = [];
    sec.checklist.push(item);
    return item;
  }

  function setChecklistDone(script, itemId, done) {
    var f = findChecklistItem(script, itemId);
    if (!f) throw new Error('checklist item not found: ' + itemId);
    f.item.done = !!done;
  }

  // marker = {seqId, seqName, guid, time, name, color} or null to unlink.
  function setItemMarker(script, itemId, marker) {
    var f = findChecklistItem(script, itemId);
    if (!f) throw new Error('checklist item not found: ' + itemId);
    if (marker) f.item.marker = marker;
    else delete f.item.marker;
  }

  // Every to-do that's linked to a marker.
  function linkedChecklistItems(script) {
    return todoEntries(script).filter(function (e) { return e.marker; })
      .map(function (e) { return { item: e.raw, text: e.text, sectionId: e.sectionId, sectionHeading: e.sectionHeading }; });
  }

  // Moves a to-do to another list: a section id, or null/'' for the Project
  // checklist. Checklist items can go anywhere; a tagged line only lives in a
  // section. Returns true if it moved.
  function moveTodo(script, itemId, targetSectionId) {
    var target = targetSectionId || null;
    var found = null, from = null;
    function pull(list) {
      var i = (list || []).findIndex(function (x) { return x.id === itemId; });
      if (i < 0) return false;
      found = list.splice(i, 1)[0];
      return true;
    }
    var entry = todoEntries(script).filter(function (e) { return e.id === itemId; })[0];
    if (!entry) return false;
    if (entry.kind === 'line' && !target) return false;
    if ((entry.sectionId || null) === target) return false;
    var dest;
    if (target) {
      var sec = script.sections.find(function (s) { return s.id === target; });
      if (!sec) return false;
      if (entry.kind === 'line') { if (!sec.lines) sec.lines = []; dest = sec.lines; }
      else { if (!sec.checklist) sec.checklist = []; dest = sec.checklist; }
    } else {
      if (!script.projectChecklist) script.projectChecklist = [];
      dest = script.projectChecklist;
    }
    var ok = pull(script.projectChecklist);
    script.sections.forEach(function (s) { if (!ok) ok = pull(entry.kind === 'line' ? s.lines : s.checklist); });
    if (!ok) return false;
    dest.push(found);
    return true;
  }

  // Removes to-dos by id: checklist items AND tagged lines (a line is removed
  // from the script, text and all). The ids are also recorded in
  // script.checklistTombstones so an open BijouDocs removes them too instead
  // of writing them straight back. Returns how many were removed.
  function deleteChecklistItems(script, ids) {
    var gone = {};
    ids.forEach(function (id) { gone[id] = true; });
    var removed = 0;
    function keep(list) {
      return (list || []).filter(function (i) {
        if (gone[i.id]) { removed++; return false; }
        return true;
      });
    }
    script.projectChecklist = keep(script.projectChecklist);
    script.sections.forEach(function (sec) {
      if (sec.checklist) sec.checklist = keep(sec.checklist);
      sec.lines = keep(sec.lines);
    });
    if (removed) {
      var t = (script.checklistTombstones || []).concat(ids);
      script.checklistTombstones = t.slice(-200);
    }
    return removed;
  }

  var api = {
    listScriptFiles: listScriptFiles,
    loadScript: loadScript,
    saveScript: saveScript,
    normalizeScript: normalizeScript,
    listGlobalCategories: listGlobalCategories,
    stripHtmlToText: stripHtmlToText,
    ensureCategory: ensureCategory,
    linkGlobalCategoryToScript: linkGlobalCategoryToScript,
    sectionsWithTags: sectionsWithTags,
    linesForTag: linesForTag,
    tagCounts: tagCounts,
    searchLines: searchLines,
    setLineTag: setLineTag,
    toggleLineDone: toggleLineDone,
    setLineNote: setLineNote,
    addLineToSection: addLineToSection,
    todoEntries: todoEntries,
    listPresets: listPresets,
    addPreset: addPreset,
    updatePreset: updatePreset,
    deletePreset: deletePreset,
    moveTodo: moveTodo,
    MARKER_COLORS: MARKER_COLORS,
    nearestMarkerColor: nearestMarkerColor,
    defaultMarkerColor: defaultMarkerColor,
    deleteChecklistItems: deleteChecklistItems,
    findChecklistItem: findChecklistItem,
    addChecklistItem: addChecklistItem,
    setChecklistDone: setChecklistDone,
    setItemMarker: setItemMarker,
    linkedChecklistItems: linkedChecklistItems
  };

  // CEP's Node-integration "mixed context" mode exposes `window` AND
  // Node's `module`/`exports` in the SAME panel page at once, so a plain
  // "if module exists, assume Node-only" UMD check picks the wrong branch
  // there and never sets window.BijouDataLayer (which app.js needs) even
  // though this file was loaded via a normal <script> tag. Set both
  // whenever both are present, instead of treating them as exclusive.
  if (typeof window !== 'undefined') {
    root.BijouDataLayer = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : this);
