import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('apDesktop', {
  getServiceStatus: () => ipcRenderer.invoke('ap-desktop:get-service-status'),
});
