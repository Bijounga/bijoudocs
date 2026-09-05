import React, { useEffect, useRef } from 'react'
import { useStore } from '../../state/store.js'
import { catInfo } from '../../lib/model.js'
import { getInk } from '../../lib/html.js'
import Icon from '../icons.jsx'
import LineText from './LineText.jsx'
import TagMenu from './TagMenu.jsx'
import NoteBox from './NoteBox.jsx'
import TakesMenu from './TakesMenu.jsx'
import SynonymMenu from './SynonymMenu.jsx'
import {
  blankLineBreakBeforeCaret,
  captureWordSelection,
  caretAtStart,
  focusLineAtOffset,
  focusLineEnd,
  saveSynonymSelection,
  splitHtmlAtCaret
} from '../../state/lineRefs.js'
import { handleHorizontalNav, handleVerticalNav } from '../../lib/navigation.js'
import { beginLineDragSelect } from '../../state/dragSelect.js'
import { useDropIndicator } from '../../hooks/useDropIndicator.js'

export default function LineRow({ scriptId, sectionId, line, index, siblingCount, categories }) {
  const pushUndo = useStore((s) => s.pushUndo)
  const commitLineText = useStore((s) => s.commitLineText)
  const openTagMenuFor = useStore((s) => s.openTagMenuFor)
  const openTagMenu = useStore((s) => s.openTagMenu)
  const toggleLineNote = useStore((s) => s.toggleLineNote)
  const toggleLineDone = useStore((s) => s.toggleLineDone)
  const deleteLine = useStore((s) => s.deleteLine)
  const indentLine = useStore((s) => s.indentLine)
  const splitLineOnEnter = useStore((s) => s.splitLineOnEnter)
  const deleteEmptyLineBackspace = useStore((s) => s.deleteEmptyLineBackspace)
  const mergeLineIntoPrevious = useStore((s) => s.mergeLineIntoPrevious)
  const deleteWholeLine = useStore((s) => s.deleteWholeLine)
  const outdentLine = useStore((s) => s.outdentLine)
  const reorderLine = useStore((s) => s.reorderLine)
  const moveCheckItemToLine = useStore((s) => s.moveCheckItemToLine)
  const jumpHighlightLineKey = useStore((s) => s.jumpHighlightLineKey)
  const selectedLines = useStore((s) => s.selectedLines)
  const selectAnchor = useStore((s) => s.selectAnchor)
  const extendLineSelection = useStore((s) => s.extendLineSelection)
  const rangeSelectLines = useStore((s) => s.rangeSelectLines)
  const toggleLineSelected = useStore((s) => s.toggleLineSelected)
  const setSelectAnchor = useStore((s) => s.setSelectAnchor)
  const clearLineSelection = useStore((s) => s.clearLineSelection)
  const openContextMenu = useStore((s) => s.openContextMenu)
  const toggleLineBookmark = useStore((s) => s.toggleLineBookmark)
  const resumeLineKey = useStore((s) => {
    const script = s.scripts.find((sc) => sc.id === scriptId)
    return script && script.resumeLineKey
  })
  const takesMenuFor = useStore((s) => s.takesMenuFor)
  const openTakesMenu = useStore((s) => s.openTakesMenu)
  const synonymMenuFor = useStore((s) => s.synonymMenuFor)
  const openSynonymMenu = useStore((s) => s.openSynonymMenu)
  const keybinds = useStore((s) => s.keybinds)

  const key = sectionId + ':' + line.id
  const cat = line.categoryId ? catInfo({ categories }, line.categoryId) : null
  const showCheck = !!cat
  const menuOpen = openTagMenuFor === key
  const takesOpen = takesMenuFor === key
  const synonymOpen = synonymMenuFor === key

  function handleFindSynonyms() {
    const captured = captureWordSelection(key)
    if (!captured) return
    saveSynonymSelection(key, captured.range)
    openSynonymMenu(key, captured.word)
  }
  const flash = jumpHighlightLineKey === key
  const selected = selectedLines && selectedLines.includes(key)

  const rootRef = useRef(null)
  const dropIndicator = useDropIndicator()
  useEffect(() => {
    if (flash && rootRef.current) {
      rootRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }, [flash])

  function handleKeyDown(e, el) {
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault()
      extendLineSelection(scriptId, key, e.key === 'ArrowDown' ? 1 : -1)
      el.blur()
      return
    }
    if (handleVerticalNav(e, el)) return
    if (handleHorizontalNav(e, el, false)) return
    if (e.key === 'Tab') {
      e.preventDefault()
      indentLine(scriptId, sectionId, line.id, e.shiftKey ? -1 : 1)
      focusLineEnd(key)
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      const { before, after } = splitHtmlAtCaret(el)
      const newKey = splitLineOnEnter(scriptId, sectionId, line.id, before, after)
      // Mirror the truncation into this line's own DOM right away — focus
      // is about to move to the new line below (deferred via setTimeout),
      // which blurs this element, and its onBlur commits whatever is in
      // ref.current.innerHTML; without this it would still be the
      // pre-split full text, clobbering the store's correctly-truncated
      // value the moment blur fires.
      el.innerHTML = before
      if (newKey) focusLineAtOffset(newKey, 0)
      return
    }
    if (e.key === 'Delete') {
      e.preventDefault()
      const focusKey = deleteWholeLine(scriptId, sectionId, line.id)
      if (focusKey) focusLineEnd(focusKey)
      return
    }
    if (e.key === 'Backspace') {
      // A blank soft-wrapped line *within* this line's own text (a <br>
      // pair from Shift+Enter) isn't a line-boundary at all, so none of
      // the whole-line checks below ever see it — left alone, the browser's
      // native backspace-in-contenteditable behavior takes over here and
      // welds the two real lines of text together instead of just closing
      // the blank-line gap. Handled explicitly so it's not at the mercy of
      // whatever the browser's default happens to do.
      const blankBreak = blankLineBreakBeforeCaret(el)
      if (blankBreak) {
        e.preventDefault()
        blankBreak.remove()
        return
      }
      const isEmpty = el.textContent.trim() === ''
      if (line.indent > 0 && caretAtStart(el)) {
        e.preventDefault()
        outdentLine(scriptId, sectionId, line.id)
        focusLineEnd(key)
        return
      }
      if (isEmpty && siblingCount > 1) {
        e.preventDefault()
        const focusKey = deleteEmptyLineBackspace(scriptId, sectionId, line.id)
        if (focusKey) focusLineEnd(focusKey)
        return
      }
      if (!isEmpty && index > 0 && caretAtStart(el)) {
        e.preventDefault()
        const result = mergeLineIntoPrevious(scriptId, sectionId, line.id, el.innerHTML)
        if (result) focusLineAtOffset(result.key, result.offset)
        return
      }
    }
  }

  function handleMouseDown(e) {
    if (e.shiftKey && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      rangeSelectLines(scriptId, selectAnchor || key, key)
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur()
      return
    }
    if (e.shiftKey) {
      e.preventDefault()
      toggleLineSelected(key)
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur()
      return
    }
    if (selectedLines.length) {
      clearLineSelection()
    } else {
      setSelectAnchor(null)
    }
    beginLineDragSelect(key)
  }

  const style = { marginLeft: line.indent * 22 }
  if (cat) style['--tag-color'] = cat.color

  return (
    <div
      ref={rootRef}
      className={
        'line' +
        (cat ? ' tagged' : '') +
        (line.struck ? ' struck' : '') +
        (flash ? ' jump-flash' : '') +
        (selected ? ' selected' : '') +
        (resumeLineKey === key ? ' resume-point' : '') +
        (dropIndicator.edge ? ' drop-indicator-' + dropIndicator.edge : '')
      }
      style={style}
      data-parent-sec={sectionId}
      data-line-id={line.id}
      onContextMenu={(e) => {
        e.preventDefault()
        openContextMenu({ type: 'line', scriptId, sectionId, lineId: line.id, x: e.clientX, y: e.clientY })
      }}
      onDragOver={(e) => {
        dropIndicator.onDragOver(e, (ev) => ev.dataTransfer.types.includes('application/x-line') || ev.dataTransfer.types.includes('application/x-checkitem'))
      }}
      onDragLeave={dropIndicator.onDragLeave}
      onDrop={(e) => {
        const edge = dropIndicator.edge
        dropIndicator.clear()
        const lineData = e.dataTransfer.getData('application/x-line')
        if (lineData) {
          e.preventDefault()
          const { sec: fromSecId, line: fromLineId } = JSON.parse(lineData)
          if (fromSecId === sectionId && fromLineId !== line.id) {
            reorderLine(scriptId, sectionId, fromLineId, line.id, edge || 'before')
          }
          return
        }
        const checkData = e.dataTransfer.getData('application/x-checkitem')
        if (checkData) {
          e.preventDefault()
          e.stopPropagation()
          const { sec: fromSecId, item: itemId } = JSON.parse(checkData)
          moveCheckItemToLine(scriptId, fromSecId, itemId, sectionId, line.id)
        }
      }}
    >
      <div className="line-main">
        <span
          className="line-drag-handle"
          draggable="true"
          onClick={() => {
            toggleLineSelected(key)
            if (document.activeElement && document.activeElement.blur) document.activeElement.blur()
          }}
          onDragStart={(e) => {
            e.dataTransfer.setData('application/x-line', JSON.stringify({ sec: sectionId, line: line.id }))
            e.dataTransfer.effectAllowed = 'move'
          }}
          title="Click to select, drag to reorder or drop into a checkpoint"
        >
          <Icon name="grip" size={11} />
        </span>
        <LineText
          dataKey={key}
          value={line.text}
          placeholder="Write a line..."
          className="line-text"
          onFocus={() => pushUndo(scriptId)}
          onCommit={(html) => commitLineText(scriptId, sectionId, line.id, html)}
          onKeyDown={handleKeyDown}
          onMouseDown={handleMouseDown}
        />
        {cat && (
          <span
            className="tag-pill"
            style={{ background: cat.color, color: getInk(cat.color) }}
            onClick={() => openTagMenu(key)}
          >
            {cat.label}
          </span>
        )}
        {showCheck && (
          <button
            className={'done-indicator' + (line.done ? ' is-done' : '')}
            onClick={() => toggleLineDone(scriptId, sectionId, line.id)}
            title={line.done ? 'Recorded — click to mark not done' : 'Not recorded yet — click to mark done'}
          >
            <Icon name={line.done ? 'check' : 'x'} size={12} />
          </button>
        )}
        <div className="line-btns">
          <button
            className={'line-btn' + (line.bookmarked ? ' has-bookmark' : '')}
            onClick={() => toggleLineBookmark(scriptId, sectionId, line.id)}
            title={line.bookmarked ? 'Remove bookmark' : 'Bookmark this line'}
          >
            <Icon name="bookmark" filled={line.bookmarked} />
          </button>
          <button className="line-btn" onClick={() => openTagMenu(key)} title="Tag">
            <Icon name="tag" />
          </button>
          <button className="line-btn" onClick={handleFindSynonyms} title={'Find synonyms (' + keybinds.findSynonyms + ')'}>
            <Icon name="search" />
          </button>
          <button
            className={'line-btn note-trigger' + (line.note ? ' has-note' : '')}
            onClick={() => toggleLineNote(scriptId, sectionId, line.id)}
            title="Note"
          >
            <Icon name="note" />
          </button>
          {line.takes.length > 0 && (
            <button className="line-btn has-takes" onClick={() => openTakesMenu(key)} title={line.takes.length + ' other take(s) — click to view'}>
              <Icon name="layers" />
            </button>
          )}
          <button className="line-btn del-btn" onClick={() => deleteLine(scriptId, sectionId, line.id)} title="Delete line">
            <Icon name="trash" />
          </button>
        </div>
      </div>
      {menuOpen && <TagMenu scriptId={scriptId} sectionId={sectionId} line={line} categories={categories} />}
      {takesOpen && <TakesMenu scriptId={scriptId} sectionId={sectionId} line={line} />}
      {synonymOpen && <SynonymMenu scriptId={scriptId} sectionId={sectionId} lineId={line.id} />}
      {line.note && !line.noteOpen && (
        <div
          className="note-preview"
          style={{ marginLeft: line.indent * 22 }}
          onClick={() => toggleLineNote(scriptId, sectionId, line.id)}
          title="Click to open the full note"
        >
          {line.note}
        </div>
      )}
      {line.noteOpen && <NoteBox scriptId={scriptId} sectionId={sectionId} line={line} indent={line.indent} />}
    </div>
  )
}
