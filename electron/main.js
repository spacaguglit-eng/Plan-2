const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const isDev = process.env.NODE_ENV === 'development';

const DEV_SERVER_PORT = Number(process.env.VITE_DEV_SERVER_PORT || 3000);

/** Electron стартует быстрее Vite — без ожидания порта получается белый экран и пустая консоль. */
function waitForDevServer(port, timeoutMs = 120000) {
  const url = `http://127.0.0.1:${port}/`;
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const req = http.get(url, { timeout: 1500 }, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        req.destroy();
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Нет ответа от dev-сервера (${url}). Запустите Vite или проверьте порт.`));
        } else {
          setTimeout(tryConnect, 200);
        }
      });
      req.on('timeout', () => {
        req.destroy();
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Таймаут ожидания dev-сервера (${url}).`));
        } else {
          setTimeout(tryConnect, 200);
        }
      });
    };
    tryConnect();
  });
}

/** Второй запуск (двойной клик по батнику) не плодит окна — фокус на уже открытом. */
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

let mainWindow = null;

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

ipcMain.handle('onec:testHttpConnection', async (_, url, user, password) => {
  const base = (url || '').trim().replace(/\/+$/, '');
  if (!base) return { ok: false, error: 'Укажите адрес 1С' };
  let finalUrl = /^https?:\/\//i.test(base) ? base : 'https://' + base;
  const auth = (user || password) ? Buffer.from((user || '') + ':' + (password || '')).toString('base64') : null;
  const tryRequest = (href) => {
    return new Promise((resolve) => {
      const u = new URL(href);
      const lib = u.protocol === 'https:' ? https : http;
      const opts = {
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname || '/',
        method: 'GET',
        headers: { Accept: 'application/json, text/html, */*' }
      };
      if (auth) opts.headers.Authorization = 'Basic ' + auth;
      const req = lib.request(opts, (res) => {
        if (res.statusCode === 200) resolve({ ok: true, message: `Сервер доступен, HTTP ${res.statusCode}` });
        else if (res.statusCode === 401) resolve({ ok: true, message: 'Сервер достигнут, требуется авторизация (HTTP 401)' });
        else if (res.statusCode === 403) resolve({ ok: true, message: 'Сервер достигнут, доступ запрещён (HTTP 403)' });
        else resolve({ ok: false, error: `HTTP ${res.statusCode}` });
      });
      req.setTimeout(15000, () => { req.destroy(); resolve({ ok: false, error: 'Таймаут' }); });
      req.on('error', (e) => resolve({ ok: false, error: e.message || String(e) }));
      req.end();
    });
  };
  const r1 = await tryRequest(finalUrl + '/odata/standard.odata/$metadata');
  if (r1.ok) return r1;
  const r2 = await tryRequest(finalUrl + '/');
  if (r2.ok) return r2;
  return r1;
});

ipcMain.handle('onec:executeRequest', async (_, url, user, password, pathOrFullUrl) => {
  const pathStr = (pathOrFullUrl || '').trim();
  if (!pathStr) return { ok: false, error: 'Укажите путь запроса' };
  let href;
  if (/^https?:\/\//i.test(pathStr)) {
    href = pathStr;
  } else {
    const base = (url || '').trim().replace(/\/+$/, '');
    if (!base) return { ok: false, error: 'Укажите адрес 1С (или полный URL)' };
    href = (/^https?:\/\//i.test(base) ? base : 'https://' + base) + (pathStr.startsWith('/') ? pathStr : '/' + pathStr);
  }
  const auth = (user || password) ? Buffer.from((user || '') + ':' + (password || '')).toString('base64') : null;
  return new Promise((resolve) => {
    const u = new URL(href);
    const lib = u.protocol === 'https:' ? https : http;
    const opts = {
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + (u.search || ''),
      method: 'GET',
      headers: { Accept: 'application/json, application/xml, text/html, */*' }
    };
    if (auth) opts.headers.Authorization = 'Basic ' + auth;
    const req = lib.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ ok: true, status: res.statusCode, body });
        } else {
          resolve({ ok: false, error: `HTTP ${res.statusCode}`, body });
        }
      });
    });
    req.setTimeout(20000, () => { req.destroy(); resolve({ ok: false, error: 'Таймаут' }); });
    req.on('error', (e) => resolve({ ok: false, error: e.message || String(e) }));
    req.end();
  });
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

const PRODUCTION_PATHS_STORE = 'production-selected-paths.json';

function getProductionPathsStoreFile() {
  return path.join(app.getPath('userData'), PRODUCTION_PATHS_STORE);
}

async function readProductionSelectedPaths() {
  try {
    const filePath = getProductionPathsStoreFile();
    const raw = await fs.promises.readFile(filePath, 'utf8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.filter((x) => typeof x === 'string' && String(x).trim());
  } catch (_) {
    return [];
  }
}

async function writeProductionSelectedPaths(paths) {
  const dir = app.getPath('userData');
  await fs.promises.mkdir(dir, { recursive: true });
  const clean = Array.isArray(paths)
    ? paths.filter((p) => typeof p === 'string' && String(p).trim()).map((p) => String(p).trim())
    : [];
  await fs.promises.writeFile(getProductionPathsStoreFile(), JSON.stringify(clean), 'utf8');
}

ipcMain.handle('production:getSelectedPaths', async () => readProductionSelectedPaths());

ipcMain.handle('production:setSelectedPaths', async (_, paths) => {
  await writeProductionSelectedPaths(paths);
  return { ok: true };
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
  mainWindow = new BrowserWindow({
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
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Сначала показываем окно с экраном «Загрузка…» — пользователь видит окно за доли секунды
  mainWindow.loadURL(LOADING_HTML);
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (isDev) {
      (async () => {
        try {
          await waitForDevServer(DEV_SERVER_PORT);
          await mainWindow.loadURL(`http://127.0.0.1:${DEV_SERVER_PORT}/`);
          mainWindow.webContents.openDevTools();
        } catch (err) {
          console.error(err);
          const msg = String(err && err.message ? err.message : err);
          const html = `data:text/html;charset=utf-8,${encodeURIComponent(
            `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Ошибка</title></head><body style="font-family:system-ui;padding:2rem;background:#fef2f2;color:#991b1b">` +
              `<h1>Не удалось подключиться к Vite</h1><p>${msg.replace(/</g, '&lt;')}</p>` +
              `<p style="color:#64748b;font-size:14px">Убедитесь, что порт ${DEV_SERVER_PORT} свободен и команда <code>npm run dev</code> запущена (или используйте <code>npm run dev:electron</code>).</p></body></html>`
          )}`;
          await mainWindow.loadURL(html);
          mainWindow.webContents.openDevTools();
        }
      })();
    } else {
      const indexPath = path.join(__dirname, '../dist/index.html');
      if (!fs.existsSync(indexPath)) {
        console.error('Нет сборки: запустите npm run build перед npm run electron');
        const errHtml = `data:text/html;charset=utf-8,${encodeURIComponent(
          `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:system-ui;padding:2rem">` +
            `<h1>Нет папки dist</h1><p>Выполните в каталоге проекта: <code>npm run build</code>, затем снова запустите Electron.</p></body></html>`
        )}`;
        mainWindow.loadURL(errHtml);
      } else {
        mainWindow.loadFile(indexPath);
        mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
          console.error('did-fail-load', code, desc, url);
        });
      }
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
