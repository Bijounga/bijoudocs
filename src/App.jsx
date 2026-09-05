import React, { useEffect } from 'react'
import { useStore } from './state/store.js'
import Topbar from './components/Topbar.jsx'
import TabBar from './components/TabBar.jsx'
import SectionTimeline from './components/SectionTimeline.jsx'
import Sidebar from './components/Sidebar.jsx'
import Inspector from './components/inspector/Inspector.jsx'
import EditorMain from './components/editor/EditorMain.jsx'
import DiffModal from './components/DiffModal.jsx'
import WhatsNewModal from './components/WhatsNewModal.jsx'
import SaveHistoryPanel from './components/SaveHistoryPanel.jsx'
import TeleprompterView from './components/TeleprompterView.jsx'
import ContextMenu from './components/ContextMenu.jsx'
import UpdateBanner from './components/UpdateBanner.jsx'
import SaveConflictBanner from './components/SaveConflictBanner.jsx'
import { useGlobalKeydown } from './hooks/useGlobalKeydown.js'
import { installGlobalDragSelectListeners } from './state/dragSelect.js'

export default function App() {
  const loaded = useStore((s) => s.loaded)
  const init = useStore((s) => s.init)
  const noteColor = useStore((s) => s.noteColor)
  const scripts = useStore((s) => s.scripts)
  const currentScriptId = useStore((s) => s.currentScriptId)
  const focusMode = useStore((s) => s.focusMode)
  const hideTags = useStore((s) => s.hideTags)
  const hideNotes = useStore((s) => s.hideNotes)
  const openTagMenuFor = useStore((s) => s.openTagMenuFor)
  const closeTagMenu = useStore((s) => s.closeTagMenu)
  const sectionJumpOpen = useStore((s) => s.sectionJumpOpen)
  const closeSectionJump = useStore((s) => s.closeSectionJump)
  const lineSearchOpen = useStore((s) => s.lineSearchOpen)
  const closeLineSearch = useStore((s) => s.closeLineSearch)
  const exportMenuOpen = useStore((s) => s.exportMenuOpen)
  const closeExportMenu = useStore((s) => s.closeExportMenu)
  const selectedLines = useStore((s) => s.selectedLines)
  const clearLineSelection = useStore((s) => s.clearLineSelection)
  const contextMenu = useStore((s) => s.contextMenu)
  const closeContextMenu = useStore((s) => s.closeContextMenu)
  const takesMenuFor = useStore((s) => s.takesMenuFor)
  const closeTakesMenu = useStore((s) => s.closeTakesMenu)
  const synonymMenuFor = useStore((s) => s.synonymMenuFor)
  const closeSynonymMenu = useStore((s) => s.closeSynonymMenu)
  const setUpdateStatus = useStore((s) => s.setUpdateStatus)

  useGlobalKeydown()

  useEffect(() => {
    init()
  }, [init])

  useEffect(() => {
    if (window.bijou.onUpdateStatus) window.bijou.onUpdateStatus(setUpdateStatus)
  }, [setUpdateStatus])

  useEffect(() => {
    document.documentElement.style.setProperty('--note-color', noteColor)
  }, [noteColor])

  useEffect(() => installGlobalDragSelectListeners(), [])

  useEffect(() => {
    if (!selectedLines.length) return
    function onMouseDown(e) {
      if (!e.target.closest('.line-text')) clearLineSelection()
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [selectedLines.length, clearLineSelection])

  useEffect(() => {
    // Lets scripts/cdp.mjs inspect live state during development.
    if (import.meta.env.DEV) window.__bijouStore = useStore
  }, [])

  useEffect(() => {
    if (!openTagMenuFor) return
    function onDocClick(e) {
      if (!e.target.closest('.tag-menu') && !e.target.closest('.tag-pill') && !e.target.closest('.line-btn')) {
        closeTagMenu()
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [openTagMenuFor, closeTagMenu])

  useEffect(() => {
    if (!takesMenuFor) return
    function onDocClick(e) {
      if (!e.target.closest('.tag-menu') && !e.target.closest('.line-btn')) {
        closeTakesMenu()
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [takesMenuFor, closeTakesMenu])

  useEffect(() => {
    if (!synonymMenuFor) return
    function onDocClick(e) {
      if (!e.target.closest('.synonym-menu') && !e.target.closest('.line-btn') && !e.target.closest('.context-menu')) {
        closeSynonymMenu()
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [synonymMenuFor, closeSynonymMenu])

  useEffect(() => {
    if (!sectionJumpOpen) return
    function onDocClick(e) {
      if (!e.target.closest('.section-jump-menu') && !e.target.closest('[data-menu-trigger="sectionJump"]')) {
        closeSectionJump()
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [sectionJumpOpen, closeSectionJump])

  useEffect(() => {
    if (!lineSearchOpen) return
    function onDocClick(e) {
      if (!e.target.closest('.line-search-menu') && !e.target.closest('[data-menu-trigger="lineSearch"]')) {
        closeLineSearch()
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [lineSearchOpen, closeLineSearch])

  useEffect(() => {
    if (!exportMenuOpen) return
    function onDocClick(e) {
      if (!e.target.closest('.export-menu') && !e.target.closest('[data-menu-trigger="export"]')) {
        closeExportMenu()
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [exportMenuOpen, closeExportMenu])

  useEffect(() => {
    if (!contextMenu) return
    function onDocMouseDown(e) {
      if (!e.target.closest('.context-menu')) closeContextMenu()
    }
    function onKeyDown(e) {
      if (e.key === 'Escape') closeContextMenu()
    }
    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [contextMenu, closeContextMenu])

  if (!loaded) {
    return <div className="app-loading">Loading BijouDocs…</div>
  }

  const script = scripts.find((s) => s.id === currentScriptId) || null

  return (
    <div className={'app-root ' + (hideTags ? 'hide-tags ' : '') + (hideNotes ? 'hide-notes' : '')}>
      <Topbar script={script} />
      {script && <TabBar script={script} />}
      {script && <SectionTimeline script={script} />}
      <div className={'shell' + (focusMode ? ' focus' : '')}>
        <Sidebar />
        {script ? (
          <EditorMain scriptId={script.id} script={script} />
        ) : (
          <div className="main">
            <div className="editor-wrap">
              <p style={{ color: 'var(--ink-faint)' }}>No script open — create one from the library on the left.</p>
            </div>
          </div>
        )}
        {script && <Inspector scriptId={script.id} script={script} />}
      </div>
      <DiffModal />
      <WhatsNewModal />
      <SaveHistoryPanel />
      {script && <TeleprompterView script={script} />}
      <ContextMenu />
      {script && <SaveConflictBanner scriptId={script.id} />}
      <UpdateBanner />
    </div>
  )
}
