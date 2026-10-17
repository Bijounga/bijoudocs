import React from 'react'
import { useStore } from '../../state/store.js'
import CategoriesTab from './CategoriesTab.jsx'
import SectionsTab from './SectionsTab.jsx'
import CheckpointsTab from './CheckpointsTab.jsx'
import ShortcutsTab from './ShortcutsTab.jsx'
import ThemeTab from './ThemeTab.jsx'
import FootageTab from './FootageTab.jsx'
import Icon from '../icons.jsx'

// Icon-only tabs — each name shows in the themed tooltip.
const TABS = [
  { id: 'categories', label: 'Categories', icon: 'tag' },
  { id: 'sections', label: 'Sections', icon: 'list' },
  { id: 'checkpoints', label: 'Versions', icon: 'history' },
  { id: 'footage', label: 'Bijou Footage notes', icon: 'film' },
  { id: 'shortcuts', label: 'Keyboard shortcuts', icon: 'keys' },
  { id: 'theme', label: 'Theme', icon: 'palette' }
]

export default function Inspector({ scriptId, script }) {
  const inspectorTab = useStore((s) => s.inspectorTab)
  const setInspectorTab = useStore((s) => s.setInspectorTab)
  const width = useStore((s) => s.inspectorWidth)
  const setInspectorWidth = useStore((s) => s.setInspectorWidth)

  // Drag the left edge to resize; saved once on release.
  function startResize(e) {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = width
    document.body.classList.add('is-resizing-panel')
    function onMove(ev) {
      setInspectorWidth(startWidth + (startX - ev.clientX), false)
    }
    function onUp(ev) {
      setInspectorWidth(startWidth + (startX - ev.clientX))
      document.body.classList.remove('is-resizing-panel')
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  return (
    <div className="inspector" style={{ '--inspector-w': width + 'px' }}>
      <div className="panel-resize-handle" onMouseDown={startResize} onDoubleClick={() => setInspectorWidth(290)} title="Drag to resize — double-click to reset" />
      <div style={{ flex: '0 0 auto' }}>
        <div className="insp-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={'insp-tab' + (inspectorTab === t.id ? ' active' : '')}
              onClick={() => setInspectorTab(t.id)}
              title={t.label}
              aria-label={t.label}
            >
              <Icon name={t.icon} size={15} />
            </button>
          ))}
        </div>
      </div>
      <div className="insp-body">
        {inspectorTab === 'categories' && <CategoriesTab scriptId={scriptId} script={script} />}
        {inspectorTab === 'sections' && <SectionsTab scriptId={scriptId} script={script} />}
        {inspectorTab === 'checkpoints' && <CheckpointsTab scriptId={scriptId} script={script} />}
        {inspectorTab === 'footage' && <FootageTab scriptId={scriptId} script={script} />}
        {inspectorTab === 'shortcuts' && <ShortcutsTab />}
        {inspectorTab === 'theme' && <ThemeTab />}
      </div>
    </div>
  )
}
