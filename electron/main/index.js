import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'path'
import fs from 'fs'
import * as fileStore from './fileStore.js'
import { migrateScript, newBlankScript } from './scriptSchema.js'

const isDev = !app.isPackaged
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

  ipcMain.handle('scripts:save', (_e, script) => {
    fileStore.saveScript(script)
    return true
  })

  ipcMain.handle('scripts:delete', (_e, id) => {
    fileStore.deleteScript(id)
    return true
  })

  ipcMain.handle('scripts:newBlank', (_e, title) => {
    return newBlankScript(title)
  })

  ipcMain.handle('scripts:docsDir', () => fileStore.getDocsDir())

  ipcMain.handle('settings:load', () => fileStore.loadSettings())
  ipcMain.handle('settings:save', (_e, settings) => fileStore.saveSettings(settings))

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

app.whenReady().then(() => {
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
