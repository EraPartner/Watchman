import { app, BrowserWindow, dialog, shell } from 'electron';
import * as path from 'path';
import { getFreePort } from './freePort';
import { startBackend, BackendHandle } from './backend';
import {
  registerFrontendScheme,
  handleFrontendProtocol,
  FRONTEND_ENTRY_URL,
} from './frontendProtocol';

let mainWindow: BrowserWindow | null = null;
let backend: BackendHandle | null = null;

registerFrontendScheme();

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  bootstrap();
}

function resolveFrontendRoot(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'frontend', 'dist');
  }
  return path.join(__dirname, '..', '..', 'frontend', 'dist');
}

async function createWindow(apiUrl: string): Promise<void> {
  const wsUrl = `${apiUrl.replace(/^http/, 'ws')}/ws`;

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0a0a0a',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      additionalArguments: [
        `--watchman-api-url=${apiUrl}`,
        `--watchman-ws-url=${wsUrl}`,
      ],
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const devUrl = process.env.WATCHMAN_DEV_URL;
  if (!app.isPackaged && devUrl) {
    await mainWindow.loadURL(devUrl);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    await mainWindow.loadURL(FRONTEND_ENTRY_URL);
  }
}

async function bootstrap(): Promise<void> {
  await app.whenReady();

  handleFrontendProtocol(resolveFrontendRoot());

  try {
    const port = await getFreePort();
    backend = await startBackend(port);
    const apiUrl = `http://${backend.host}:${backend.port}`;
    await createWindow(apiUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    dialog.showErrorBox('Watchman failed to start', message);
    app.exit(1);
    return;
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && backend) {
      createWindow(`http://${backend.host}:${backend.port}`).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        dialog.showErrorBox('Failed to reopen window', message);
      });
    }
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

let shuttingDown = false;
app.on('before-quit', (event) => {
  if (shuttingDown || !backend) {
    return;
  }
  shuttingDown = true;
  event.preventDefault();
  backend
    .stop()
    .catch(() => {
      /* swallow: best-effort shutdown */
    })
    .finally(() => {
      backend = null;
      app.quit();
    });
});
