const electron = require('electron');
const app = electron.app;
const BrowserWindow = electron.BrowserWindow;

const path = require('path');
const url = require('url');
const isDev = require('electron-is-dev');

// const ElectronCookies = require('@exponent/electron-cookies');

// ElectronCookies.enable({
//   origin: 'http://127.0.0.1:3001',
// });
// ElectronCookies.enable({
//   origin: 'https://example.com',
// });

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({ width: 900, height: 680 });
  mainWindow.loadURL(
    isDev
      ? 'http://localhost:3000'
      : `file://${path.join(__dirname, '../build/index.html')}`
  );
  mainWindow.on('closed', () => (mainWindow = null));

  const mainSession = mainWindow.webContents.session;

  mainSession.cookies.get({}, (error, cookies) => console.log(cookies));
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
