import { contextBridge, ipcRenderer } from 'electron'

// Everything the renderer is allowed to touch on the file system goes
// through here — no direct fs/ipcRenderer access from React code.
const api = {
  loadAllScripts: () => ipcRenderer.invoke('scripts:loadAll'),
  saveScript: (script) => ipcRenderer.invoke('scripts:save', script),
  deleteScript: (id) => ipcRenderer.invoke('scripts:delete', id),
  newBlankScript: (title) => ipcRenderer.invoke('scripts:newBlank', title),
  getDocsDir: () => ipcRenderer.invoke('scripts:docsDir'),
  exportFile: (payload) => ipcRenderer.invoke('dialog:exportFile', payload),
  importFile: () => ipcRenderer.invoke('dialog:importFile'),
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings)
}

contextBridge.exposeInMainWorld('bijou', api)
