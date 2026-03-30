const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  productionSelectFiles: () => ipcRenderer.invoke('production:selectFiles'),
  productionReadFiles: (paths) => ipcRenderer.invoke('production:readFiles', paths),
  productionGetFileStats: (paths) => ipcRenderer.invoke('production:getFileStats', paths),
  productionGetSelectedPaths: () => ipcRenderer.invoke('production:getSelectedPaths'),
  productionSetSelectedPaths: (paths) => ipcRenderer.invoke('production:setSelectedPaths', paths),
  onecTestHttpConnection: (url, user, password) => ipcRenderer.invoke('onec:testHttpConnection', url, user, password),
  onecExecuteRequest: (url, user, password, pathOrFullUrl) => ipcRenderer.invoke('onec:executeRequest', url, user, password, pathOrFullUrl),
});
