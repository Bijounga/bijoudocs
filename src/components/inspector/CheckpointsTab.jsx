import React, { useState } from 'react'
import { useStore } from '../../state/store.js'
import { formatRelative } from '../../lib/timecode.js'

export default function CheckpointsTab({ scriptId, script }) {
  const checkpointDraftOpen = useStore((s) => s.checkpointDraftOpen)
  const openCheckpointDraft = useStore((s) => s.openCheckpointDraft)
  const confirmCheckpoint = useStore((s) => s.confirmCheckpoint)
  const compareSelection = useStore((s) => s.compareSelection)
  const toggleCompare = useStore((s) => s.toggleCompare)
  const compareCheckpoints = useStore((s) => s.compareCheckpoints)
  const restoreCheckpoint = useStore((s) => s.restoreCheckpoint)

  const [draftName, setDraftName] = useState('')

  function submit() {
    confirmCheckpoint(scriptId, draftName.trim() || 'Checkpoint')
    setDraftName('')
  }

  const sorted = script.checkpoints.slice().sort((a, b) => b.at - a.at)
  const ready = compareSelection.length === 2

  return (
    <>
      {checkpointDraftOpen ? (
        <div className="cp-draft">
          <input
            autoFocus
            placeholder="Name this checkpoint"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                submit()
              }
            }}
          />
          <button onClick={submit}>Save</button>
        </div>
      ) : (
        <button className="cp-newbtn" onClick={openCheckpointDraft}>+ Save checkpoint</button>
      )}

      {sorted.length === 0 && (
        <div style={{ fontSize: '12.5px', color: 'var(--ink-faint)', padding: 6 }}>
          No checkpoints yet. Save one to start tracking versions.
        </div>
      )}
      {sorted.map((cp) => (
        <div className="cp-item" key={cp.id}>
          <div className="cp-top">
            <input
              type="checkbox"
              checked={compareSelection.includes(cp.id)}
              onChange={() => toggleCompare(cp.id)}
            />
            <span className="cp-name">{cp.name}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="cp-time">{formatRelative(cp.at)}</span>
            <button className="cp-restore" onClick={() => restoreCheckpoint(scriptId, cp.id)}>Restore</button>
          </div>
        </div>
      ))}
      <button
        className={'cp-compare-btn' + (ready ? ' ready' : '')}
        onClick={() => compareCheckpoints(scriptId)}
      >
        Compare selected ({compareSelection.length}/2)
      </button>
    </>
  )
}
