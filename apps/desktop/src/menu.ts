import {
  app,
  BrowserWindow,
  Menu,
  shell,
  type MenuItemConstructorOptions,
} from "electron";
import { openLogs } from "./logs";

type WindowGetter = () => BrowserWindow | null;

// Mirrors the frontend TopNav nav items; index drives the ⌘1..⌘5 accelerators.
const GO_ROUTES: ReadonlyArray<{ label: string; url: string }> = [
  { label: "Dashboard", url: "/" },
  { label: "Services", url: "/settings/services" },
  { label: "Profiles", url: "/settings/profiles" },
  { label: "Audit", url: "/settings/audit" },
  { label: "Backup", url: "/settings/backup" },
];

const GITHUB_URL = "https://github.com/EraPartner/Watchman";

function makeSender(getWindow: WindowGetter) {
  return (action: string, payload?: unknown) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send("menu:action", { action, payload });
    }
  };
}

export function setupApplicationMenu(getWindow: WindowGetter): void {
  const isMac = process.platform === "darwin";
  const send = makeSender(getWindow);

  const appMenu: MenuItemConstructorOptions[] = isMac
    ? [{ role: "appMenu" }]
    : [];
  const devTools: MenuItemConstructorOptions[] = app.isPackaged
    ? []
    : [{ role: "toggleDevTools" }];

  const template: MenuItemConstructorOptions[] = [
    ...appMenu,
    { role: "fileMenu" },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        ...devTools,
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Go",
      submenu: GO_ROUTES.map((route, index) => ({
        label: route.label,
        accelerator: `CmdOrCtrl+${index + 1}`,
        click: () => send("navigate", route.url),
      })),
    },
    { role: "windowMenu" },
    {
      role: "help",
      submenu: [
        { label: "Open Logs", click: () => void openLogs() },
        {
          label: "Watchman on GitHub",
          click: () => void shell.openExternal(GITHUB_URL),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

export function setupDockMenu(getWindow: WindowGetter): void {
  if (process.platform !== "darwin" || !app.dock) return;
  const send = makeSender(getWindow);
  app.dock.setMenu(
    Menu.buildFromTemplate([
      { label: "Dashboard", click: () => send("navigate", "/") },
      {
        label: "Services",
        click: () => send("navigate", "/settings/services"),
      },
    ])
  );
}
