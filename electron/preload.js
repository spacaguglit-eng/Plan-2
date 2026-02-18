const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  productionSelectFiles: () => ipcRenderer.invoke('production:selectFiles'),
  productionReadFiles: (paths) => ipcRenderer.invoke('production:readFiles', paths),
  productionGetFileStats: (paths) => ipcRenderer.invoke('production:getFileStats', paths),
});
