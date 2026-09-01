import React from 'react'

const PATHS = {
  search: '<circle cx="6" cy="6" r="5"/><line x1="10" y1="10" x2="14" y2="14"/>',
  chevron: '<polyline points="4,6 8,10 12,6"/>',
  tag: '<path d="M3 3h6l6 6-6 6-6-6z"/><circle cx="6" cy="6" r="1"/>',
  note: '<path d="M3 3h10v8l-3 3H3z"/><line x1="5" y1="6" x2="11" y2="6"/><line x1="5" y1="9" x2="9" y2="9"/>',
  focus: '<rect x="3" y="3" width="4" height="4"/><rect x="9" y="9" width="4" height="4"/>',
  collapse: '<polyline points="4,4 4,10 10,10"/><polyline points="12,12 12,6 6,6"/>',
  menu: '<line x1="3" y1="5" x2="13" y2="5"/><line x1="3" y1="10" x2="13" y2="10"/>',
  download: '<path d="M8 2v8"/><polyline points="4,7 8,11 12,7"/><line x1="3" y1="13" x2="13" y2="13"/>',
  upload: '<path d="M8 11V3"/><polyline points="4,6 8,2 12,6"/><line x1="3" y1="13" x2="13" y2="13"/>',
  keys: '<rect x="2" y="5" width="12" height="7" rx="1"/><line x1="4.5" y1="8" x2="4.5" y2="8"/><line x1="7" y1="8" x2="7" y2="8"/><line x1="9.5" y1="8" x2="9.5" y2="8"/>',
  eye: '<path d="M2 8s2.5-4.5 6-4.5S14 8 14 8s-2.5 4.5-6 4.5S2 8 2 8z"/><circle cx="8" cy="8" r="1.6"/>',
  trash: '<path d="M3 4h10"/><path d="M5 4v9a1 1 0 001 1h4a1 1 0 001-1V4"/><path d="M6 4V2.5A.5.5 0 016.5 2h3a.5.5 0 01.5.5V4"/>',
  grip: '<circle cx="5.5" cy="4" r="1"/><circle cx="10.5" cy="4" r="1"/><circle cx="5.5" cy="8" r="1"/><circle cx="10.5" cy="8" r="1"/><circle cx="5.5" cy="12" r="1"/><circle cx="10.5" cy="12" r="1"/>',
  tabopen: '<rect x="3" y="3" width="10" height="10" rx="1.5"/><path d="M6.5 9.5l4-4"/><path d="M7.5 5.5h3v3"/>',
  undo: '<path d="M4 8h7a3 3 0 010 6H8"/><polyline points="6,5 3,8 6,11"/>',
  redo: '<path d="M12 8H5a3 3 0 000 6h3"/><polyline points="10,5 13,8 10,11"/>',
  idea: '<rect x="2.5" y="3.5" width="3" height="3" rx="0.6"/><line x1="7.5" y1="5" x2="13.5" y2="5"/><rect x="2.5" y="8.5" width="3" height="3" rx="0.6"/><line x1="7.5" y1="10" x2="13.5" y2="10"/><path d="M3 13l1 1 2-2"/>',
  teleprompter: '<rect x="2" y="2.5" width="12" height="8" rx="1.2"/><line x1="4.5" y1="5" x2="11.5" y2="5"/><line x1="4.5" y1="7.3" x2="9.5" y2="7.3"/><path d="M5.5 13.5l1.2-2.5h2.6l1.2 2.5"/>',
  mic: '<rect x="6" y="1.5" width="4" height="7" rx="2"/><path d="M4 7.5a4 4 0 008 0"/><line x1="8" y1="11.5" x2="8" y2="14"/><line x1="5.5" y1="14" x2="10.5" y2="14"/>',
  micOff: '<rect x="6" y="1.5" width="4" height="7" rx="2"/><path d="M4 7.5a4 4 0 008 0"/><line x1="8" y1="11.5" x2="8" y2="14"/><line x1="5.5" y1="14" x2="10.5" y2="14"/><line x1="2.5" y1="2" x2="13.5" y2="14"/>',
  bookmark: '<path d="M4 2.5h8v11l-4-3-4 3z"/>',
  calendar: '<rect x="2.5" y="3" width="11" height="10.5" rx="1.2"/><line x1="2.5" y1="6.5" x2="13.5" y2="6.5"/><line x1="5" y1="1.5" x2="5" y2="4"/><line x1="11" y1="1.5" x2="11" y2="4"/>',
  map: '<rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1"/><rect x="9" y="2.5" width="4.5" height="4.5" rx="1"/><rect x="5.75" y="9" width="4.5" height="4.5" rx="1"/><path d="M4.75 7v1a1 1 0 001 1H6"/><path d="M11.25 7v1a1 1 0 01-1 1h-.25"/>',
  layers: '<path d="M8 2.5l5.5 3L8 8.5l-5.5-3z"/><path d="M2.5 8.5L8 11.5l5.5-3"/><path d="M2.5 11.5L8 14.5l5.5-3"/>',
  check: '<polyline points="3,8.5 6.5,12 13,4.5"/>',
  x: '<line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/>'
}

export default function Icon({ name, size = 14, className, filled = false }) {
  const inner = PATHS[name] || ''
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      dangerouslySetInnerHTML={{ __html: inner }}
    />
  )
}
