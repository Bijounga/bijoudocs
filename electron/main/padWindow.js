import { BrowserWindow, screen, ipcMain } from 'electron'

// The notepad can leave the app window and sit on any monitor. It is still part of
// the app, not a window of its own: an OWNED window (parent = the main window) with
// no taskbar button, which stays above the app, minimises and restores with it and
// closes with it. Its contents are the same notepad component; the main window's
// renderer stays the one source of truth (it relays state both ways through here).

let padWin = null
let lastSnapshot = null
let boundsTimer = null
let mainClosing = false

const isAlive = () => padWin && !padWin.isDestroyed()

// Screen bounds the window can safely open at: the saved ones if they are still on
// a connected screen, otherwise beside the app window.
function safeBounds(mainWin, want) {
  const main = mainWin.getBounds()
  const fallback = { x: main.x + Math.max(0, main.width - 420), y: main.y + 90, width: 360, height: 380 }
  const b = want && Number.isFinite(want.x) && Number.isFinite(want.y) ? { width: 360, height: 380, ...want } : fallback
  const cx = b.x + b.width / 2
  const cy = b.y + Math.min(b.height, 60)
  const onScreen = screen.getAllDisplays().some((d) => {
    const a = d.workArea
    return cx >= a.x && cx <= a.x + a.width && cy >= a.y && cy <= a.y + a.height
  })
  return onScreen ? b : fallback
}

export function registerPadIpc(getMainWindow, { preload, icon, loadInto }) {
  const toMain = (channel, payload) => {
    const w = getMainWindow()
    if (w && !w.isDestroyed()) w.webContents.send(channel, payload)
  }

  // Main window -> open the pad window (or show it again). `want` is its last screen
  // bounds; `fromRect` is where the in-app notepad was, in the app window's own coordinates.
  ipcMain.handle('pad:open', (_e, want, fromRect, snapshot) => {
    const mainWin = getMainWindow()
    if (!mainWin || mainWin.isDestroyed()) return
    lastSnapshot = snapshot
    if (isAlive()) {
      padWin.show()
      return
    }
    let initial = want
    if (!initial && fromRect) {
      const c = mainWin.getContentBounds()
      initial = { x: Math.round(c.x + fromRect.x), y: Math.round(c.y + fromRect.y), width: fromRect.w, height: fromRect.h }
    }
    const b = safeBounds(mainWin, initial)
    padWin = new BrowserWindow({
      parent: mainWin,
      x: Math.round(b.x),
      y: Math.round(b.y),
      width: Math.round(b.width),
      height: Math.round(b.height),
      minWidth: 240,
      minHeight: 200,
      show: false,
      frame: false,
      skipTaskbar: true,
      maximizable: false,
      fullscreenable: false,
      minimizable: false,
      autoHideMenuBar: true,
      backgroundColor: '#1b1d23',
      title: 'Notepad',
      icon,
      webPreferences: { preload, sandbox: false }
    })
    padWin.once('ready-to-show', () => padWin && !padWin.isDestroyed() && padWin.show())
    const sendBounds = () => {
      clearTimeout(boundsTimer)
      boundsTimer = setTimeout(() => {
        if (isAlive()) toMain('pad:bounds', padWin.getBounds())
      }, 300)
    }
    // 'move' / 'resize' fire all along a drag (debounced above), so the spot is kept however it was moved.
    padWin.on('move', sendBounds)
    padWin.on('resize', sendBounds)
    padWin.on('closed', () => {
      clearTimeout(boundsTimer)
      padWin = null
      // Closing the whole app closes this too; that must not look like "put the notepad away".
      if (!mainClosing) toMain('pad:closed')
    })
    loadInto(padWin, '#notepad')
  })

  ipcMain.handle('pad:close', () => {
    if (isAlive()) padWin.close()
  })

  // Main window pushes fresh state; the pad window applies it.
  ipcMain.on('pad:push', (_e, snapshot) => {
    lastSnapshot = snapshot
    if (isAlive()) padWin.webContents.send('pad:snapshot', snapshot)
  })

  // The pad window asks for what to show when it first loads.
  ipcMain.handle('pad:getInit', () => lastSnapshot)

  // The pad window -> the main window: edits, and buttons (close / put back in the app).
  ipcMain.on('pad:send', (_e, payload) => toMain('pad:fromWindow', payload))
  ipcMain.on('pad:command', (_e, cmd) => toMain('pad:command', cmd))
}

// Called with the main window once it exists: keeps the pad in step with it.
export function followMainWindow(mainWin) {
  // Owned windows already go with their owner on Windows and macOS; this makes it certain.
  mainWin.on('minimize', () => {
    if (isAlive()) padWin.hide()
  })
  mainWin.on('restore', () => {
    if (isAlive()) padWin.showInactive()
  })
  mainWin.on('close', () => {
    mainClosing = true
  })
  mainWin.on('closed', () => {
    if (isAlive()) padWin.destroy()
  })
}

export const padWindow = () => (isAlive() ? padWin : null)
