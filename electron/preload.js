const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  productionSelectFiles: () => ipcRenderer.invoke('production:selectFiles'),
  productionReadFiles: (paths) => ipcRenderer.invoke('production:readFiles', paths),
});
