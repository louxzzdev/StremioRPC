const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    getConfig: () => ipcRenderer.invoke('get-config'),
    saveConfig: (config) => ipcRenderer.invoke('save-config', config),
    installAddon: () => ipcRenderer.send('install-addon'),
    getStatus: () => ipcRenderer.invoke('get-status'),
    onStatusChange: (callback) => {
        const subscription = (event, status) => callback(status);
        ipcRenderer.on('status-change', subscription);
        return () => ipcRenderer.removeListener('status-change', subscription);
    }
});
