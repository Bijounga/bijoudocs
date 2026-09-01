import React, { useState } from 'react'
import { useStore } from '../../state/store.js'
import Icon from '../icons.jsx'

export default function CategoriesTab({ scriptId, script }) {
  const filterCategory = useStore((s) => s.filterCategory)
  const setFilterCategory = useStore((s) => s.setFilterCategory)
  const pushUndo = useStore((s) => s.pushUndo)
  const setCategoryColor = useStore((s) => s.setCategoryColor)
  const commitCategoryColor = useStore((s) => s.commitCategoryColor)
  const setCategoryLabel = useStore((s) => s.setCategoryLabel)
  const commitCategoryLabel = useStore((s) => s.commitCategoryLabel)
  const deleteCategory = useStore((s) => s.deleteCategory)
  const toggleCategorySpoken = useStore((s) => s.toggleCategorySpoken)
  const toggleCategoryTeleprompterNote = useStore((s) => s.toggleCategoryTeleprompterNote)
  const catAddDraft = useStore((s) => s.catAddDraft)
  const openAddCategoryDraft = useStore((s) => s.openAddCategoryDraft)
  const confirmAddCategory = useStore((s) => s.confirmAddCategory)

  const [draftName, setDraftName] = useState('')
  const [draftColor, setDraftColor] = useState('#7FA9F2')

  function counts(c) {
    let count = 0
    let done = 0
    script.sections.forEach((sec) => sec.lines.forEach((l) => {
      if (l.categoryId === c.id) {
        count++
        if (l.done) done++
      }
    }))
    return { count, done }
  }

  function submitAdd() {
    confirmAddCategory(scriptId, draftName.trim() || 'New category', draftColor)
    setDraftName('')
    setDraftColor('#7FA9F2')
  }

  return (
    <>
      {script.categories.map((c) => {
        const { count, done } = counts(c)
        return (
          <div key={c.id} className={'cat-row' + (filterCategory === c.id ? ' active' : '')}>
            <input
              type="color"
              className="cat-swatch"
              value={c.color}
              onFocus={() => pushUndo(scriptId)}
              onChange={(e) => setCategoryColor(scriptId, c.id, e.target.value)}
              onBlur={() => commitCategoryColor(scriptId)}
            />
            <input
              type="text"
              className="cat-label-input"
              value={c.label}
              onFocus={() => pushUndo(scriptId)}
              onChange={(e) => setCategoryLabel(scriptId, c.id, e.target.value)}
              onBlur={() => commitCategoryLabel(scriptId)}
            />
            <span className="cat-count">{done}/{count}</span>
            <button
              className={'cat-spoken-btn' + (c.spoken === false ? '' : ' active')}
              onClick={() => toggleCategorySpoken(scriptId, c.id)}
              title={
                c.spoken === false
                  ? 'Silent — skipped in the teleprompter and the runtime estimate. Click to make it spoken.'
                  : 'Spoken — counts toward the runtime estimate and shows in the teleprompter. Click to make it silent.'
              }
            >
              <Icon name={c.spoken === false ? 'micOff' : 'mic'} size={12} />
            </button>
            {c.spoken === false && (
              <button
                className={'cat-spoken-btn' + (c.teleprompterNote ? ' active' : '')}
                onClick={() => toggleCategoryTeleprompterNote(scriptId, c.id)}
                title={
                  c.teleprompterNote
                    ? 'Shows in the teleprompter as a small italicized note. Click to hide it there entirely.'
                    : 'Hidden from the teleprompter entirely. Click to show it there as a small italicized note instead.'
                }
              >
                <Icon name="note" size={12} />
              </button>
            )}
            <button className="cat-open-btn" onClick={() => setFilterCategory(c.id)} title="View this category">
              <Icon name="search" size={12} />
            </button>
            <button className="cat-del" onClick={() => deleteCategory(scriptId, c.id)} title="Delete category">
              &times;
            </button>
          </div>
        )
      })}

      {catAddDraft ? (
        <div className="cat-add-row">
          <input
            type="text"
            placeholder="Category name"
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitAdd()
            }}
          />
          <input type="color" value={draftColor} onChange={(e) => setDraftColor(e.target.value)} />
          <button className="cat-open-btn" onClick={submitAdd}>Add</button>
        </div>
      ) : (
        <button className="cat-add-btn" onClick={openAddCategoryDraft}>+ Add category</button>
      )}
      <div className="insp-hint">
        Click the search icon to view every line tagged that way across the script. The mic icon controls whether that
        tag's lines count toward the runtime estimate and show up in the teleprompter — click it to toggle
        spoken/silent.
      </div>
    </>
  )
}
