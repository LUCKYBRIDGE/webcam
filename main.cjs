const { app, BrowserWindow, session, shell } = require('electron');
const path = require('path');

const serviceUrls = new Set([
  'https://knolquiz.com/',
  'https://art.knolquiz.com/',
  'https://print.knolquiz.com/',
  'https://name.knolquiz.com/'
]);

app.whenReady().then(() => {
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => permission === 'media');
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => callback(permission === 'media'));
  const win = new BrowserWindow({
    title: '놀화상기',
    width: 1280,
    height: 850,
    minWidth: 720,
    minHeight: 480,
    backgroundColor: '#11151b',
    autoHideMenuBar: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (serviceUrls.has(url)) {
      shell.openExternal(url).catch(error => console.error('Unable to open service link:', error));
    }
    return { action: 'deny' };
  });
  win.loadFile(path.join(__dirname, 'index.html'));
});

app.on('window-all-closed', () => app.quit());
