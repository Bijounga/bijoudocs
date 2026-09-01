import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { autoUpdater } from 'electron-updater'
import https from 'https'
import path from 'path'
import fs from 'fs'
import * as fileStore from './fileStore.js'
import { migrateScript, newBlankScript } from './scriptSchema.js'

const isDev = !app.isPackaged
const isMac = process.platform === 'darwin'

// Follows redirects manually — GitHub release asset URLs 302 to a CDN —
// and streams the response straight to disk.
function downloadFile(url, destPath, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume()
          if (redirectsLeft <= 0) {
            reject(new Error('Too many redirects downloading ' + url))
            return
          }
          downloadFile(res.headers.location, destPath, redirectsLeft - 1).then(resolve, reject)
          return
        }
        if (res.statusCode !== 200) {
          res.resume()
          reject(new Error('Download failed: HTTP ' + res.statusCode + ' for ' + url))
          return
        }
        const file = fs.createWriteStream(destPath)
        res.pipe(file)
        file.on('finish', () => file.close(() => resolve()))
        file.on('error', reject)
      })
      .on('error', reject)
  })
}
// Lets a local script drive/inspect the renderer via CDP during development
// (see scripts/cdp.mjs) instead of OS-level mouse automation.
if (isDev) app.commandLine.appendSwitch('remote-debugging-port', '9222')

function createWindow() {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 860,
    minHeight: 560,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#14151A',
    icon: path.join(__dirname, '../../build/icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  win.on('ready-to-show', () => win.show())
  if (isDev) {
    win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
      console.log('[renderer]', message, '(' + sourceId + ':' + line + ')')
    })
  }

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  return win
}

function registerIpc() {
  ipcMain.handle('scripts:loadAll', () => {
    return fileStore.loadAllScripts()
  })

  ipcMain.handle('scripts:save', (_e, script, expectedUpdatedAt) => {
    return fileStore.saveScript(script, expectedUpdatedAt)
  })

  ipcMain.handle('scripts:delete', (_e, id) => {
    fileStore.deleteScript(id)
    return true
  })

  ipcMain.handle('scripts:newBlank', (_e, title) => {
    return newBlankScript(title)
  })

  ipcMain.handle('scripts:docsDir', () => fileStore.getDocsDir())

  ipcMain.handle('app:version', () => app.getVersion())

  ipcMain.handle('settings:load', () => fileStore.loadSettings())
  ipcMain.handle('settings:save', (_e, settings) => fileStore.saveSettings(settings))

  ipcMain.handle('settings:chooseStorageDir', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Choose a folder to store your scripts in'
    })
    if (canceled || !filePaths.length) return { canceled: true }
    const newDir = filePaths[0]
    const oldDir = fileStore.getDocsDir()
    fileStore.migrateStorageDir(oldDir, newDir)
    const settings = fileStore.loadSettings()
    settings.storageDir = newDir
    fileStore.saveSettings(settings)
    return { canceled: false, dir: newDir }
  })

  ipcMain.handle('settings:resetStorageDir', () => {
    const oldDir = fileStore.getDocsDir()
    const newDir = fileStore.defaultDocsDir()
    fileStore.migrateStorageDir(oldDir, newDir)
    const settings = fileStore.loadSettings()
    delete settings.storageDir
    fileStore.saveSettings(settings)
    return { dir: newDir }
  })

  ipcMain.handle('dialog:exportFile', async (_e, { defaultName, content, filters }) => {
    const win = BrowserWindow.getFocusedWindow()
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      defaultPath: defaultName,
      filters: filters || [{ name: 'All Files', extensions: ['*'] }]
    })
    if (canceled || !filePath) return { canceled: true }
    fs.writeFileSync(filePath, content, 'utf-8')
    return { canceled: false, filePath }
  })

  ipcMain.handle('dialog:importFile', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'BijouDocs / text', extensions: ['json', 'txt', 'md'] }]
    })
    if (canceled || !filePaths.length) return { canceled: true }
    const filePath = filePaths[0]
    const text = fs.readFileSync(filePath, 'utf-8')
    let script = null
    if (filePath.endsWith('.json')) {
      try {
        const raw = JSON.parse(text)
        if (raw && Array.isArray(raw.sections)) script = migrateScript(raw, { forceNewId: true })
      } catch (err) {
        // fall through to plain-text import below
      }
    }
    return { canceled: false, filePath, text, script }
  })
}

