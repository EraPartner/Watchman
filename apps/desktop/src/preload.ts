import { contextBridge, ipcRenderer } from 'electron';

function readArg(prefix: string): string {
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : '';
}

const apiUrl = readArg('--watchman-api-url=');
const wsUrl = readArg('--watchman-ws-url=');

contextBridge.exposeInMainWorld('__WATCHMAN__', {
  apiUrl,
  wsUrl,
  isDesktop: true,
  getApiUrl: (): Promise<string> => ipcRenderer.invoke('watchman:getApiUrl'),
  saveApiUrl: (url: string): Promise<boolean> =>
    ipcRenderer.invoke('watchman:saveApiUrl', url),
  reload: (): Promise<boolean> => ipcRenderer.invoke('watchman:reload'),
});
