// UI wiring for the BijouDocs Tags panel. Pure DOM, no framework —
// data logic lives in dataLayer.js (js/dataLayer.js), this file just
// renders state and reacts to clicks/input.

(function () {
  'use strict';

  var DL = window.BijouDataLayer;

  var state = {
    folderPath: '',
    scripts: [],          // [{id, path, title}]
    scriptCache: {},       // id -> loaded script object
    globalCategories: [],  // shared tag definitions from globalCategories.json
    currentScriptId: null,
    activeView: 'checklist',   // the panel opens on the Checklist
    expandedTag: {},       // sectionId -> categoryId currently shown open (Sections tab)
    expandedGlobalTag: null, // categoryId currently expanded on the Tags tab
    markerState: {},       // checklist itemId -> 'ok' | 'missing' | 'other' (linked marker's status)
    addTarget: '',         // checklist the add form targets: '' = project, else a section id
    addTag: '',            // tag for the add form: '' = a plain checklist to-do, else a category id / 'global:<id>'
    markerColor: 'auto',   // 'auto' (follow the tag colour) or a Premiere colour index
    clFilter: { status: 'all', section: '', tag: '' },
    clOptionsOpen: false,
    presetEdit: false,     // chips show a delete x and open for editing
    presetDraft: null,     // {id|null, label, color} while the preset editor is open
    clCollapsed: {},       // checklist group key -> true when folded (remembered per script)
    clFiltersOpen: false,
    searchQuery: ''
  };

  var el = {};

  // ---- icons ---------------------------------------------------------------
  // One drawn set (24px grid, 2px round stroke) instead of emoji/glyphs.
  var ICONS = {
    check: '<polyline points="5 12.5 10 17.5 19 7"/>',
    x: '<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    pin: '<path d="M12 21s-6.5-5.4-6.5-10.5a6.5 6.5 0 0 1 13 0C18.5 15.6 12 21 12 21z"/><circle cx="12" cy="10.5" r="2.3"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.2 5.6"/><polyline points="20 4 20 11 13 11"/>',
    folder: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2.5h7.5A2.5 2.5 0 0 1 21 10v7.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"/>',
    external: '<path d="M14 4h6v6"/><line x1="20" y1="4" x2="11" y2="13"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>',
    chevron: '<polyline points="6 9 12 15 18 9"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    moveto: '<path d="M3 12h13"/><path d="m12 6 6 6-6 6"/><line x1="21" y1="5" x2="21" y2="19"/>',
    pencil: '<path d="M4 20h4L19 9l-4-4L4 16z"/><line x1="13.5" y1="6.5" x2="17.5" y2="10.5"/>',
    redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
    range: '<line x1="5" y1="6" x2="5" y2="18"/><line x1="19" y1="6" x2="19" y2="18"/><line x1="5" y1="12" x2="19" y2="12"/>'
  };

  function icon(name) {
    return '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">' + ICONS[name] + '</svg>';
  }

  // Fills every <el data-icon="name"> with its drawn icon.
  function hydrateIcons(root) {
    Array.prototype.forEach.call(root.querySelectorAll('[data-icon]'), function (n) {
      n.innerHTML = icon(n.getAttribute('data-icon'));
      n.style.display = 'inline-flex';
    });
  }

  // The done control. An empty ring = not done (never an x, which reads as
  // "delete"); a filled check = done.
  function makeDoneToggle(done, titleWhenOpen, onClick) {
    var b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = icon('check');
    b.addEventListener('click', onClick);
    setDoneToggle(b, done, titleWhenOpen);
    return b;
  }
  function setDoneToggle(b, done, titleWhenOpen) {
    b.className = 'done-toggle' + (done ? ' done' : '');
    b.setAttribute('aria-pressed', done ? 'true' : 'false');
    b.title = done ? 'Done - click to reopen' : (titleWhenOpen || 'Mark done');
  }



  function init() {
    el.app = document.getElementById('app');
    hydrateIcons(document);
    el.folderInput = document.getElementById('folder-input');
    el.folderLoadBtn = document.getElementById('folder-load-btn');
    el.settingsBtn = document.getElementById('settings-btn');
    el.settingsBar = document.getElementById('settings-bar');
    el.scriptSelect = document.getElementById('script-select');
    el.refreshBtn = document.getElementById('refresh-btn');
    el.tabs = document.getElementById('tabs');
    el.statusBar = document.getElementById('status-bar');
    el.sectionsList = document.getElementById('sections-list');
    el.tagsList = document.getElementById('tags-list');
    el.checklistList = document.getElementById('checklist-list');
    el.clText = document.getElementById('cl-text');
    el.clTarget = document.getElementById('cl-target');
    el.clColor = document.getElementById('cl-color');
    el.clTagWrap = document.getElementById('cl-tag-wrap');
    el.clColorDot = document.getElementById('cl-color-dot');
    el.clPresets = document.getElementById('cl-presets');
    el.clPresetEditor = document.getElementById('cl-preset-editor');
    el.clPresetName = document.getElementById('cl-preset-name');
    el.clPresetTag = document.getElementById('cl-preset-tag');
    el.clPresetColors = document.getElementById('cl-preset-colors');
    el.clUndo = document.getElementById('cl-undo');
    el.clRedo = document.getElementById('cl-redo');
    el.clBadge = document.getElementById('cl-badge');
    el.clSeg = document.getElementById('cl-seg');
    el.clFiltersBtn = document.getElementById('cl-filters-btn');
    el.clFilterPanel = document.getElementById('cl-filter-panel');
    el.clFilterCount = document.getElementById('cl-filter-count');
    el.fSection = document.getElementById('cl-f-section');
    el.fTag = document.getElementById('cl-f-tag');
    el.clDelete = document.getElementById('cl-delete-done');
    el.clCollapseAll = document.getElementById('cl-collapse-all');
    el.searchInput = document.getElementById('search-input');
    el.searchResults = document.getElementById('search-results');

    var savedFolder = safeLocalGet('bijouExt.folderPath');
    if (savedFolder) {
      el.folderInput.value = savedFolder;
      state.folderPath = savedFolder;
      loadFolder();
    }

    el.folderLoadBtn.addEventListener('click', function () {
      state.folderPath = el.folderInput.value.trim();
      safeLocalSet('bijouExt.folderPath', state.folderPath);
      loadFolder();
    });
    el.folderInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') el.folderLoadBtn.click();
    });
    el.settingsBtn.addEventListener('click', function () { setSettingsOpen(!el.settingsBar.classList.contains('open')); });
    el.refreshBtn.addEventListener('click', function () {
      loadFolder(state.currentScriptId);
    });
    el.scriptSelect.addEventListener('change', function () {
      selectScript(el.scriptSelect.value);
    });
    el.tabs.addEventListener('click', function (e) {
      var btn = e.target.closest('.tab-btn');
      if (!btn) return;
      setActiveView(btn.getAttribute('data-view'));
    });
    el.searchInput.addEventListener('input', function () {
      state.searchQuery = el.searchInput.value;
      renderSearch();
    });

    // The add box is a <form> so Enter feels native; submitting must never reload the panel.
    document.getElementById('cl-add').addEventListener('submit', function (e) { e.preventDefault(); });
    document.getElementById('cl-add-btn').addEventListener('click', function () { addChecklistEntry(false); });
    document.getElementById('cl-add-marker-btn').addEventListener('click', function () { addChecklistEntry(true); });
    el.clText.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); addChecklistEntry(true); }
    });
    el.clTarget.addEventListener('change', function () { state.addTarget = el.clTarget.value; renderChecklist(); });
    el.clColor.addEventListener('change', function () { state.markerColor = el.clColor.value; renderChecklist(); });
    Array.prototype.forEach.call(el.clSeg.querySelectorAll('button'), function (b) {
      b.addEventListener('click', function () { state.clFilter.status = b.getAttribute('data-status'); renderChecklist(); });
    });
    el.clFiltersBtn.addEventListener('click', function () { state.clFiltersOpen = !state.clFiltersOpen; renderChecklist(); });
    [el.fSection, el.fTag].forEach(function (sel) {
      sel.addEventListener('change', function () {
        state.clFilter.section = el.fSection.value;
        state.clFilter.tag = el.fTag.value;
        renderChecklist();
      });
    });
    document.getElementById('cl-f-reset').addEventListener('click', resetChecklistFilters);
    el.clDelete.addEventListener('click', deleteCompletedChecklist);
    el.clCollapseAll.addEventListener('click', toggleAllChecklistGroups);
    el.clUndo.addEventListener('click', undo);
    document.getElementById('cl-preset-save').addEventListener('click', savePresetDraft);
    document.getElementById('cl-preset-cancel').addEventListener('click', closePresetEditor);
    el.clPresetTag.addEventListener('change', function () {
      var d = state.presetDraft;
      if (!d) return;
      var script = currentScript();
      var prevLabel = tagLabelFor(script, d.tagId);
      d.tagId = el.clPresetTag.value;
      // Picking a tag names the preset after it (unless you've typed your own name).
      var cur = el.clPresetName.value.trim();
      if (d.tagId && (!cur || cur === prevLabel)) {
        el.clPresetName.value = tagLabelFor(script, d.tagId);
        d.label = el.clPresetName.value;
      }
    });
    el.clPresetName.addEventListener('input', function () { if (state.presetDraft) state.presetDraft.label = el.clPresetName.value; });
    el.clPresetName.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); savePresetDraft(); }
      else if (e.key === 'Escape') closePresetEditor();
    });
    el.clRedo.addEventListener('click', redo);
    // Ctrl/Cmd+Z and Ctrl+Shift+Z / Ctrl+Y undo and redo the checklist, except
    // inside a text box where they keep their normal meaning.
    document.addEventListener('keydown', function (e) {
      var t = e.target && e.target.tagName;
      if (t === 'INPUT' || t === 'TEXTAREA') return;
      var mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      var k = (e.key || '').toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo(); }
    });
    // Ask Premiere not to swallow those shortcuts while this panel has focus.
    try {
      if (typeof CSInterface !== 'undefined') {
        new CSInterface().registerKeyEventsInterest(JSON.stringify([
          { keyCode: 90, ctrlKey: true }, { keyCode: 90, ctrlKey: true, shiftKey: true }, { keyCode: 89, ctrlKey: true },
          { keyCode: 90, metaKey: true }, { keyCode: 90, metaKey: true, shiftKey: true }
        ]));
      }
    } catch (err) { /* not inside Premiere */ }
    schedulePoll();

    // Coming back to the panel (e.g. after ticking things off in BijouDocs):
    // pick up the file's latest state and clear markers for anything checked
    // there. Skipped while typing so a half-written entry is never wiped.
    window.addEventListener('focus', function () {
      var a = document.activeElement;
      if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT')) return;
      reloadCurrentFromDisk();
    });

    updateEmptyState();
  }

  // The folder box is first-run setup, so it stays out of the way once a folder loads.
  function setSettingsOpen(open) {
    el.settingsBar.classList.toggle('open', open);
    el.settingsBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) el.folderInput.focus();
  }

  var visibleGroupKeys = [];

  function saveCollapsed() {
    safeLocalSet('bijouExt.collapsed.' + state.currentScriptId, JSON.stringify(state.clCollapsed));
  }
  function setGroupFolded(key, folded) {
    if (folded) state.clCollapsed[key] = true; else delete state.clCollapsed[key];
    saveCollapsed();
    renderChecklist();
  }
  // Folds every section shown, or unfolds them all when they're already all folded.
  function toggleAllChecklistGroups() {
    var anyOpen = visibleGroupKeys.some(function (k) { return !state.clCollapsed[k]; });
    visibleGroupKeys.forEach(function (k) { if (anyOpen) state.clCollapsed[k] = true; else delete state.clCollapsed[k]; });
    saveCollapsed();
    renderChecklist();
  }

  function resetChecklistFilters() {
    state.clFilter = { status: 'all', section: '', tag: '' };
    renderChecklist();
  }


  // ---- persistence helpers (localStorage can throw in some webviews) ----

  function safeLocalGet(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }
  function safeLocalSet(key, val) {
    try { window.localStorage.setItem(key, val); } catch (e) { /* ignore */ }
  }

  // ---- status messages ----------------------------------------------------

  var statusTimer = null;
  function showStatus(msg, kind, action) {
    el.statusBar.textContent = msg;
    el.statusBar.className = kind || '';
    if (action) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'link';
      b.textContent = action.label;
      b.addEventListener('click', action.fn);
      el.statusBar.appendChild(b);
    }
    if (statusTimer) clearTimeout(statusTimer);
    if (kind !== 'error') {
      statusTimer = setTimeout(function () {
        el.statusBar.textContent = '';
        el.statusBar.className = '';
      }, action ? 7000 : 2000);
    }
  }

  // ---- folder / script loading ---------------------------------------------

  function loadFolder(reselectId) {
    if (!state.folderPath) {
      showStatus('Enter the scripts folder first.', 'error');
      setSettingsOpen(true);
      return;
    }
    try {
      var files = DL.listScriptFiles(state.folderPath);
      state.scripts = [];
      state.scriptCache = {};
      try {
        state.globalCategories = DL.listGlobalCategories(state.folderPath);
      } catch (e) {
        state.globalCategories = [];
      }
      files.forEach(function (f) {
        try {
          var script = DL.loadScript(f.path);
          state.scriptCache[f.id] = script;
          state.scripts.push({ id: f.id, path: f.path, title: script.title || '(untitled)', pinned: !!script.pinned });
        } catch (e) {
          console.error('Failed to load', f.path, e);
        }
      });
      state.scripts.sort(function (a, b) {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return a.title.localeCompare(b.title);
      });
      renderScriptOptions();
      var remembered = safeLocalGet('bijouExt.scriptId');
      var toSelect = reselectId && state.scriptCache[reselectId] ? reselectId
        : remembered && state.scriptCache[remembered] ? remembered
        : (state.scripts[0] && state.scripts[0].id);
      if (toSelect) selectScript(toSelect);
      showStatus(state.scripts.length + (state.scripts.length === 1 ? ' script' : ' scripts') + ' loaded.');
      if (state.scripts.length) setSettingsOpen(false);
    } catch (e) {
      showStatus('Could not read that folder - check the path and press Load.', 'error');
      setSettingsOpen(true);
      state.scripts = [];
      state.scriptCache = {};
      renderScriptOptions();
    }
    updateEmptyState();
  }

  function updateEmptyState() {
    el.app.classList.toggle('empty', state.scripts.length === 0);
  }

  function renderScriptOptions() {
    el.scriptSelect.innerHTML = '';
    state.scripts.forEach(function (s) {
      var opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = (s.pinned ? '★ ' : '') + s.title;
      el.scriptSelect.appendChild(opt);
    });
  }

  function selectScript(id) {
    state.currentScriptId = id;
    safeLocalSet('bijouExt.scriptId', id);
    el.scriptSelect.value = id;
    state.expandedTag = {};
    state.markerState = {};
    clearHistory();
    try { state.clCollapsed = JSON.parse(safeLocalGet('bijouExt.collapsed.' + id) || '{}') || {}; } catch (e) { state.clCollapsed = {}; }
    renderAll();
    syncMarkers();
  }

  function currentScript() {
    return state.scriptCache[state.currentScriptId] || null;
  }

  function currentPath() {
    var meta = state.scripts.find(function (s) { return s.id === state.currentScriptId; });
    return meta ? meta.path : null;
  }

  function persistCurrent() {
    var script = currentScript();
    var path = currentPath();
    if (!script || !path) return;
    try {
      DL.saveScript(path, script);
      showStatus('Saved.', 'saved');
    } catch (e) {
      showStatus('Save failed: ' + e.message, 'error');
    }
  }

  // ---- view switching -------------------------------------------------------

  function setActiveView(view) {
    state.activeView = view;
    Array.prototype.forEach.call(el.tabs.querySelectorAll('.tab-btn'), function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-view') === view);
      btn.setAttribute('aria-selected', btn.getAttribute('data-view') === view ? 'true' : 'false');
    });
    document.getElementById('view-sections').classList.toggle('active', view === 'sections');
    document.getElementById('view-tags').classList.toggle('active', view === 'tags');
    document.getElementById('view-checklist').classList.toggle('active', view === 'checklist');
    document.getElementById('view-search').classList.toggle('active', view === 'search');
    renderAll();
  }

  function renderAll() {
    if (state.activeView === 'sections') renderSections();
    else if (state.activeView === 'tags') renderTags();
    else if (state.activeView === 'checklist') renderChecklist();
    else renderSearch();
  }

  // ---- color contrast helper --------------------------------------------

  // Dark or white text, whichever actually contrasts more with the chip colour
  // (a brightness guess leaves pink/grey chips unreadable).
  function textColorFor(hex) {
    if (!hex) return '#111';
    var c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map(function (ch) { return ch + ch; }).join('');
    var ch = [0, 2, 4].map(function (i) {
      var v = parseInt(c.substr(i, 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    var L = 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
    var vsWhite = 1.05 / (L + 0.05);
    var vsDark = (L + 0.05) / 0.0585;
    return vsDark >= vsWhite ? '#111' : '#fff';
  }

  // ---- Sections view -----------------------------------------------------

  function renderSections() {
    el.sectionsList.innerHTML = '';
    var script = currentScript();
    if (!script) return;
    var sections = DL.sectionsWithTags(script);

    sections.forEach(function (sec) {
      var card = document.createElement('div');
      card.className = 'section-card';

      var head = document.createElement('div');
      head.className = 'section-head';
      var heading = document.createElement('span');
      heading.className = 'heading' + (sec.done ? ' done' : '');
      heading.textContent = sec.heading || '(untitled section)';
      var addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'link';
      addBtn.innerHTML = icon('plus') + 'Add line';
      addBtn.title = 'Add a new line to this section, with a tag';
      addBtn.setAttribute('aria-expanded', 'false');
      addBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        var form = card.querySelector('.add-line-form');
        var open = form.classList.toggle('open');
        addBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) form.querySelector('input').focus();
      });
      head.appendChild(heading);
      head.appendChild(addBtn);
      card.appendChild(head);

      var tagsRow = document.createElement('div');
      tagsRow.className = 'section-tags';
      if (sec.tags.length === 0) {
        var none = document.createElement('span');
        none.className = 'empty-note';
        none.textContent = 'No tagged lines yet';
        tagsRow.appendChild(none);
      }
      sec.tags.forEach(function (tag) {
        var lines = linesInSectionForTag(script, sec.id, tag.id);
        var done = lines.filter(function (l) { return l.done; }).length;
        var open = state.expandedTag[sec.id] === tag.id;
        var pill = document.createElement('button');
        pill.type = 'button';
        pill.className = 'tag-pill';
        pill.setAttribute('aria-expanded', open ? 'true' : 'false');
        pill.title = tag.label + ': ' + done + ' of ' + lines.length + ' done - ' + (open ? 'hide' : 'show') + ' lines';
        pill.style.background = tag.color || '#4FD1C5';
        pill.style.color = textColorFor(tag.color);
        pill.innerHTML = '<span></span><span class="n">' + done + '/' + lines.length + '</span>' + icon('chevron');
        pill.firstChild.textContent = tag.label;
        pill.addEventListener('click', function () {
          state.expandedTag[sec.id] = open ? null : tag.id;
          renderSections();
        });
        tagsRow.appendChild(pill);
      });
      card.appendChild(tagsRow);

      var openTagId = state.expandedTag[sec.id];
      if (openTagId) {
        card.appendChild(renderTagLines(script, sec.id, openTagId));
      }

      card.appendChild(buildAddLineForm(script, sec.id));

      el.sectionsList.appendChild(card);
    });

    if (sections.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'no-results';
      empty.textContent = 'This script has no sections yet. Add some in BijouDocs and reload.';
      el.sectionsList.appendChild(empty);
    }
  }


  function linesInSectionForTag(script, sectionId, categoryId) {
    var sec = script.sections.find(function (s) { return s.id === sectionId; });
    if (!sec) return [];
    return sec.lines.concat(sec.checklist || []).filter(function (l) { return l.categoryId === categoryId; });
  }

  function renderTagLines(script, sectionId, categoryId) {
    var wrap = document.createElement('div');
    wrap.className = 'tag-lines';
    var lines = linesInSectionForTag(script, sectionId, categoryId);
    if (lines.length === 0) {
      wrap.textContent = 'No lines with this tag in this section.';
      wrap.style.color = 'var(--ink-faint)';
      return wrap;
    }
    lines.forEach(function (line) {
      wrap.appendChild(buildLineRow(line, function () { renderSections(); }));
    });
    return wrap;
  }

  function buildLineRow(line, onChange) {
    var row = document.createElement('div');
    row.className = 'tag-line-row';

    row.appendChild(makeDoneToggle(line.done, 'Mark done', function () {
      DL.toggleLineDone(currentScript(), line.id);
      persistCurrent();
      onChange();
    }));

    var main = document.createElement('div');
    main.style.flex = '1';
    main.style.minWidth = '0';

    var text = document.createElement('div');
    text.className = 'line-text' + (line.done ? ' done' : '');
    text.textContent = DL.stripHtmlToText(line.text);
    main.appendChild(text);

    var note = document.createElement('input');
    note.type = 'text';
    note.className = 'line-note';
    note.placeholder = 'Add a note';
    note.setAttribute('aria-label', 'Note');
    note.value = line.note || '';
    note.addEventListener('change', function () {
      DL.setLineNote(currentScript(), line.id, note.value);
      persistCurrent();
    });
    main.appendChild(note);

    row.appendChild(main);
    return row;
  }


  function buildAddLineForm(script, sectionId) {
    var form = document.createElement('div');
    form.className = 'add-line-form';

    var textInput = document.createElement('input');
    textInput.type = 'text';
    textInput.placeholder = 'New line, e.g. need ocean b-roll';
    textInput.setAttribute('aria-label', 'New line text');

    var select = buildTagSelect(script, null);
    select.setAttribute('aria-label', 'Tag for the new line');

    var addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'primary';
    addBtn.textContent = 'Add line';
    textInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') addBtn.click(); });
    addBtn.addEventListener('click', function () {
      if (!textInput.value.trim()) return;
      var categoryId = resolveTagSelectValue(script, select);
      DL.addLineToSection(script, sectionId, { text: textInput.value.trim(), categoryId: categoryId });
      persistCurrent();
      textInput.value = '';
      renderSections();
    });

    form.appendChild(textInput);
    form.appendChild(select);
    form.appendChild(addBtn);
    return form;
  }

  // A <select> of this script's own tags, plus any BijouDocs-wide global
  // tags this script hasn't linked yet (matching CategoriesTab.jsx's own
  // "unused globals" list), plus "+ New tag...". Global options are
  // prefixed "global:" so resolveTagSelectValue knows to link them in.
  function buildTagSelect(script, selectedId) {
    var select = document.createElement('select');
    var none = document.createElement('option');
    none.value = '';
    none.textContent = '(no tag)';
    select.appendChild(none);
    script.categories.forEach(function (cat) {
      var opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = cat.label;
      if (cat.id === selectedId) opt.selected = true;
      select.appendChild(opt);
    });
    var unusedGlobals = state.globalCategories.filter(function (g) {
      return !script.categories.some(function (c) { return c.globalId === g.id; });
    });
    if (unusedGlobals.length) {
      var group = document.createElement('optgroup');
      group.label = 'Global tags';
      unusedGlobals.forEach(function (g) {
        var opt = document.createElement('option');
        opt.value = 'global:' + g.id;
        opt.textContent = g.label;
        group.appendChild(opt);
      });
      select.appendChild(group);
    }
    var newOpt = document.createElement('option');
    newOpt.value = '__new__';
    newOpt.textContent = '+ New tag...';
    select.appendChild(newOpt);
    return select;
  }

  // Handles "+ New tag..." (prompts for a label, creates a local-only tag)
  // and "global:<id>" (links that shared tag into this script, mirroring
  // BijouDocs' own addExistingGlobalCategoryToScript) — otherwise just
  // returns the plain local categoryId already selected (or null).
  function resolveTagSelectValue(script, select) {
    if (select.value === '__new__') {
      var label = window.prompt('New tag name:');
      if (!label || !label.trim()) return null;
      var cat = DL.ensureCategory(script, label.trim());
      return cat.id;
    }
    if (select.value.indexOf('global:') === 0) {
      var globalId = select.value.slice('global:'.length);
      var g = state.globalCategories.find(function (gc) { return gc.id === globalId; });
      if (!g) return null;
      return DL.linkGlobalCategoryToScript(script, g).id;
    }
    return select.value || null;
  }

  // ---- Tags view (counts across the whole script, not just one section) --

  function renderTags() {
    el.tagsList.innerHTML = '';
    var script = currentScript();
    if (!script) return;
    var counts = DL.tagCounts(script);

    if (counts.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'no-results';
      empty.textContent = 'This script has no tags yet. Tag a line in BijouDocs, or from the Search tab.';
      el.tagsList.appendChild(empty);
      return;
    }

    counts.forEach(function (tag) {
      var card = document.createElement('div');
      card.className = 'section-card';

      var open = state.expandedGlobalTag === tag.id;
      var head = document.createElement('button');
      head.type = 'button';
      head.className = 'tag-head';
      head.setAttribute('aria-expanded', open ? 'true' : 'false');
      head.title = open ? 'Hide these lines' : 'Show every line with this tag';

      var swatch = document.createElement('span');
      swatch.className = 'swatch';
      swatch.style.background = tag.color || '#4FD1C5';
      head.appendChild(swatch);

      var label = document.createElement('span');
      label.className = 'heading';
      label.textContent = tag.label;
      head.appendChild(label);

      var count = document.createElement('span');
      count.className = 'count' + (tag.remaining ? '' : ' zero');
      count.textContent = tag.remaining + ' left / ' + tag.total;
      head.appendChild(count);
      head.insertAdjacentHTML('beforeend', icon('chevron'));

      head.addEventListener('click', function () {
        state.expandedGlobalTag = open ? null : tag.id;
        renderTags();
      });
      card.appendChild(head);

      if (open) card.appendChild(renderGlobalTagLines(script, tag.id));

      el.tagsList.appendChild(card);
    });
  }

  function renderGlobalTagLines(script, categoryId) {
    var wrap = document.createElement('div');
    wrap.className = 'tag-lines';
    var lines = DL.linesForTag(script, categoryId);
    if (lines.length === 0) {
      wrap.className += ' empty-note';
      wrap.textContent = 'No lines use this tag yet.';
      return wrap;
    }
    lines.forEach(function (line) {
      var row = document.createElement('div');
      row.className = 'tag-line-row stacked';

      var main = buildLineRowFromSummary(line);
      var ctx = document.createElement('div');
      ctx.className = 'section-context';
      ctx.textContent = line.sectionHeading || '(untitled section)';
      main.querySelector('.cl-ctx-slot').appendChild(ctx);
      row.appendChild(main);

      wrap.appendChild(row);
    });
    return wrap;
  }

  // Same rendering as buildLineRow, but for the {lineId, text, note, done}
  // shape linesForTag/searchLines return, rather than a raw script line.
  function buildLineRowFromSummary(summary) {
    var row = document.createElement('div');
    row.className = 'row-main';

    row.appendChild(makeDoneToggle(summary.done, 'Mark done', function () {
      DL.toggleLineDone(currentScript(), summary.lineId);
      persistCurrent();
      renderTags();
    }));

    var main = document.createElement('div');
    main.style.flex = '1';
    main.style.minWidth = '0';

    var slot = document.createElement('div');
    slot.className = 'cl-ctx-slot';
    main.appendChild(slot);

    var text = document.createElement('div');
    text.className = 'line-text' + (summary.done ? ' done' : '');
    text.textContent = summary.text;
    main.appendChild(text);

    var note = document.createElement('input');
    note.type = 'text';
    note.className = 'line-note';
    note.placeholder = 'Add a note';
    note.setAttribute('aria-label', 'Note');
    note.value = summary.note || '';
    note.addEventListener('change', function () {
      DL.setLineNote(currentScript(), summary.lineId, note.value);
      persistCurrent();
    });
    main.appendChild(note);

    row.appendChild(main);
    return row;
  }


  // ---- Premiere bridge -----------------------------------------------------

  // Calls a function in host/hostscript.jsx. Always resolves to {ok, ...} —
  // failures (no Premiere, no sequence, a script error) come back as
  // {ok:false, error}, never as a thrown exception.
  function callHost(fn, args) {
    return new Promise(function (resolve) {
      var list = args || [];
      if (window.__bijouExtHostMock) {
        resolve(window.__bijouExtHostMock(fn, list));
        return;
      }
      if (typeof CSInterface === 'undefined') {
        resolve({ ok: false, error: 'Premiere is not available here.' });
        return;
      }
      var expr = fn + '(' + list.map(function (a) { return JSON.stringify(a); }).join(',') + ')';
      try {
        new CSInterface().evalScript(expr, function (res) {
          try { resolve(JSON.parse(res)); }
          catch (e) { resolve({ ok: false, error: 'Unexpected reply from Premiere: ' + res }); }
        });
      } catch (e) {
        resolve({ ok: false, error: String(e) });
      }
    });
  }

  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    var pad = function (n) { return n < 10 ? '0' + n : String(n); };
    return (h ? h + ':' + pad(m) : m) + ':' + pad(s);
  }

  // A range marker has an end later than its start (Premiere's marker duration).
  function markerIsRange(m) {
    return typeof m.end === 'number' && m.end - m.time > 0.04;
  }

  function markerArgs(item) {
    var m = item.marker;
    return [m.seqId || '', m.guid || '', typeof m.time === 'number' ? m.time : null, m.name || item.text];
  }

  // ---- Checklist view (to-dos linked to Premiere markers) ------------------

  function opt(value, label) {
    var o = document.createElement('option');
    o.value = value;
    o.textContent = label;
    return o;
  }

  // Rebuilds a <select>'s options and keeps the current value if it still exists.
  function fillSelect(select, options, value) {
    select.innerHTML = '';
    options.forEach(function (o) { select.appendChild(opt(o[0], o[1])); });
    var exists = options.some(function (o) { return o[0] === value; });
    select.value = exists ? value : options[0][0];
    return select.value;
  }

  function markerColorHex(index) {
    var mc = DL.MARKER_COLORS[index];
    return mc ? mc.hex : '#999';
  }

  // The colour index a new marker for this to-do gets.
  function pickMarkerColor(entry) {
    return state.markerColor === 'auto' ? DL.defaultMarkerColor(entry) : Number(state.markerColor);
  }

  function filteredEntries(script) {
    var f = state.clFilter;
    return DL.todoEntries(script).filter(function (e) {
      if (f.status === 'open' && e.done) return false;
      if (f.status === 'done' && !e.done) return false;
      if (f.section === 'project' && e.sectionId !== null) return false;
      if (f.section && f.section !== 'project' && e.sectionId !== f.section) return false;
      if (f.tag === 'none' && e.tag) return false;
      if (f.tag && f.tag.indexOf('preset:') === 0 && (!e.preset || e.preset.id !== f.tag.slice(7))) return false;
      if (f.tag && f.tag !== 'none' && f.tag.indexOf('preset:') !== 0 && (!e.tag || e.tag.id !== f.tag)) return false;
      return true;
    });
  }

  function renderChecklist() {
    var script = currentScript();
    el.checklistList.innerHTML = '';
    if (!script) return;

    // Add form: which checklist (project, or any section).
    var targets = [['', 'Project']];
    script.sections.forEach(function (sec) { targets.push([sec.id, sec.heading || '(untitled section)']); });
    state.addTarget = fillSelect(el.clTarget, targets, state.addTarget);

    // Tag: none = a plain checklist to-do; a tag adds a tagged line to the
    // chosen section instead (so it also shows under that tag in BijouDocs).
    var tagSel = buildTagSelect(script, null);
    tagSel.options[0].textContent = 'No tag';
    var haveTag = Array.prototype.some.call(tagSel.options, function (o) { return o.value === state.addTag; });
    tagSel.value = haveTag ? state.addTag : '';
    state.addTag = tagSel.value;
    tagSel.setAttribute('aria-label', 'Tag');
    tagSel.addEventListener('change', function () { state.addTag = tagSel.value; renderChecklist(); });
    el.clTagWrap.innerHTML = '';
    el.clTagWrap.appendChild(tagSel);
    el.clTagSelect = tagSel;

    // Marker colour: Auto follows the tag (or section) colour.
    var colors = [['auto', 'Auto']];
    DL.MARKER_COLORS.forEach(function (c) { colors.push([String(c.index), c.name]); });
    state.markerColor = fillSelect(el.clColor, colors, String(state.markerColor));

    var dotIdx = state.markerColor === 'auto' ? null : Number(state.markerColor);
    el.clColorDot.style.background = dotIdx === null ? 'var(--ink-faint)' : markerColorHex(dotIdx);
    updateHistoryButtons();
    renderPresets(script);

    // Filters: status is always visible, section/tag fold away.
    var f = state.clFilter;
    Array.prototype.forEach.call(el.clSeg.querySelectorAll('button'), function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-status') === f.status ? 'true' : 'false');
    });
    var secOpts = [['', 'All sections'], ['project', 'Project']];
    script.sections.forEach(function (sec) { secOpts.push([sec.id, sec.heading || '(untitled section)']); });
    f.section = fillSelect(el.fSection, secOpts, f.section);
    var tagOpts = [['', 'All tags'], ['none', 'No tag']];
    script.categories.forEach(function (c) { tagOpts.push([c.id, c.label]); });
    DL.listPresets(script).forEach(function (pr) { tagOpts.push(['preset:' + pr.id, 'Preset: ' + pr.label]); });
    f.tag = fillSelect(el.fTag, tagOpts, f.tag);
    var activeFilters = (f.section ? 1 : 0) + (f.tag ? 1 : 0);
    el.clFilterCount.textContent = activeFilters ? '(' + activeFilters + ')' : '';
    el.clFilterPanel.classList.toggle('open', !!state.clFiltersOpen);
    el.clFiltersBtn.setAttribute('aria-expanded', state.clFiltersOpen ? 'true' : 'false');

    var all = DL.todoEntries(script);
    var entries = filteredEntries(script);
    var openChecks = all.filter(function (e) { return e.kind === 'check' && !e.done; }).length;
    el.clBadge.textContent = openChecks ? String(openChecks) : '';
    var doneCount = entries.filter(function (e) { return e.done; }).length;
    var doneLines = entries.filter(function (e) { return e.done && e.kind === 'line'; }).length;
    el.clDelete.textContent = doneCount ? 'Clear done (' + doneCount + ')' : 'Clear done';
    el.clDelete.title = doneLines ? 'Deletes the finished items shown, including ' + doneLines + ' tagged script line' + (doneLines === 1 ? '' : 's') + ' (you can undo)'
      : 'Deletes the finished to-dos shown (you can undo)';
    el.clDelete.disabled = !doneCount;

    if (!all.length) {
      var first = document.createElement('div');
      first.className = 'no-results';
      first.innerHTML = '<strong>Nothing to do yet</strong>Type a to-do above and press <em>Add + marker</em> to pin it to the playhead. ' +
        'Checking it off later removes the marker. Tagged lines from your script show up here too.';
      el.checklistList.appendChild(first);
      return;
    }
    if (!entries.length) {
      var none = document.createElement('div');
      none.className = 'no-results';
      none.textContent = 'No to-dos match these filters.';
      var reset = document.createElement('button');
      reset.type = 'button';
      reset.textContent = 'Show everything';
      reset.addEventListener('click', resetChecklistFilters);
      none.appendChild(document.createElement('br'));
      none.appendChild(reset);
      el.checklistList.appendChild(none);
      return;
    }

    // One card per section (project first), in script order.
    var groups = [];
    var byKey = {};
    entries.forEach(function (e) {
      var key = e.sectionId === null ? 'project' : e.sectionId;
      if (!byKey[key]) { byKey[key] = { key: key, label: e.sectionHeading, items: [] }; groups.push(byKey[key]); }
      byKey[key].items.push(e);
    });
    visibleGroupKeys = groups.map(function (g) { return g.key; });
    groups.forEach(function (g) { g.items = sortTodos(g.items); });
    groups.forEach(function (g) {
      var open = g.items.filter(function (i) { return !i.done; }).length;
      var folded = !!state.clCollapsed[g.key];
      var card = document.createElement('div');
      card.className = 'section-card';
      var head = document.createElement('button');
      head.type = 'button';
      head.className = 'tag-head';
      head.setAttribute('aria-expanded', folded ? 'false' : 'true');
      head.title = folded ? 'Show these to-dos' : 'Fold these to-dos';
      var label = document.createElement('span');
      label.className = 'heading';
      label.textContent = g.label;
      var count = document.createElement('span');
      count.className = 'count' + (open ? '' : ' zero');
      count.textContent = open + ' left / ' + g.items.length;
      head.appendChild(label);
      head.appendChild(count);
      head.insertAdjacentHTML('beforeend', icon('chevron'));
      head.addEventListener('click', function () { setGroupFolded(g.key, !folded); });
      card.appendChild(head);
      if (!folded) {
        var body = document.createElement('div');
        body.className = 'tag-lines';
        g.items.forEach(function (e) { body.appendChild(buildChecklistRow(e)); });
        card.appendChild(body);
      }
      el.checklistList.appendChild(card);
    });
    var anyOpen = groups.some(function (g) { return !state.clCollapsed[g.key]; });
    el.clCollapseAll.textContent = anyOpen ? 'Collapse all' : 'Expand all';
  }

  // Within a section: to-dos with no marker first, in the order they appear in
  // the section; then the ones with markers, in timeline order.
  function sortTodos(items) {
    var indexed = items.map(function (e, i) { return { e: e, i: i }; });
    var unmarked = indexed.filter(function (x) { return !x.e.marker; });
    var marked = indexed.filter(function (x) { return !!x.e.marker; });
    marked.sort(function (a, b) { return (a.e.marker.time - b.e.marker.time) || (a.i - b.i); });
    return unmarked.concat(marked).map(function (x) { return x.e; });
  }

  function buildChecklistRow(e) {
    var row = document.createElement('div');
    row.className = 'cl-item';

    row.appendChild(makeDoneToggle(e.done, e.marker ? 'Mark done (removes its marker)' : 'Mark done', function () { toggleChecklistDone(e.id); }));

    var main = document.createElement('div');
    main.className = 'cl-main';
    var text = document.createElement('div');
    text.className = 'cl-text' + (e.done ? ' done' : '');
    text.textContent = e.text;
    if (e.kind === 'check') {
      // Checklist items are the panel's own, so their text can be edited here.
      // (Tagged lines are script text with formatting - edit those in BijouDocs.)
      text.className += ' editable';
      text.title = 'Click to edit';
      text.addEventListener('click', function () { startTextEdit(text, e); });
    }
    main.appendChild(text);
    // The BijouDocs note attached to a tagged line, shown under it (click to edit).
    if (e.kind === 'line' && e.note) {
      var note = document.createElement('div');
      note.className = 'cl-note';
      note.textContent = e.note;
      note.title = 'Click to edit the note';
      note.addEventListener('click', function () { startNoteEdit(note, e); });
      main.appendChild(note);
    }
    if (e.tag) {
      var chip = document.createElement('span');
      chip.className = 'cl-tag';
      chip.style.background = e.tag.color || '#4FD1C5';
      chip.style.color = textColorFor(e.tag.color);
      chip.textContent = e.tag.label;
      main.appendChild(chip);
    }
    if (e.preset) {
      var pchip = document.createElement('span');
      pchip.className = 'cl-tag preset';
      var phex = markerColorHex(e.preset.color);
      pchip.style.background = phex;
      pchip.style.color = textColorFor(phex);
      pchip.textContent = e.preset.label;
      main.appendChild(pchip);
    }
    row.appendChild(main);

    if (e.sectionId !== null) row.appendChild(buildOpenButton(e));
    row.appendChild(buildMoveControl(e));

    var del = document.createElement('button');
    del.type = 'button';
    del.className = 'cl-del';
    del.innerHTML = icon('x');
    var what = e.kind === 'line' ? 'Delete this line from the script' : 'Delete this to-do';
    del.title = what + ' (you can undo)';
    del.setAttribute('aria-label', what);
    del.addEventListener('click', function () { deleteOneChecklist(e); });
    row.appendChild(del);

    if (e.marker) {
      var status = state.markerState[e.id];
      var pin = document.createElement('span');
      var isRange = markerIsRange(e.marker);
      pin.className = 'cl-pin' + (isRange ? ' range' : '') + (status === 'missing' ? ' missing' : status === 'other' ? ' other' : '');
      var dot = document.createElement('span');
      dot.className = 'cl-dot' + (isRange ? ' range' : '');
      dot.style.background = markerColorHex(typeof e.marker.color === 'number' ? e.marker.color : DL.defaultMarkerColor(e));
      pin.appendChild(dot);
      var go = document.createElement('button');
      go.type = 'button';
      go.className = 'go';
      var where = e.marker.seqName ? ' in "' + e.marker.seqName + '"' : '';
      if (status === 'missing') {
        go.textContent = 'Marker missing';
        go.title = 'The marker was deleted in Premiere - click to place a new one at the playhead';
        go.addEventListener('click', function () { relinkMarker(e.id); });
      } else {
        if (isRange) {
          go.innerHTML = icon('range');
          go.appendChild(document.createTextNode(fmtTime(e.marker.time) + '–' + fmtTime(e.marker.end)));
          go.title = 'Range marker, ' + fmtTime(e.marker.end - e.marker.time) + ' long - jump to its start' + where;
        } else {
          go.textContent = fmtTime(e.marker.time);
          go.title = 'Jump the playhead to this marker' + where;
        }
        go.addEventListener('click', function () { gotoMarker(e.id); });
      }
      var x = document.createElement('button');
      x.type = 'button';
      x.className = 'x';
      x.innerHTML = icon('x');
      x.title = 'Remove the marker (keeps the to-do)';
      x.setAttribute('aria-label', 'Remove the marker, keep the to-do');
      x.addEventListener('click', function () { unlinkMarker(e.id); });
      pin.appendChild(go);
      pin.appendChild(x);
      row.appendChild(pin);
    } else if (!e.done) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cl-marker-btn';
      btn.innerHTML = icon('pin') + 'Marker';
      btn.title = 'Drop a marker at the playhead for this to-do';
      btn.addEventListener('click', function () { placeMarker(e.id); });
      row.appendChild(btn);
    }
    return row;
  }


  // Click a to-do's text to edit it in place: Enter or clicking away saves,
  // Escape cancels. The Premiere marker is renamed to match.
  function startTextEdit(textEl, e) {
    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'cl-edit';
    input.value = e.text;
    input.setAttribute('aria-label', 'Edit to-do text');
    var done = false;
    function finish(save) {
      if (done) return;
      done = true;
      var v = input.value.trim();
      if (save && v && v !== e.text) editChecklistText(e, v);
      else renderChecklist();
    }
    input.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); finish(true); }
      else if (ev.key === 'Escape') { ev.preventDefault(); finish(false); }
    });
    input.addEventListener('blur', function () { finish(true); });
    textEl.replaceWith(input);
    input.focus();
    input.select();
  }

  function startNoteEdit(noteEl, e) {
    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'cl-edit';
    input.value = e.note;
    input.setAttribute('aria-label', 'Edit note');
    var done = false;
    function finish(save) {
      if (done) return;
      done = true;
      if (save && input.value !== e.note) editNote(e, input.value.trim());
      else renderChecklist();
    }
    input.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); finish(true); }
      else if (ev.key === 'Escape') { ev.preventDefault(); finish(false); }
    });
    input.addEventListener('blur', function () { finish(true); });
    noteEl.replaceWith(input);
    input.focus();
    input.select();
  }

  // Saves a tagged line's note (clearing it removes the note). Undoable.
  function editNote(e, newNote) {
    var script = currentScript();
    return recordAction('Edit note on "' + shortText(e.text) + '"', function () {
      DL.setLineNote(script, e.id, newNote);
      persistCurrent();
      renderAll();
    });
  }

  function editChecklistText(e, newText) {
    var script = currentScript();
    var found = script && DL.findChecklistItem(script, e.id);
    if (!found || found.kind !== 'check') { renderChecklist(); return Promise.resolve(); }
    var item = found.item;
    var oldText = item.text;
    return recordAction('Edit "' + shortText(oldText) + '"', function () {
      item.text = newText;
      item.textEditedAt = Date.now();
      if (!item.marker) { persistCurrent(); renderAll(); return; }
      var args = markerArgs(item);
      return callHost('bdRenameMarker', [args[0], args[1], args[2], item.marker.name || oldText, newText]).then(function (r) {
        if (r.ok) item.marker.name = newText;
        else showStatus('Saved, but the marker in Premiere kept its old name (' + (r.error || 'unknown error') + ').', 'error');
        persistCurrent();
        renderAll();
      });
    });
  }

  // Opens BijouDocs at this to-do: the tagged line itself, or the section a
  // checklist item belongs to. Uses a bijoudocs:// link, so it also starts
  // BijouDocs if it isn't running.
  function bijouLink(e) {
    var q = 'script=' + encodeURIComponent(state.currentScriptId);
    if (e.sectionId) q += '&section=' + encodeURIComponent(e.sectionId);
    if (e.kind === 'line') q += '&line=' + encodeURIComponent(e.id);
    return 'bijoudocs://open?' + q;
  }

  function launchUrl(url) {
    try {
      if (typeof require === 'function' && typeof process !== 'undefined') {
        var cp = require('child_process');
        var child;
        if (process.platform === 'win32') {
          // start "" "<url>": the quotes keep the & in the link from splitting the command.
          child = cp.spawn('cmd.exe', ['/c', 'start "" "' + url + '"'], { detached: true, stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: true });
        } else {
          child = cp.spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { detached: true, stdio: 'ignore' });
        }
        child.on('error', function () { showStatus('Could not open BijouDocs.', 'error'); });
        child.unref();
        return true;
      }
    } catch (err) { /* fall through */ }
    window.open(url);
    return false;
  }

  function buildOpenButton(e) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'cl-open';
    b.innerHTML = icon('external');
    var what = e.kind === 'line' ? 'this line' : 'this section';
    b.title = 'Show ' + what + ' in BijouDocs';
    b.setAttribute('aria-label', b.title);
    b.addEventListener('click', function () {
      launchUrl(bijouLink(e));
      showStatus('Opening BijouDocs... (if nothing happens, BijouDocs needs updating)');
    });
    return b;
  }

  // "Forgot where it goes?" - move a to-do to another list. Checklist items can
  // go to Project or any section; a tagged line only moves between sections.
  function buildMoveControl(e) {
    var script = currentScript();
    var wrap = document.createElement('span');
    wrap.className = 'cl-move';
    wrap.title = 'Move to another list';
    wrap.innerHTML = icon('moveto');
    var sel = document.createElement('select');
    sel.setAttribute('aria-label', 'Move "' + shortText(e.text) + '" to');
    sel.appendChild(opt('', 'Move to...'));
    sel.options[0].disabled = true;
    if (e.kind === 'check' && e.sectionId !== null) sel.appendChild(opt('__project__', 'Project checklist'));
    if (e.kind === 'line') sel.appendChild(opt('__checklist__', 'Out of the script, into the checklist'));
    script.sections.forEach(function (sec) {
      if (sec.id === e.sectionId) return;
      sel.appendChild(opt(sec.id, sec.heading || '(untitled section)'));
    });
    sel.value = '';
    if (sel.options.length < 2) return document.createDocumentFragment();
    sel.addEventListener('change', function () {
      if (sel.value === '__checklist__') convertEntry(e);
      else moveEntry(e, sel.value === '__project__' ? null : sel.value);
    });
    wrap.appendChild(sel);
    return wrap;
  }

  // A tagged line that was added from here by mistake (it landed in the script
  // text): file it in the section's checklist instead.
  function convertEntry(e) {
    var script = currentScript();
    return recordAction('Move "' + shortText(e.text) + '" out of the script', function () {
      if (!DL.convertLineToChecklist(script, e.id)) return;
      persistCurrent();
      renderAll();
    }).then(function () { showStatus('Moved into the section\'s checklist - the script text is untouched.', 'saved'); });
  }

  function moveEntry(e, targetSectionId) {
    var script = currentScript();
    var sec = targetSectionId && script.sections.find(function (x) { return x.id === targetSectionId; });
    var where = targetSectionId ? (sec ? sec.heading || 'section' : 'section') : 'Project';
    return recordAction('Move "' + shortText(e.text) + '" to ' + where, function () {
      if (!DL.moveTodo(script, e.id, targetSectionId)) return;
      persistCurrent();
      renderAll();
    }).then(function () { showStatus('Moved to ' + where + '.', 'saved'); });
  }

  function markerComments(f) {
    var script = currentScript();
    var where = f.sectionHeading + (f.tag ? ' / ' + f.tag.label : '');
    return 'BijouDocs: ' + (script ? script.title : '') + (where ? ' / ' + where : '');
  }

  // ---- undo / redo -----------------------------------------------------------
  // Every checklist action (add, place/remove a marker, check off, delete) is
  // recorded as a before/after snapshot of the parts of the script it can
  // touch. Undo/redo restore that snapshot AND bring Premiere's markers back in
  // line (deleting a marker the snapshot doesn't have, re-creating one it does).

  var history = { undo: [], redo: [] };
  var MAX_HISTORY = 50;
  var historyBusy = false;

  function trackedState(script) {
    return JSON.stringify({
      p: script.projectChecklist || [],
      t: script.checklistTombstones || [],
      s: script.sections.map(function (sec) { return { id: sec.id, c: sec.checklist || [], l: sec.lines }; })
    });
  }

  function applyTracked(script, json) {
    var st = JSON.parse(json);
    script.projectChecklist = st.p;
    if (st.t.length) script.checklistTombstones = st.t; else delete script.checklistTombstones;
    st.s.forEach(function (x) {
      var sec = script.sections.find(function (s) { return s.id === x.id; });
      if (sec) { sec.checklist = x.c; sec.lines = x.l; }
    });
  }

  // itemId -> item, for every to-do in a snapshot that has a marker link.
  function markerMap(json) {
    var st = JSON.parse(json), map = {};
    function take(list) { (list || []).forEach(function (it) { if (it.marker) map[it.id] = it; }); }
    take(st.p);
    st.s.forEach(function (x) { take(x.c); take(x.l); });
    return map;
  }

  function sameMarker(a, b) {
    if (a.guid || b.guid) return a.guid === b.guid;
    return a.time === b.time && a.seqId === b.seqId;
  }

  // A re-created marker gets a new guid; rewrite the old one everywhere in
  // the history so later undo/redo steps still find it.
  function remapHistory(oldGuid, newGuid) {
    var from = JSON.stringify(oldGuid), to = JSON.stringify(newGuid);
    ['undo', 'redo'].forEach(function (k) {
      history[k].forEach(function (h) {
        h.before = h.before.split(from).join(to);
        h.after = h.after.split(from).join(to);
      });
    });
  }

  // Makes Premiere match `toJson`, starting from what `fromJson` says is there.
  // Resolves { json: toJson with fresh guids, warnings }.
  function reconcileMarkers(fromJson, toJson) {
    var from = markerMap(fromJson), to = markerMap(toJson);
    var chain = Promise.resolve();
    var warnings = 0;
    var remap = [];
    Object.keys(from).forEach(function (id) {
      if (to[id] && sameMarker(to[id].marker, from[id].marker)) return;
      chain = chain.then(function () {
        return removeLinkedMarker(from[id]).then(function (r) { if (!r.ok) warnings++; });
      });
    });
    // Same marker, different name (the to-do's text was edited): rename it in Premiere.
    Object.keys(to).forEach(function (id) {
      if (!from[id] || !sameMarker(from[id].marker, to[id].marker)) return;
      if ((from[id].marker.name || '') === (to[id].marker.name || '')) return;
      var fm = from[id].marker;
      chain = chain.then(function () {
        return callHost('bdRenameMarker', [fm.seqId || '', fm.guid || '', typeof fm.time === 'number' ? fm.time : null, fm.name || '', to[id].marker.name || to[id].text || '']).then(function (r) { if (!r.ok) warnings++; });
      });
    });
    Object.keys(to).forEach(function (id) {
      if (from[id] && sameMarker(from[id].marker, to[id].marker)) return;
      var m = to[id].marker;
      chain = chain.then(function () {
        return callHost('bdRecreateMarker', [m.seqId || '', m.name || to[id].text || '', m.comments || '',
          typeof m.color === 'number' ? m.color : 3, m.time, typeof m.end === 'number' ? m.end : null]).then(function (r) {
          if (!r.ok) { warnings++; return; }
          if (m.guid && r.guid) remap.push([m.guid, r.guid]);
        });
      });
    });
    return chain.then(function () {
      var out = toJson;
      remap.forEach(function (p) {
        out = out.split(JSON.stringify(p[0])).join(JSON.stringify(p[1]));
        remapHistory(p[0], p[1]);
      });
      return { json: out, warnings: warnings };
    });
  }

  function stepHistory(dir) {
    var stack = dir === 'undo' ? history.undo : history.redo;
    var other = dir === 'undo' ? history.redo : history.undo;
    var entry = stack[stack.length - 1];
    var script = currentScript();
    if (!entry || !script || historyBusy) return Promise.resolve();
    historyBusy = true;
    var target = dir === 'undo' ? entry.before : entry.after;
    var current = trackedState(script);
    // What the script looks like right now (including edits made in Premiere
    // since, like a stretched range) is what the opposite step should restore.
    if (dir === 'undo') entry.after = current; else entry.before = current;
    return reconcileMarkers(current, target).then(function (res) {
      stack.pop();
      other.push(entry);
      applyTracked(script, res.json);
      state.markerState = {};
      persistCurrent();
      renderAll();
      updateHistoryButtons();
      if (res.warnings) showStatus((dir === 'undo' ? 'Undid' : 'Redid') + ' - but some Premiere markers could not be updated.', 'error');
      else showStatus((dir === 'undo' ? 'Undid: ' : 'Redid: ') + entry.label, 'saved');
    }).then(function () { historyBusy = false; }, function () { historyBusy = false; });
  }
  function undo() { return stepHistory('undo'); }
  function redo() { return stepHistory('redo'); }

  function clearHistory() {
    history.undo = [];
    history.redo = [];
    updateHistoryButtons();
  }

  function updateHistoryButtons() {
    if (!el.clUndo) return;
    var u = history.undo[history.undo.length - 1], r = history.redo[history.redo.length - 1];
    el.clUndo.disabled = !u;
    el.clRedo.disabled = !r;
    el.clUndo.title = u ? 'Undo: ' + u.label + ' (Ctrl+Z)' : 'Nothing to undo';
    el.clRedo.title = r ? 'Redo: ' + r.label + ' (Ctrl+Shift+Z)' : 'Nothing to redo';
  }

  // Runs `run` (which mutates the script and/or Premiere and returns a
  // promise) and records it as one undo step if anything it tracks changed.
  function recordAction(label, run) {
    var script = currentScript();
    if (!script || historyBusy) return Promise.resolve();
    var before = trackedState(script);
    return Promise.resolve(run()).then(function (result) {
      if (currentScript() === script) {
        var after = trackedState(script);
        if (after !== before) {
          history.undo.push({ label: label, before: before, after: after });
          if (history.undo.length > MAX_HISTORY) history.undo.shift();
          history.redo = [];
        }
      }
      updateHistoryButtons();
      return result;
    });
  }

  function shortText(t) {
    t = String(t || '').replace(/\s+/g, ' ').trim();
    return t.length > 28 ? t.slice(0, 27) + '…' : t;
  }

  // ---- marker + checklist actions ----------------------------------------------

  // Drops a marker at the playhead and links it to the to-do (no undo record).
  function placeMarkerCore(itemId, colorOverride) {
    var script = currentScript();
    var found = script && DL.findChecklistItem(script, itemId);
    if (!found) return Promise.resolve(false);
    var color = typeof colorOverride === 'number' ? colorOverride : pickMarkerColor(found);
    var comments = markerComments(found);
    return callHost('bdAddMarker', [found.text, comments, color]).then(function (r) {
      if (!r.ok) { showStatus(r.error || 'Could not place the marker.', 'error'); return false; }
      DL.setItemMarker(script, itemId, { seqId: r.seqId, seqName: r.seqName, guid: r.guid, time: r.time, name: found.text, color: color, comments: comments, placedAt: Date.now() });
      state.markerState[itemId] = 'ok';
      persistCurrent();
      renderAll();
      return true;
    });
  }

  function placeMarker(itemId) {
    var f = DL.findChecklistItem(currentScript(), itemId);
    return recordAction('Add marker' + (f ? ' for "' + shortText(f.text) + '"' : ''), function () { return placeMarkerCore(itemId); });
  }

  function relinkMarker(itemId) {
    var f = DL.findChecklistItem(currentScript(), itemId);
    return recordAction('Replace marker' + (f ? ' for "' + shortText(f.text) + '"' : ''), function () {
      DL.setItemMarker(currentScript(), itemId, null);
      delete state.markerState[itemId];
      return placeMarkerCore(itemId);
    });
  }

  function gotoMarker(itemId) {
    var found = DL.findChecklistItem(currentScript(), itemId);
    if (!found || !found.item.marker) return;
    callHost('bdGotoMarker', markerArgs(found.item)).then(function (r) {
      if (r.ok) return;
      showStatus(r.error || 'Could not jump to the marker.', 'error');
      state.markerState[itemId] = 'missing';
      renderAll();
    });
  }

  function removeLinkedMarker(item) {
    return callHost('bdDeleteMarker', markerArgs(item));
  }

  // Removes the marker and the link. A failed removal keeps the link so a
  // later sync can retry, and says so.
  function unlinkMarker(itemId) {
    var script = currentScript();
    var found = DL.findChecklistItem(script, itemId);
    if (!found || !found.item.marker) return Promise.resolve();
    return recordAction('Remove marker for "' + shortText(found.text) + '"', function () {
      return removeLinkedMarker(found.item).then(function (r) {
        if (!r.ok) { showStatus('Could not remove the marker: ' + r.error, 'error'); return; }
        DL.setItemMarker(script, itemId, null);
        delete state.markerState[itemId];
        persistCurrent();
        renderAll();
      });
    });
  }

  // Checking an item off deletes its marker; unchecking just unchecks.
  function toggleChecklistDone(itemId) {
    var script = currentScript();
    var found = DL.findChecklistItem(script, itemId);
    if (!found) return Promise.resolve();
    var item = found.item;
    var label = (item.done ? 'Reopen "' : 'Check off "') + shortText(found.text) + '"';
    return recordAction(label, function () {
      if (item.done) {
        DL.setChecklistDone(script, itemId, false);
        persistCurrent();
        renderAll();
        return;
      }
      DL.setChecklistDone(script, itemId, true);
      if (!item.marker) {
        persistCurrent();
        renderAll();
        return;
      }
      return removeLinkedMarker(item).then(function (r) {
        if (r.ok) {
          DL.setItemMarker(script, itemId, null);
          delete state.markerState[itemId];
        } else {
          showStatus('Checked off, but the marker is still in Premiere (' + r.error + ').', 'error');
        }
        persistCurrent();
        renderAll();
      });
    });
  }

  function addChecklistEntry(withMarker) {
    var script = currentScript();
    var text = el.clText.value.trim();
    if (!script || !text) return Promise.resolve();
    var tagged = !!(el.clTagSelect && el.clTagSelect.value);
    var categoryId = null;
    if (tagged) {
      categoryId = resolveTagSelectValue(script, el.clTagSelect);
      if (!categoryId) return Promise.resolve();
    }
    return recordAction('Add "' + shortText(text) + '"', function () {
      // Always a checklist item (BijouDocs' per-section "Checkpoints" panel), with
      // the tag on it - never a new line in the script itself.
      var item = DL.addChecklistItem(script, state.addTarget || null, text, categoryId);
      el.clText.value = '';
      persistCurrent();
      if (!withMarker) { renderAll(); return; }
      return placeMarkerCore(item.id).then(function (ok) {
        if (!ok) renderAll(); // the to-do exists either way; the marker can be added later
      });
    });
  }

  function deleteEntries(entries, label) {
    var script = currentScript();
    return recordAction(label, function () {
      var chain = Promise.resolve();
      entries.forEach(function (e) {
        if (!e.marker) return;
        chain = chain.then(function () { return removeLinkedMarker(e.raw); });
      });
      return chain.then(function () {
        var n = DL.deleteChecklistItems(script, entries.map(function (e) { return e.id; }));
        persistCurrent();
        renderAll();
        return n;
      });
    }).then(function () {
      showStatus(label + '.', 'saved', { label: 'Undo', fn: undo });
    });
  }

  function deleteOneChecklist(e) {
    return deleteEntries([e], 'Deleted "' + shortText(e.text) + '"');
  }

  // "Clear done": every finished to-do shown, checklist items and tagged lines.
  function doneEntries() {
    var script = currentScript();
    return script ? filteredEntries(script).filter(function (e) { return e.done; }) : [];
  }
  function deleteCompletedChecklist() {
    var victims = doneEntries();
    if (!victims.length) return Promise.resolve();
    return deleteEntries(victims, 'Deleted ' + victims.length + ' finished item' + (victims.length === 1 ? '' : 's'));
  }

  // ---- presets ----------------------------------------------------------------
  // Per-project quick-add chips (SFX, POV, VFX...). Each has its own marker
  // colour; using one never touches the Goes in / Tag / Marker colour pickers,
  // so "Auto" stays Auto.

  function renderPresets(script) {
    var presets = DL.listPresets(script);
    el.clPresets.innerHTML = '';
    presets.forEach(function (p) {
      var hex = markerColorHex(p.color);
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'preset-chip' + (state.presetDraft && state.presetDraft.id === p.id ? ' editing' : '');
      chip.style.background = hex;
      chip.style.color = textColorFor(hex);
      var label = document.createElement('span');
      label.textContent = p.label;
      chip.appendChild(label);
      if (state.presetEdit) {
        chip.title = 'Edit "' + p.label + '"';
        var x = document.createElement('span');
        x.className = 'x';
        x.innerHTML = icon('x');
        x.title = 'Delete this preset';
        x.addEventListener('click', function (ev) { ev.stopPropagation(); removePreset(p.id); });
        chip.appendChild(x);
        chip.addEventListener('click', function () { openPresetEditor({ id: p.id, label: p.label, color: p.color, tagId: p.tagId || '' }); });
      } else {
        chip.title = (p.tagId && tagLabelFor(script, p.tagId)
          ? 'Add a to-do tagged ' + tagLabelFor(script, p.tagId) + ' to the "Goes in" list'
          : 'Add a to-do to the "Goes in" list') + ', with a ' + DL.MARKER_COLORS[p.color].name.toLowerCase() + ' marker';
        chip.addEventListener('click', function () { addFromPreset(p); });
      }
      el.clPresets.appendChild(chip);
    });
    var add = document.createElement('button');
    add.type = 'button';
    add.className = 'preset-add';
    add.textContent = '+ Preset';
    add.title = 'Make a quick-add button for this project, e.g. SFX, POV or VFX';
    add.addEventListener('click', function () { openPresetEditor({ id: null, label: '', color: 3 }); });
    el.clPresets.appendChild(add);
    if (presets.length) {
      var edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'preset-edit';
      edit.innerHTML = icon('pencil');
      edit.title = state.presetEdit ? 'Done editing presets' : 'Edit or delete presets';
      edit.setAttribute('aria-label', edit.title);
      edit.setAttribute('aria-pressed', state.presetEdit ? 'true' : 'false');
      edit.addEventListener('click', function () { state.presetEdit = !state.presetEdit; if (!state.presetEdit) state.presetDraft = null; renderChecklist(); });
      el.clPresets.appendChild(edit);
    }
    renderPresetEditor();
  }

  // Display name of a tag value used by the preset editor ('' = none, 'global:<id>' = a shared tag).
  function tagLabelFor(script, value) {
    if (!value) return '';
    if (value.indexOf('global:') === 0) {
      var g = state.globalCategories.find(function (x) { return x.id === value.slice(7); });
      return g ? g.label : '';
    }
    var c = script && script.categories.find(function (x) { return x.id === value; });
    return c ? c.label : '';
  }

  // Tags the preset can be based on: this script's own, plus shared ones it hasn't linked yet.
  function fillPresetTagSelect(script, selected) {
    var sel = el.clPresetTag;
    sel.innerHTML = '';
    sel.appendChild(opt('', 'None - just a preset'));
    script.categories.forEach(function (c) { sel.appendChild(opt(c.id, c.label)); });
    state.globalCategories.filter(function (g) {
      return !script.categories.some(function (c) { return c.globalId === g.id; });
    }).forEach(function (g) { sel.appendChild(opt('global:' + g.id, g.label + ' (shared)')); });
    sel.value = Array.prototype.some.call(sel.options, function (o) { return o.value === selected; }) ? selected : '';
  }

  function renderPresetEditor() {
    var d = state.presetDraft;
    el.clPresetEditor.classList.toggle('open', !!d);
    if (!d) return;
    if (document.activeElement !== el.clPresetName) el.clPresetName.value = d.label;
    fillPresetTagSelect(currentScript(), d.tagId || '');
    el.clPresetColors.innerHTML = '';
    DL.MARKER_COLORS.forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button';
      b.style.background = c.hex;
      b.title = c.name;
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-label', c.name);
      b.setAttribute('aria-checked', d.color === c.index ? 'true' : 'false');
      b.addEventListener('click', function () { d.color = c.index; renderPresetEditor(); });
      el.clPresetColors.appendChild(b);
    });
  }

  function openPresetEditor(draft) {
    draft.tagId = draft.tagId || '';
    state.presetDraft = draft;
    renderChecklist();
    el.clPresetName.focus();
  }

  function closePresetEditor() {
    state.presetDraft = null;
    renderChecklist();
  }

  function savePresetDraft() {
    var script = currentScript();
    var d = state.presetDraft;
    if (!script || !d) return;
    var tagValue = el.clPresetTag.value;
    var label = (el.clPresetName.value || '').trim() || tagLabelFor(script, tagValue);
    if (!label) { showStatus('Give the preset a name, or base it on a tag.', 'error'); el.clPresetName.focus(); return; }
    // A preset named like an existing tag IS that tag - link it rather than duplicate it.
    var linkedByName = false;
    if (!tagValue) {
      var same = script.categories.find(function (c) { return c.label.toLowerCase() === label.toLowerCase(); });
      if (same) { tagValue = same.id; label = same.label; linkedByName = true; }
    }
    var tagId = '';
    if (tagValue.indexOf('global:') === 0) {
      var g = state.globalCategories.find(function (x) { return x.id === tagValue.slice(7); });
      if (g) tagId = DL.linkGlobalCategoryToScript(script, g).id;
    } else {
      tagId = tagValue;
    }
    if (d.id) DL.updatePreset(script, d.id, label, d.color, tagId);
    else DL.addPreset(script, label, d.color, tagId);
    state.presetDraft = null;
    persistCurrent();
    renderChecklist();
    if (linkedByName) showStatus('Linked to your existing tag "' + label + '" instead of making a duplicate.', 'saved');
  }

  function removePreset(id) {
    var script = currentScript();
    if (!script) return;
    DL.deletePreset(script, id);
    if (state.presetDraft && state.presetDraft.id === id) state.presetDraft = null;
    persistCurrent();
    renderChecklist();
  }

  // One click: a to-do (typed text, or the preset's name if the box is empty)
  // in the chosen "Goes in" list, with a marker in the preset's colour. The Tag
  // picker is ignored on purpose - a preset is its own kind of label.
  function addFromPreset(p) {
    var script = currentScript();
    if (!script) return Promise.resolve();
    var text = el.clText.value.trim() || p.label;
    var tagged = !!(p.tagId && script.categories.some(function (c) { return c.id === p.tagId; }));
    return recordAction('Add "' + shortText(text) + '" (' + p.label + ')', function () {
      var item = DL.addChecklistItem(script, state.addTarget || null, text, tagged ? p.tagId : null);
      if (!tagged) item.preset = { id: p.id, label: p.label, color: p.color };
      el.clText.value = '';
      persistCurrent();
      return placeMarkerCore(item.id, p.color).then(function (ok) {
        if (!ok) renderAll();
      });
    });
  }

  // Housekeeping: anything linked to a marker but already checked off (e.g.
  // in BijouDocs) loses its marker, and the rest are checked against the
  // sequence so a hand-deleted marker shows as missing.
  function syncMarkers() {
    var script = currentScript();
    if (!script) return Promise.resolve();
    var linked = DL.linkedChecklistItems(script);
    var chain = Promise.resolve();
    var changed = false, saveNeeded = false, doneCleared = false, cleanedUp = false;
    linked.forEach(function (entry) {
      var item = entry.item;
      chain = chain.then(function () {
        if (item.done) {
          return removeLinkedMarker(item).then(function (r) {
            if (r.ok) { DL.setItemMarker(script, item.id, null); delete state.markerState[item.id]; changed = true; doneCleared = true; }
          });
        }
        return callHost('bdMarkerExists', markerArgs(item)).then(function (r) {
          if (!r.ok) return;
          // Premiere's own undo (Ctrl+Z on the timeline) undoes the marker's
          // properties one at a time and leaves a plain marker behind. A marker the
          // panel placed moments ago whose name has been blanked is exactly that:
          // finish the undo by removing it (the to-do stays, unpinned).
          if (r.exists && r.name === '' && item.marker.name && Date.now() - (item.marker.placedAt || 0) < UNDO_CLEANUP_MS) {
            return removeLinkedMarker(item).then(function (rm) {
              if (!rm.ok) return;
              DL.setItemMarker(script, item.id, null);
              delete state.markerState[item.id];
              saveNeeded = true;
              changed = true;
              cleanedUp = true;
            });
          }
          var next = !r.sequenceFound ? 'other' : r.exists ? 'ok' : 'missing';
          if (state.markerState[item.id] !== next) { state.markerState[item.id] = next; changed = true; }
          // The marker moved (ripple delete, trim, drag): follow it.
          if (r.exists && typeof r.time === 'number' && Math.abs(r.time - item.marker.time) > 0.01) {
            item.marker.time = r.time;
            saveNeeded = true;
            changed = true;
          }
          // Range markers: follow a changed end (or a range turned back into a point).
          if (r.exists && typeof r.end === 'number') {
            var newEnd = r.end - (typeof r.time === 'number' ? r.time : item.marker.time) > 0.04 ? r.end : null;
            if (newEnd === null && typeof item.marker.end === 'number') { delete item.marker.end; saveNeeded = true; changed = true; }
            else if (newEnd !== null && item.marker.end !== newEnd) { item.marker.end = newEnd; saveNeeded = true; changed = true; }
          }
          // ...and a colour changed by hand in Premiere.
          if (r.exists && typeof r.color === 'number' && item.marker.color !== r.color) {
            item.marker.color = r.color;
            saveNeeded = true;
            changed = true;
          }
        });
      });
    });
    return chain.then(function () {
      if (saveNeeded || doneCleared) persistCurrent();
      if (cleanedUp) showStatus('Premiere\'s undo removed that marker - the to-do is still here.', 'saved');
      if (changed && state.activeView === 'checklist') renderChecklist();
    });
  }

  // While the Checklist tab is open, keep the shown times in step with the
  // timeline. Re-renders only when something actually changed, and never while
  // a menu/box in the panel has focus (a re-render would close it).
  var UNDO_CLEANUP_MS = 3 * 60 * 1000;
  // Poll quickly (so a Premiere undo is noticed within about a second) while a
  // marker the panel placed is still fresh, and slowly otherwise.
  function hasFreshMarker() {
    var script = currentScript();
    return !!script && DL.linkedChecklistItems(script).some(function (x) {
      return x.item.marker && Date.now() - (x.item.marker.placedAt || 0) < UNDO_CLEANUP_MS;
    });
  }
  // A cheap 1.2s tick; the real check runs every tick while a marker is fresh,
  // and only every 4s otherwise.
  var lastPollAt = 0;
  function schedulePoll() {
    setInterval(function () {
      if (!hasFreshMarker() && Date.now() - lastPollAt < 4000) return;
      lastPollAt = Date.now();
      pollMarkers();
    }, 1200);
  }

  var syncing = false;
  function pollMarkers() {
    if (syncing || state.activeView !== 'checklist' || document.hidden) return;
    var a = document.activeElement;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'SELECT' || a.tagName === 'TEXTAREA')) return;
    var script = currentScript();
    if (!script || !DL.linkedChecklistItems(script).length) return;
    syncing = true;
    syncMarkers().then(function () { syncing = false; }, function () { syncing = false; });
  }

  function reloadCurrentFromDisk() {
    var meta = state.scripts.find(function (s) { return s.id === state.currentScriptId; });
    if (!meta || meta.path === '(debug)') return;
    var previous = state.scriptCache[meta.id];
    var fresh;
    try {
      fresh = DL.loadScript(meta.path);
    } catch (e) {
      return;
    }
    // Something else (BijouDocs) changed the file: old snapshots no longer match it.
    if (previous && trackedState(previous) !== trackedState(fresh)) clearHistory();
    state.scriptCache[meta.id] = fresh;
    renderAll();
    syncMarkers();
  }

  // ---- Search view --------------------------------------------------------

  function renderSearch() {
    el.searchResults.innerHTML = '';
    var script = currentScript();
    if (!script) return;
    var results = DL.searchLines(script, state.searchQuery);

    if (!state.searchQuery.trim()) {
      var hint = document.createElement('div');
      hint.className = 'no-results';
      hint.textContent = 'Type part of a line to find it, then tag it, add a note, or tick it off.';
      el.searchResults.appendChild(hint);
      return;
    }
    if (results.length === 0) {
      var none = document.createElement('div');
      none.className = 'no-results';
      none.textContent = 'No lines match "' + state.searchQuery.trim() + '".';
      el.searchResults.appendChild(none);
      return;
    }

    results.forEach(function (result) {
      el.searchResults.appendChild(buildSearchRow(script, result));
    });
  }

  function buildSearchRow(script, result) {
    var row = document.createElement('div');
    row.className = 'search-row';

    var ctx = document.createElement('div');
    ctx.className = 'section-context';
    ctx.textContent = result.sectionHeading || '(untitled section)';
    row.appendChild(ctx);

    var main = document.createElement('div');
    main.className = 'row-main';

    var text = document.createElement('div');
    text.className = 'line-text' + (result.done ? ' done' : '');
    text.textContent = result.text;

    var toggle = makeDoneToggle(result.done, 'Mark done', function () {
      DL.toggleLineDone(currentScript(), result.lineId);
      persistCurrent();
      result.done = !result.done;
      setDoneToggle(toggle, result.done, 'Mark done');
      text.classList.toggle('done', result.done);
    });
    main.appendChild(toggle);
    main.appendChild(text);
    row.appendChild(main);

    var controls = document.createElement('div');
    controls.className = 'row-controls';

    var select = buildTagSelect(script, result.categoryId);
    select.setAttribute('aria-label', 'Tag');
    select.addEventListener('change', function () {
      var categoryId = resolveTagSelectValue(script, select);
      DL.setLineTag(currentScript(), result.lineId, categoryId);
      persistCurrent();
      result.categoryId = categoryId;
      renderSearch();
    });
    controls.appendChild(select);
    row.appendChild(controls);

    var noteInput = document.createElement('input');
    noteInput.type = 'text';
    noteInput.className = 'note-input';
    noteInput.placeholder = 'Add a note';
    noteInput.setAttribute('aria-label', 'Note');
    noteInput.value = result.note || '';
    noteInput.addEventListener('change', function () {
      DL.setLineNote(currentScript(), result.lineId, noteInput.value);
      persistCurrent();
      result.note = noteInput.value;
    });
    row.appendChild(noteInput);

    return row;
  }

  // Test hook: lets the Browser pane (no Node/fs available) exercise the
  // UI against in-memory script objects, bypassing listScriptFiles/loadScript.
  window.__bijouExtDebugLoad = function (scripts, globalCategories) {
    state.scripts = scripts.map(function (s) { return { id: s.id, path: '(debug)', title: s.title, pinned: !!s.pinned }; });
    state.scriptCache = {};
    state.globalCategories = globalCategories || [];
    scripts.forEach(function (s) { state.scriptCache[s.id] = DL.normalizeScript(s); });
    renderScriptOptions();
    updateEmptyState();
    if (state.scripts[0]) selectScript(state.scripts[0].id);
  };

  document.addEventListener('DOMContentLoaded', init);
})();
