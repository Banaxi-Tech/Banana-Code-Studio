const { app, BrowserWindow, ipcMain, dialog, session, systemPreferences } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const http = require('http');
const { readConfig, writeConfig, configExists, readWindowState, writeWindowState } = require('./studio-config.js');

let mainWindow;
let bananaApiProcess = null;
let bananaApiLogStream = null;

const BANANA_API_HOST = '127.0.0.1';
const BANANA_API_PORT = 3000;

function getPathEntries() {
  const entries = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  const commonEntries = process.platform === 'win32'
    ? [
        path.join(os.homedir(), 'AppData', 'Roaming', 'npm'),
        'C:\\Program Files\\nodejs',
      ]
    : [
        path.join(os.homedir(), '.local', 'bin'),
        '/opt/homebrew/bin',
        '/usr/local/bin',
        '/usr/bin',
        '/bin',
      ];

  return [...new Set([...entries, ...commonEntries])];
}

function isExecutable(filePath) {
  try {
    if (process.platform === 'win32') {
      return fs.existsSync(filePath);
    }

    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch (e) {
    return false;
  }
}

function findBananaExecutable() {
  const explicitExecutable = process.env.BANANA_CLI_PATH;
  if (explicitExecutable && isExecutable(explicitExecutable)) {
    return explicitExecutable;
  }

  if (process.platform !== 'win32') {
    const siblingCheckoutExecutable = path.resolve(__dirname, '..', 'Banana-Code', 'bin', 'banana.js');
    if (isExecutable(siblingCheckoutExecutable)) {
      return siblingCheckoutExecutable;
    }
  }

  const commandNames = process.platform === 'win32'
    ? ['banana.cmd', 'banana.exe', 'banana.bat', 'banana']
    : ['banana'];

  for (const entry of getPathEntries()) {
    for (const commandName of commandNames) {
      const candidate = path.join(entry, commandName);
      if (isExecutable(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

function closeBananaApiLogStream() {
  bananaApiLogStream?.end();
  bananaApiLogStream = null;
}

function readBananaApiToken() {
  const tokenPath = path.join(os.homedir(), '.config', 'banana-code', 'token.json');
  try {
    const data = fs.readFileSync(tokenPath, 'utf-8');
    return JSON.parse(data).token || null;
  } catch (e) {
    return null;
  }
}

function isBananaApiRunning() {
  const token = readBananaApiToken();
  if (!token) return Promise.resolve(false);

  return new Promise((resolve) => {
    const req = http.get({
      hostname: BANANA_API_HOST,
      port: BANANA_API_PORT,
      path: `/api/status?token=${encodeURIComponent(token)}`,
      timeout: 1000,
    }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });

    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.on('error', () => resolve(false));
  });
}

async function startBananaApiServerIfAvailable() {
  if (bananaApiProcess) return;

  const bananaExecutable = findBananaExecutable();
  if (!bananaExecutable) return;

  if (await isBananaApiRunning()) {
    console.log('[Banana API] Existing server detected on port 3000.');
    return;
  }

  try {
    const logPath = path.join(app.getPath('userData'), 'banana-api.log');
    bananaApiLogStream = fs.createWriteStream(logPath, { flags: 'a' });
    bananaApiLogStream.write(`\n[${new Date().toISOString()}] Starting ${bananaExecutable} --api\n`);

    bananaApiProcess = spawn(bananaExecutable, ['--api'], {
      cwd: os.homedir(),
      env: process.env,
      windowsHide: true,
      shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(bananaExecutable),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    bananaApiProcess.stdout?.pipe(bananaApiLogStream, { end: false });
    bananaApiProcess.stderr?.pipe(bananaApiLogStream, { end: false });

    bananaApiProcess.on('error', (error) => {
      console.error('[Banana API] Failed to start:', error);
      bananaApiLogStream?.write(`[${new Date().toISOString()}] Failed to start: ${error.message}\n`);
      bananaApiProcess = null;
      closeBananaApiLogStream();
    });

    bananaApiProcess.on('exit', (code, signal) => {
      bananaApiLogStream?.write(`[${new Date().toISOString()}] Exited with code ${code}, signal ${signal}\n`);
      bananaApiProcess = null;
      closeBananaApiLogStream();
    });
  } catch (error) {
    console.error('[Banana API] Startup check failed:', error);
  }
}

function stopBananaApiServer() {
  if (bananaApiProcess && !bananaApiProcess.killed) {
    bananaApiProcess.stdout?.unpipe(bananaApiLogStream);
    bananaApiProcess.stderr?.unpipe(bananaApiLogStream);
    bananaApiProcess.kill();
  }

  bananaApiProcess = null;
  closeBananaApiLogStream();
}

function createWindow() {
  const savedState = readWindowState();
  const defaults = { width: 1280, height: 800, x: undefined, y: undefined };
  const bounds = savedState || defaults;

  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#00000000',
    transparent: true,
    titleBarStyle: 'hidden',
    frame: false,
    icon: path.join(__dirname, 'assets', 'banana.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      sandbox: false, // needed for preload to use require()
    },
    show: false, // show after ready-to-show to avoid flash
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Save window state on close
  mainWindow.on('close', () => {
    const bounds = mainWindow.getBounds();
    writeWindowState(bounds);
  });

  // Decide which page to load
  if (configExists()) {
    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  } else {
    mainWindow.loadFile(path.join(__dirname, 'renderer', 'setup.html'));
  }
}

// ── IPC Handlers ──

ipcMain.handle('open-directory-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Workspace Directory',
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle('open-file-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    title: 'Attach Files',
    filters: [
      { name: 'Files and Images', extensions: ['txt', 'md', 'json', 'js', 'ts', 'tsx', 'jsx', 'py', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'css', 'html', 'xml', 'yaml', 'yml', 'png', 'jpg', 'jpeg', 'webp', 'gif'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) return [];
  return result.filePaths;
});

ipcMain.handle('read-studio-config', () => {
  return readConfig();
});

ipcMain.handle('write-studio-config', (_event, config) => {
  writeConfig(config);
  return true;
});

ipcMain.handle('get-home-path', () => {
  return os.homedir();
});

ipcMain.handle('check-banana-config', () => {
  const configPath = path.join(os.homedir(), '.config', 'banana-code', 'config.json');
  return fs.existsSync(configPath);
});

ipcMain.handle('read-token-file', () => {
  const tokenPath = path.join(os.homedir(), '.config', 'banana-code', 'token.json');
  try {
    const data = fs.readFileSync(tokenPath, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    return null;
  }
});

// Window controls
ipcMain.handle('window-minimize', () => {
  mainWindow?.minimize();
});

ipcMain.handle('window-maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.handle('window-close', () => {
  mainWindow?.close();
});

ipcMain.handle('window-is-maximized', () => {
  return mainWindow?.isMaximized() || false;
});

ipcMain.handle('get-platform', () => {
  return process.platform;
});

ipcMain.handle('clear-browser-data', async () => {
  const browserSession = session.fromPartition('persist:banana-browser');
  await browserSession.clearStorageData();
  await browserSession.clearCache();
  return true;
});

// Navigate renderer to a different page (used after setup wizard completes)
ipcMain.handle('navigate-to-main', () => {
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
});

// ── App Lifecycle ──

app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback, details) => {
    if (permission === 'media' && details?.mediaTypes?.includes('audio')) {
      callback(true);
      return;
    }
    callback(false);
  });

  if (process.platform === 'darwin') {
    await systemPreferences.askForMediaAccess('microphone').catch(() => false);
  }

  await startBananaApiServerIfAvailable();
  createWindow();
});

app.on('before-quit', () => {
  stopBananaApiServer();
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
