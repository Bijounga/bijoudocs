// ExtendScript host bridge for the BijouDocs Tags panel.
// Only handles what the panel's own JS can't: talking to Premiere's DOM
// (sequence markers). Every function returns a JSON string:
//   { ok: true, ... } or { ok: false, error: "..." }
// Plain ES3 on purpose — ExtendScript has no JSON object or modern syntax.

function bdJson(v) {
    if (v === null || v === undefined) return "null";
    var t = typeof v;
    if (t === "number") return isFinite(v) ? String(v) : "null";
    if (t === "boolean") return v ? "true" : "false";
    if (t === "string") {
        var s = v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
            .replace(/\r/g, "\\r").replace(/\n/g, "\\n").replace(/\t/g, "\\t");
        return '"' + s + '"';
    }
    var i, parts = [];
    if (v instanceof Array) {
        for (i = 0; i < v.length; i++) parts.push(bdJson(v[i]));
        return "[" + parts.join(",") + "]";
    }
    for (var k in v) {
        if (v.hasOwnProperty(k)) parts.push(bdJson(k) + ":" + bdJson(v[k]));
    }
    return "{" + parts.join(",") + "}";
}

function bdFail(msg) {
    return bdJson({ ok: false, error: msg });
}

function bdFindSequence(seqId) {
    if (!app.project) return null;
    if (seqId) {
        var seqs = app.project.sequences;
        for (var i = 0; i < seqs.numSequences; i++) {
            if (seqs[i].sequenceID === seqId) return seqs[i];
        }
    }
    return null;
}

// Walks a sequence's markers looking for the one we placed: by guid when we
// have it, otherwise by name + start time (Premiere versions without
// Marker.guid, or a link made before the guid was recorded).
function bdFindMarker(seq, guid, time, name) {
    var markers = seq.markers;
    if (!markers) return null;
    var m = markers.getFirstMarker();
    while (m) {
        if (guid && m.guid === guid) return m;
        m = markers.getNextMarker(m);
    }
    if (typeof time === "number") {
        m = markers.getFirstMarker();
        while (m) {
            var near = Math.abs(m.start.seconds - time) < 0.002;
            if (near && (!name || m.name === name)) return m;
            m = markers.getNextMarker(m);
        }
    }
    return null;
}

// Drops a marker at the playhead of the active sequence.
// colorIndex: 0 green, 1 red, 2 purple, 3 orange, 4 yellow, 5 white, 6 blue, 7 cyan.
function bdAddMarker(name, comments, colorIndex) {
    try {
        var seq = app.project ? app.project.activeSequence : null;
        if (!seq) return bdFail("No active sequence - open a sequence first.");
        var t = seq.getPlayerPosition().seconds;
        var m = seq.markers.createMarker(t);
        // (No comment is written: each property set is a separate step in Premiere's own
        // undo history, so every extra one is another Ctrl+Z before the marker goes away.)
        if (typeof colorIndex === "number" && m.setColorByIndex) m.setColorByIndex(colorIndex);
        // The name goes on LAST: Premiere's own undo reverts the last property set
        // first, so an undo leaves a marker with an EMPTY name - which is how the
        // panel recognises it and cleans the leftover up.
        m.name = name;
        return bdJson({
            ok: true,
            seqId: seq.sequenceID,
            seqName: seq.name,
            guid: m.guid ? String(m.guid) : "",
            time: t
        });
    } catch (e) {
        return bdFail(String(e));
    }
}

// Removes a previously placed marker. A marker that's already gone (deleted
// by hand in Premiere) counts as success - the goal state is "no marker".
function bdDeleteMarker(seqId, guid, time, name) {
    try {
        var seq = bdFindSequence(seqId) || (app.project ? app.project.activeSequence : null);
        if (!seq) return bdFail("Sequence not found.");
        var m = bdFindMarker(seq, guid, time, name);
        if (!m) return bdJson({ ok: true, removed: false });
        seq.markers.deleteMarker(m);
        return bdJson({ ok: true, removed: true });
    } catch (e) {
        return bdFail(String(e));
    }
}

// Moves the playhead to a marker (activating its sequence first when it's a
// different one from the one currently open).
function bdGotoMarker(seqId, guid, time, name) {
    try {
        var seq = bdFindSequence(seqId) || (app.project ? app.project.activeSequence : null);
        if (!seq) return bdFail("Sequence not found.");
        var m = bdFindMarker(seq, guid, time, name);
        if (!m) return bdFail("That marker no longer exists in the sequence.");
        if (app.project.activeSequence !== seq && app.project.openSequence) {
            app.project.openSequence(seq.sequenceID);
        }
        seq.setPlayerPosition(m.start.ticks);
        return bdJson({ ok: true });
    } catch (e) {
        return bdFail(String(e));
    }
}

// Does this linked marker still exist, and where is it now? Used to flag links
// whose marker was deleted by hand and to follow markers that moved (ripple
// delete, trimming, dragging).
function bdMarkerExists(seqId, guid, time, name) {
    try {
        var seq = bdFindSequence(seqId);
        if (!seq) return bdJson({ ok: true, exists: false, sequenceFound: false });
        var m = bdFindMarker(seq, guid, time, name);
        var endS = null, col = null;
        if (m) {
            try { endS = m.end.seconds; } catch (e1) {}
            try { if (m.getColorByIndex) col = m.getColorByIndex(); } catch (e2) {}
        }
        return bdJson({ ok: true, exists: !!m, sequenceFound: true, time: m ? m.start.seconds : null, end: endS, color: col, name: m ? String(m.name) : null });
    } catch (e) {
        return bdFail(String(e));
    }
}

function bdActiveSequence() {
    try {
        var seq = app.project ? app.project.activeSequence : null;
        if (!seq) return bdJson({ ok: true, seqId: "", seqName: "" });
        return bdJson({ ok: true, seqId: seq.sequenceID, seqName: seq.name });
    } catch (e) {
        return bdFail(String(e));
    }
}

// Puts a marker back (undo/redo) at an exact time in a given sequence, with
// its name, colour and - for range markers - its end.
function bdRecreateMarker(seqId, name, comments, colorIndex, start, end) {
    try {
        var seq = bdFindSequence(seqId) || (app.project ? app.project.activeSequence : null);
        if (!seq) return bdFail("Sequence not found.");
        var m = seq.markers.createMarker(start);
        // (No comment is written: each property set is a separate step in Premiere's own
        // undo history, so every extra one is another Ctrl+Z before the marker goes away.)
        if (typeof colorIndex === "number" && m.setColorByIndex) m.setColorByIndex(colorIndex);
        if (typeof end === "number" && end > start + 0.001) {
            try { var t = new Time(); t.seconds = end; m.end = t; } catch (e2) {}
        }
        m.name = name;
        return bdJson({ ok: true, seqId: seq.sequenceID, guid: m.guid ? String(m.guid) : "" });
    } catch (e) {
        return bdFail(String(e));
    }
}

// Renames a marker we placed (the to-do's text was edited). Found by guid, or by
// its old name + time on a Premiere without Marker.guid.
function bdRenameMarker(seqId, guid, time, oldName, newName) {
    try {
        var seq = bdFindSequence(seqId) || (app.project ? app.project.activeSequence : null);
        if (!seq) return bdFail("Sequence not found.");
        var m = bdFindMarker(seq, guid, time, oldName);
        if (!m) return bdFail("That marker no longer exists in the sequence.");
        m.name = newName;
        return bdJson({ ok: true });
    } catch (e) {
        return bdFail(String(e));
    }
}