// Checks GitHub Releases for a newer published version. On Windows this
// downloads it silently in the background and tells the renderer once
// it's ready to install (electron-updater's NSIS-based quitAndInstall
// works cleanly there). On macOS, electron-updater's native path goes
// through Squirrel.Mac, which requires the app to be code-signed — this
// project has no Apple Developer certificate, so that path fails. Rather
// than try to silently auto-apply an update Squirrel.Mac will refuse,
// autoDownload is left off on Mac and 'update-available' instead offers a
// direct download-the-dmg-and-open-it-in-Finder flow (see
// update:downloadManualMac below) — not fully automatic, but no dead end.
// No-op in dev, where there's no packaged app/update feed to check against.
function setupAutoUpdater(win) {
  if (isDev) return
  autoUpdater.autoDownload = !isMac
  autoUpdater.on('checking-for-update', () => {
    win.webContents.send('update:status', { state: 'checking' })
  })
  autoUpdater.on('update-available', (info) => {
    win.webContents.send('update:status', { state: isMac ? 'available-manual' : 'available', version: info.version })
  })
  autoUpdater.on('update-not-available', () => {
    win.webContents.send('update:status', { state: 'not-available' })
  })
  autoUpdater.on('update-downloaded', (info) => {
    win.webContents.send('update:status', { state: 'downloaded', version: info.version })
  })
  autoUpdater.on('error', (err) => {
    console.error('BijouDocs: auto-update error', err)
    win.webContents.send('update:status', { state: 'error', message: err && err.message })
  })
  const check = () => autoUpdater.checkForUpdates().catch((err) => console.error('BijouDocs: update check failed', err))
  check()
  setInterval(check, 4 * 60 * 60 * 1000)
  return check
}

app.whenReady().then(() => {
  registerIpc()
  const win = createWindow()
  const checkNow = setupAutoUpdater(win)

  ipcMain.handle('update:installNow', () => {
    // Both args default to false — without them the NSIS installer runs
    // its full interactive wizard (welcome screen, install-dir picker,
    // etc.) on every single update, not just first install. `true, true`
    // installs silently in the background and relaunches the app after.
    autoUpdater.quitAndInstall(true, true)
  })

  ipcMain.handle('update:checkNow', () => {
    if (checkNow) checkNow()
    else win.webContents.send('update:status', { state: 'not-available' }) // dev — nothing to check against
  })

  // The Mac fallback from setupAutoUpdater's 'available-manual' state:
  // fetches the actual .dmg release asset directly (not the .zip
  // electron-updater's own Squirrel.Mac path uses internally) and opens
  // it, so the user just has to drag the app into Applications same as a
  // first install — no dependency on Squirrel.Mac's signature check.
  ipcMain.handle('update:downloadManualMac', async (_e, version) => {
    const fileName = `BijouDocs-${version}-universal.dmg`
    const url = `https://github.com/Bijounga/bijoudocs/releases/download/v${version}/${fileName}`
    const destPath = path.join(app.getPath('downloads'), fileName)
    win.webContents.send('update:status', { state: 'manual-downloading', version })
    try {
      await downloadFile(url, destPath)
      await shell.openPath(destPath)
      win.webContents.send('update:status', { state: 'manual-ready', version })
    } catch (err) {
      console.error('BijouDocs: manual update download failed', err)
      win.webContents.send('update:status', { state: 'error', message: err && err.message })
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
