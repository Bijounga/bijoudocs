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
  // A bijoudocs:// link asked to show a script/section/line (see main/deepLink.js).
  onOpenLink: (cb) => ipcRenderer.on('deeplink:open', (_e, link) => cb(link)),
  linkReady: () => ipcRenderer.invoke('deeplink:ready'),
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
  // The notepad outside the app window (an owned window; see main/padWindow.js).
  padOpen: (want, fromRect, snapshot) => ipcRenderer.invoke('pad:open', want, fromRect, snapshot),
  padClose: () => ipcRenderer.invoke('pad:close'),
  padPush: (snapshot) => ipcRenderer.send('pad:push', snapshot),
  padGetInit: () => ipcRenderer.invoke('pad:getInit'),
  padSend: (payload) => ipcRenderer.send('pad:send', payload),
  padCommand: (cmd) => ipcRenderer.send('pad:command', cmd),
  onPadSnapshot: (cb) => {
    const l = (_e, s) => cb(s)
    ipcRenderer.on('pad:snapshot', l)
    return () => ipcRenderer.removeListener('pad:snapshot', l)
  },
  onPadFromWindow: (cb) => {
    const l = (_e, p) => cb(p)
    ipcRenderer.on('pad:fromWindow', l)
    return () => ipcRenderer.removeListener('pad:fromWindow', l)
  },
  onPadCommand: (cb) => {
    const l = (_e, c) => cb(c)
    ipcRenderer.on('pad:command', l)
    return () => ipcRenderer.removeListener('pad:command', l)
  },
  onPadBounds: (cb) => {
    const l = (_e, b) => cb(b)
    ipcRenderer.on('pad:bounds', l)
    return () => ipcRenderer.removeListener('pad:bounds', l)
  },
  onPadClosed: (cb) => {
    const l = () => cb()
    ipcRenderer.on('pad:closed', l)
    return () => ipcRenderer.removeListener('pad:closed', l)
  },
  platform: process.platform,
  windowMinimize: () => ipcRenderer.invoke('window:minimize'),
  windowToggleMaximize: () => ipcRenderer.invoke('window:toggleMaximize'),
  windowClose: () => ipcRenderer.invoke('window:close'),
  windowIsMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  loadFootage: () => ipcRenderer.invoke('footage:load'),
  openInFootage: (target) => ipcRenderer.invoke('footage:open', target),
  onFootageChanged: (cb) => {
    const listener = () => cb()
    ipcRenderer.on('footage:changed', listener)
    return () => ipcRenderer.removeListener('footage:changed', listener)
  },
  onWindowMaximizedChanged: (cb) => {
    const listener = (_e, maximized) => cb(maximized)
    ipcRenderer.on('window:maximizedChanged', listener)
    return () => ipcRenderer.removeListener('window:maximizedChanged', listener)
  }
}

contextBridge.exposeInMainWorld('bijou', api)
