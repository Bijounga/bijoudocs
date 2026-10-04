import React from 'react'
import { useStore } from '../../state/store.js'
import CategoriesTab from './CategoriesTab.jsx'
import SectionsTab from './SectionsTab.jsx'
import CheckpointsTab from './CheckpointsTab.jsx'
import ShortcutsTab from './ShortcutsTab.jsx'
import ThemeTab from './ThemeTab.jsx'
import Icon from '../icons.jsx'

// Icon-only tabs — each name shows in the themed tooltip.
const TABS = [
  { id: 'categories', label: 'Categories', icon: 'tag' },
  { id: 'sections', label: 'Sections', icon: 'list' },
  { id: 'checkpoints', label: 'Versions', icon: 'history' },
  { id: 'shortcuts', label: 'Keyboard shortcuts', icon: 'keys' },
  { id: 'theme', label: 'Theme', icon: 'palette' }
]

export default function Inspector({ scriptId, script }) {
  const inspectorTab = useStore((s) => s.inspectorTab)
  const setInspectorTab = useStore((s) => s.setInspectorTab)

  return (
    <div className="inspector">
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
        {inspectorTab === 'shortcuts' && <ShortcutsTab />}
        {inspectorTab === 'theme' && <ThemeTab />}
      </div>
    </div>
  )
}
