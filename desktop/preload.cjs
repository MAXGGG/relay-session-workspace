const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("zyiDesktop", {
  preferences: ipcRenderer.sendSync("zyi:preferences"),
  setPreference: (key, value) => ipcRenderer.send("zyi:preference", key, value),
  chooseDirectory: () => ipcRenderer.invoke("zyi:choose-directory"),
  importWorkspace: () => ipcRenderer.invoke("zyi:import-workspace"),
  menuAction: (operation) => ipcRenderer.invoke("zyi:menu-action", operation),
});
