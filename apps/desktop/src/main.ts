import { app, BrowserWindow, ipcMain, shell } from 'electron';
import * as path from 'path';
import {
  registerFrontendScheme,
  handleFrontendProtocol,
  FRONTEND_ENTRY_URL,
} from './frontendProtocol';
import { load as loadClientConfig, save as saveClientConfig } from './clientConfig';

let mainWindow: BrowserWindow | null = null;

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

function wsUrlFor(apiUrl: string): string {
  if (!apiUrl) return '';
  return `${apiUrl.replace(/^http/, 'ws')}/ws`;
}

async function createWindow(apiUrl: string): Promise<void> {
  const wsUrl = wsUrlFor(apiUrl);

  mainWindow = new BrowserWindow({
    title: 'Watchman',
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

async function reloadWindow(): Promise<void> {
  if (!mainWindow) return;
  const config = loadClientConfig();
  const apiUrl = config.apiUrl ?? '';
  mainWindow.close();
  await createWindow(apiUrl);
}

function registerIpc(): void {
  ipcMain.handle('watchman:getApiUrl', () => {
    return loadClientConfig().apiUrl ?? '';
  });

  ipcMain.handle('watchman:saveApiUrl', (_event, url: unknown) => {
    const next = typeof url === 'string' ? url.trim() : '';
    saveClientConfig({ apiUrl: next || undefined });
    return true;
  });

  ipcMain.handle('watchman:reload', async () => {
    await reloadWindow();
    return true;
  });
}

async function bootstrap(): Promise<void> {
  await app.whenReady();

  handleFrontendProtocol(resolveFrontendRoot());
  registerIpc();

  const config = loadClientConfig();
  const apiUrl = config.apiUrl ?? '';
  await createWindow(apiUrl);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const current = loadClientConfig().apiUrl ?? '';
      void createWindow(current);
    }
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
