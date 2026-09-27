import React, { useEffect, useState } from 'react'
import iconUrl from '../assets/titlebar-icon.png'

// The window's own title bar, replacing the hidden native one (see
// titleBarStyle in electron/main/index.js) so every theme can restyle it.
// All visuals come from the --titlebar-* / --caption-* tokens in styles.css.
// On macOS the native traffic lights stay, so no caption buttons are drawn.
export default function TitleBar() {
  const api = window.bijou
  const isMac = api?.platform === 'darwin'
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    if (!api?.windowIsMaximized) return
    api.windowIsMaximized().then(setMaximized)
    return api.onWindowMaximizedChanged(setMaximized)
  }, [api])

  return (
    <div className={'titlebar' + (isMac ? ' mac' : '')}>
      {!isMac && <img className="titlebar-icon" src={iconUrl} alt="" draggable={false} />}
      <span className="titlebar-title">BijouDocs</span>
      {!isMac && api?.windowMinimize && (
        <div className="titlebar-captions">
          <button className="titlebar-caption" tabIndex={-1} title="Minimize" onClick={() => api.windowMinimize()}>
            <svg viewBox="0 0 10 10" aria-hidden="true">
              <path d="M0 5.5h10" />
            </svg>
          </button>
          <button
            className="titlebar-caption"
            tabIndex={-1}
            title={maximized ? 'Restore Down' : 'Maximize'}
            onClick={() => api.windowToggleMaximize()}
          >
            <svg viewBox="0 0 10 10" aria-hidden="true">
              {maximized ? <path d="M2.5 2.5V0.5h7v7h-2M0.5 2.5h7v7h-7z" /> : <path d="M0.5 0.5h9v9h-9z" />}
            </svg>
          </button>
          <button className="titlebar-caption titlebar-close" tabIndex={-1} title="Close" onClick={() => api.windowClose()}>
            <svg viewBox="0 0 10 10" aria-hidden="true">
              <path d="M0.5 0.5l9 9M9.5 0.5l-9 9" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}
