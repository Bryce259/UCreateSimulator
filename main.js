const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

function createWindow() {
  const window = new BrowserWindow({
    width: 1360, height: 900, minWidth: 1000, minHeight: 720,
    title: 'UCreate Simulator',
    webPreferences: { contextIsolation: true, sandbox: true, preload: path.join(__dirname, 'preload.js') }
  });
  window.loadFile(path.join(__dirname, '..', 'app', 'index.html'));
}
app.whenReady().then(() => { Menu.setApplicationMenu(null); createWindow(); app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); }); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
