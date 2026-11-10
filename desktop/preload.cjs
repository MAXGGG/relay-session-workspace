const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("zyiDesktop", {
  preferences: ipcRenderer.sendSync("zyi:preferences"),
  setPreference: (key, value) => ipcRenderer.send("zyi:preference", key, value),
});
