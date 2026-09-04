import React, { useEffect } from 'react'
import { useStore } from '../../state/store.js'
import { flattenMapOrder } from '../../lib/mapGraph.js'
import { sectionsHaveContent } from '../../lib/model.js'
import Icon from '../icons.jsx'

function isIdeaNode(node) {
  return !!node && node.type === 'idea'
}

export default function OutlineView({ scriptId, script }) {
  const zoom = useStore((s) => s.zoom)
  const ensureMapNodes = useStore((s) => s.ensureMapNodes)
  const pushUndo = useStore((s) => s.pushUndo)
  const setSectionHeading = useStore((s) => s.setSectionHeading)
  const commitSectionHeading = useStore((s) => s.commitSectionHeading)
  const setSectionBeatSummary = useStore((s) => s.setSectionBeatSummary)
  const commitSectionBeatSummary = useStore((s) => s.commitSectionBeatSummary)
  const setIdeaNodeTitle = useStore((s) => s.setIdeaNodeTitle)
  const commitIdeaNodeTitle = useStore((s) => s.commitIdeaNodeTitle)
  const setIdeaNodeText = useStore((s) => s.setIdeaNodeText)
  const commitIdeaNodeText = useStore((s) => s.commitIdeaNodeText)
  const openSectionTab = useStore((s) => s.openSectionTab)
  const setActiveTab = useStore((s) => s.setActiveTab)
  const toggleOutlineView = useStore((s) => s.toggleOutlineView)
  const toggleMapView = useStore((s) => s.toggleMapView)
  const deleteOutlineNode = useStore((s) => s.deleteOutlineNode)

  useEffect(() => {
    ensureMapNodes(scriptId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptId, script.sections.length])

  const nodes = script.mapLayout.nodes
  const { ordered, connectedCount } = flattenMapOrder(script.mapLayout)

  function openSection(id) {
    openSectionTab(scriptId, id)
    setActiveTab(scriptId, id)
    toggleOutlineView()
  }

  function deleteIdea(id) {
    deleteOutlineNode(scriptId, id)
  }

  function deleteSectionNode(id, sec) {
    if (sectionsHaveContent([sec]) && !window.confirm('Delete "' + sec.heading + '"? This removes its lines and checkpoints permanently.')) return
    deleteOutlineNode(scriptId, id)
  }

  return (
    <div className="main outline-main">
      <div className="map-toolbar">
        <div className="outline-hint">
          A flattened, editable list of everything on the mind map — sections follow the main thread (if you've set one), then any
          other connected chains, then anything not yet connected.
        </div>
      </div>
      <div className="outline-list" style={{ zoom }}>
        {ordered.length === 0 && <div className="filter-empty">No sections or idea nodes yet.</div>}
        {ordered.map((id, i) => {
          const node = nodes[id]
          if (!node) return null
          const showDivider = i === connectedCount && connectedCount > 0 && connectedCount < ordered.length
          if (isIdeaNode(node)) {
            return (
              <React.Fragment key={id}>
                {showDivider && <div className="outline-divider">Not yet connected to anything else</div>}
                <div className="outline-item">
                  <span className="outline-item-num">{i + 1}</span>
                  <div className="outline-item-body">
                    <div className="outline-item-head">
                      <input
                        className="outline-item-title"
                        placeholder="Untitled idea"
                        value={node.title}
                        style={node.color ? { color: node.color } : undefined}
                        onFocus={() => pushUndo(scriptId)}
                        onChange={(e) => setIdeaNodeTitle(scriptId, id, e.target.value)}
                        onBlur={() => commitIdeaNodeTitle(scriptId)}
                      />
                      <button className="icon-btn" style={{ padding: '4px 8px' }} onClick={toggleMapView} title="View on the map">
                        <Icon name="map" size={12} />
                      </button>
                      <button
                        className="icon-btn"
                        style={{ padding: '4px 8px' }}
                        onClick={() => deleteIdea(id)}
                        title="Delete this node"
                      >
                        <Icon name="trash" size={12} />
                      </button>
                    </div>
                    <textarea
                      className="outline-item-text"
                      placeholder="Idea text…"
                      value={node.text}
                      onFocus={() => pushUndo(scriptId)}
                      onChange={(e) => setIdeaNodeText(scriptId, id, e.target.value)}
                      onBlur={() => commitIdeaNodeText(scriptId)}
                    />
                  </div>
                </div>
              </React.Fragment>
            )
          }
          const sec = script.sections.find((se) => se.id === id)
          if (!sec) return null
          return (
            <React.Fragment key={id}>
              {showDivider && <div className="outline-divider">Not yet connected to anything else</div>}
              <div className="outline-item">
                <span className="outline-item-num">{i + 1}</span>
                <div className="outline-item-body">
                  <div className="outline-item-head">
                    <input
                      className="outline-item-title"
                      placeholder="Untitled section"
                      value={sec.heading}
                      style={sec.titleColor ? { color: sec.titleColor } : undefined}
                      onFocus={() => pushUndo(scriptId)}
                      onChange={(e) => setSectionHeading(scriptId, id, e.target.value)}
                      onBlur={() => commitSectionHeading(scriptId, id)}
                    />
                    {sec.done && <Icon name="check" size={12} className="map-node-done" />}
                    <button className="icon-btn" style={{ padding: '4px 8px' }} onClick={() => openSection(id)} title="Open this section">
                      <Icon name="tabopen" size={12} />
                    </button>
                    <button className="icon-btn" style={{ padding: '4px 8px' }} onClick={toggleMapView} title="View on the map">
                      <Icon name="map" size={12} />
                    </button>
                    <button
                      className="icon-btn"
                      style={{ padding: '4px 8px' }}
                      onClick={() => deleteSectionNode(id, sec)}
                      title="Delete this section"
                    >
                      <Icon name="trash" size={12} />
                    </button>
                  </div>
                  <textarea
                    className="outline-item-text"
                    placeholder="One-line summary for this beat…"
                    value={sec.beatSummary}
                    onFocus={() => pushUndo(scriptId)}
                    onChange={(e) => setSectionBeatSummary(scriptId, id, e.target.value)}
                    onBlur={() => commitSectionBeatSummary(scriptId, id)}
                  />
                </div>
              </div>
            </React.Fragment>
          )
        })}
      </div>
    </div>
  )
}
