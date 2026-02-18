const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const isDev = process.env.NODE_ENV === 'development';

ipcMain.handle('production:selectFiles', async () => {
  const { filePaths } = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Все файлы', extensions: ['*'] },
      { name: 'Excel', extensions: ['xlsx', 'xls', 'xlsm'] },
    ],
  });
  return filePaths || [];
});

ipcMain.handle('production:readFiles', async (_, filePaths) => {
  if (!Array.isArray(filePaths) || filePaths.length === 0) return [];
  const result = [];
  for (const filePath of filePaths) {
    try {
      const buf = await fs.promises.readFile(filePath);
      const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      result.push({
        path: filePath,
        fileName: path.basename(filePath),
        arrayBuffer,
      });
    } catch (err) {
      console.error('production:readFiles error', filePath, err);
    }
  }
  return result;
});

ipcMain.handle('production:getFileStats', async (_, filePaths) => {
  if (!Array.isArray(filePaths) || filePaths.length === 0) return [];
  const result = [];
  for (const filePath of filePaths) {
    try {
      const stat = await fs.promises.stat(filePath);
      result.push({ path: filePath, mtimeMs: stat.mtimeMs });
    } catch (err) {
      result.push({ path: filePath, mtimeMs: null });
    }
  }
  return result;
});

// Минимальный экран «Загрузка…» — показываем окно сразу, приложение грузится потом
const LOADING_HTML = `data:text/html;charset=utf-8,${encodeURIComponent(`
<!DOCTYPE html>
<html><head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; box-sizing: border-box; }
    body { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #f1f5f9; font-family: system-ui, -apple-system, sans-serif; }
    .box { text-align: center; padding: 2rem; }
    h1 { font-size: 1.5rem; color: #334155; margin-bottom: 0.75rem; }
    .spinner { width: 32px; height: 32px; margin: 0 auto 1rem; border: 3px solid #e2e8f0; border-top-color: #3b82f6; border-radius: 50%; animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    p { color: #64748b; font-size: 0.875rem; }
  </style>
</head><body>
  <div class="box">
    <div class="spinner"></div>
    <h1>Планировщик смен</h1>
    <p>Загрузка…</p>
  </div>
</body></html>
`)}`;

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    show: false,
    title: 'Планировщик смен',
    backgroundColor: '#f1f5f9',
  });

  // Сначала показываем окно с экраном «Загрузка…» — пользователь видит окно за доли секунды
  mainWindow.loadURL(LOADING_HTML);
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // Затем грузим настоящее приложение в том же окне
    if (isDev) {
      mainWindow.loadURL('http://localhost:3000');
      mainWindow.webContents.openDevTools();
    } else {
      mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
