const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('studioAPI', {
  // Directory picker
  openDirectoryDialog: () => ipcRenderer.invoke('open-directory-dialog'),
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),

  // Studio config (server URL + token)
  readStudioConfig: () => ipcRenderer.invoke('read-studio-config'),
  writeStudioConfig: (config) => ipcRenderer.invoke('write-studio-config', config),

  // System paths & checks
  getHomePath: () => ipcRenderer.invoke('get-home-path'),
  checkBananaConfig: () => ipcRenderer.invoke('check-banana-config'),
  readTokenFile: () => ipcRenderer.invoke('read-token-file'),

  // Navigation signals from main process
  onNavigate: (callback) => ipcRenderer.on('navigate', (_event, page) => callback(page)),

  // Window controls (for custom titlebar)
  minimizeWindow: () => ipcRenderer.invoke('window-minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window-maximize'),
  closeWindow: () => ipcRenderer.invoke('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),

  // Platform info
  getPlatform: () => ipcRenderer.invoke('get-platform'),

  // Browser Use
  clearBrowserData: () => ipcRenderer.invoke('clear-browser-data'),
});
