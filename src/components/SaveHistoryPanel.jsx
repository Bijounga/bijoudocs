import React from 'react'
import { useStore } from '../state/store.js'
import { formatRelative } from '../lib/timecode.js'

// Browses the automatic, whole-file version history fileStore.js keeps
// alongside the real script file (periodic snapshots, plus any conflict
// backups) — separate from the manual "+ Save checkpoint" feature in the
// Versions tab, which only snapshots section text for deliberate
// before/after comparisons. This one exists purely so a bad save (device
// clock skew, a stale sync conflict, anything) is always recoverable from
// inside the app, not by asking someone to go read raw JSON files.
export default function SaveHistoryPanel() {
  const saveHistoryOpen = useStore((s) => s.saveHistoryOpen)
  const saveHistoryEntries = useStore((s) => s.saveHistoryEntries)
  const saveHistoryLoading = useStore((s) => s.saveHistoryLoading)
  const saveHistoryScriptId = useStore((s) => s.saveHistoryScriptId)
  const closeSaveHistory = useStore((s) => s.closeSaveHistory)
  const restoreFromSaveHistory = useStore((s) => s.restoreFromSaveHistory)

  if (!saveHistoryOpen) return null

  function restore(entry) {
    const when = new Date(entry.at).toLocaleString()
    const msg =
      'Restore the version from ' +
      when +
      '? Your current content will be backed up first, so you can always undo this restore too (Ctrl+Z works right after).'
    if (window.confirm(msg)) restoreFromSaveHistory(saveHistoryScriptId, entry.file)
  }

  return (
    <div className="diff-overlay" onClick={closeSaveHistory}>
      <div className="diff-modal save-history-modal" onClick={(e) => e.stopPropagation()}>
        <div className="diff-head">
          <span className="dh-title">Save history</span>
          <button className="diff-close" onClick={closeSaveHistory}>&times;</button>
        </div>
        <div className="diff-body">
          {saveHistoryLoading && <div className="save-history-empty">Loading…</div>}
          {!saveHistoryLoading && saveHistoryEntries.length === 0 && (
            <div className="save-history-empty">
              No history yet — a version is saved automatically every few minutes while you work.
            </div>
          )}
          {saveHistoryEntries.map((entry) => (
            <div className="save-history-row" key={entry.file}>
              <div className="save-history-info">
                <span className="save-history-time">{new Date(entry.at).toLocaleString()}</span>
                <span className="save-history-relative">{formatRelative(entry.at)}</span>
                {entry.kind === 'conflict' && <span className="save-history-badge">conflict backup</span>}
              </div>
              <button className="save-history-restore" onClick={() => restore(entry)}>
                Restore
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
