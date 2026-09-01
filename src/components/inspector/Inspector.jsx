import React from 'react'
import { useStore } from '../../state/store.js'
import CategoriesTab from './CategoriesTab.jsx'
import SectionsTab from './SectionsTab.jsx'
import CheckpointsTab from './CheckpointsTab.jsx'
import ShortcutsTab from './ShortcutsTab.jsx'

const TABS = [
  { id: 'categories', label: 'Categories' },
  { id: 'sections', label: 'Sections' },
  { id: 'checkpoints', label: 'Versions' },
  { id: 'shortcuts', label: 'Keys' }
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
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="insp-body">
        {inspectorTab === 'categories' && <CategoriesTab scriptId={scriptId} script={script} />}
        {inspectorTab === 'sections' && <SectionsTab scriptId={scriptId} script={script} />}
        {inspectorTab === 'checkpoints' && <CheckpointsTab scriptId={scriptId} script={script} />}
        {inspectorTab === 'shortcuts' && <ShortcutsTab />}
      </div>
    </div>
  )
}
