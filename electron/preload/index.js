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
  // Fired when a script's .json file changes on disk from something other
  // than this app instance's own save — currently only the Premiere
  // extension (premiere-extension/), which edits tags/notes/done directly.
  onExternalScriptChange: (cb) => ipcRenderer.on('scripts:externalChange', (_e, script) => cb(script)),
  addWordToDictionary: (word) => ipcRenderer.invoke('spellcheck:addToDictionary', word),
  listDictionaryWords: () => ipcRenderer.invoke('spellcheck:listDictionaryWords'),
  removeFromDictionary: (word) => ipcRenderer.invoke('spellcheck:removeFromDictionary', word),
  loadGlobalCategories: () => ipcRenderer.invoke('categories:loadGlobal'),
  saveGlobalCategories: (list) => ipcRenderer.invoke('categories:saveGlobal', list),
  installUpdateNow: () => ipcRenderer.invoke('update:installNow'),
  checkForUpdatesNow: () => ipcRenderer.invoke('update:checkNow'),
  downloadManualUpdate: (version) => ipcRenderer.invoke('update:downloadManualMac', version),
  platform: process.platform,
  windowMinimize: () => ipcRenderer.invoke('window:minimize'),
  windowToggleMaximize: () => ipcRenderer.invoke('window:toggleMaximize'),
  windowClose: () => ipcRenderer.invoke('window:close'),
  windowIsMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  onWindowMaximizedChanged: (cb) => {
    const listener = (_e, maximized) => cb(maximized)
    ipcRenderer.on('window:maximizedChanged', listener)
    return () => ipcRenderer.removeListener('window:maximizedChanged', listener)
  }
}

contextBridge.exposeInMainWorld('bijou', api)
