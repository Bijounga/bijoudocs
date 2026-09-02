import { contextBridge, ipcRenderer } from 'electron'

// Everything the renderer is allowed to touch on the file system goes
// through here — no direct fs/ipcRenderer access from React code.
const api = {
  loadAllScripts: () => ipcRenderer.invoke('scripts:loadAll'),
  saveScript: (script, expectedUpdatedAt, opts) => ipcRenderer.invoke('scripts:save', script, expectedUpdatedAt, opts),
  deleteScript: (id) => ipcRenderer.invoke('scripts:delete', id),
  getSaveHistory: (id) => ipcRenderer.invoke('scripts:saveHistory', id),
  restoreFromHistory: (id, file) => ipcRenderer.invoke('scripts:restoreFromHistory', id, file),
  revealInFolder: (id) => ipcRenderer.invoke('scripts:revealInFolder', id),
  newBlankScript: (title) => ipcRenderer.invoke('scripts:newBlank', title),
  getDocsDir: () => ipcRenderer.invoke('scripts:docsDir'),
  getAppVersion: () => ipcRenderer.invoke('app:version'),
  exportFile: (payload) => ipcRenderer.invoke('dialog:exportFile', payload),
  importFile: () => ipcRenderer.invoke('dialog:importFile'),
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  chooseStorageDir: () => ipcRenderer.invoke('settings:chooseStorageDir'),
  resetStorageDir: () => ipcRenderer.invoke('settings:resetStorageDir'),
  onUpdateStatus: (cb) => ipcRenderer.on('update:status', (_e, payload) => cb(payload)),
  onCloseContextMenu: (cb) => ipcRenderer.on('contextmenu:close', () => cb()),
  onSpellcheckDebug: (cb) => ipcRenderer.on('spellcheck:debug', (_e, payload) => cb(payload)),
  installUpdateNow: () => ipcRenderer.invoke('update:installNow'),
  checkForUpdatesNow: () => ipcRenderer.invoke('update:checkNow'),
  downloadManualUpdate: (version) => ipcRenderer.invoke('update:downloadManualMac', version)
}

contextBridge.exposeInMainWorld('bijou', api)
