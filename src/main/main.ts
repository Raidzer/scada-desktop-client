import path from 'node:path';
import {
  app,
  BrowserWindow,
  dialog,
  Menu,
  nativeImage,
  Tray,
  type MenuItemConstructorOptions,
} from 'electron';
import { GrpcScadaTransport } from './scada/grpc-scada-transport';
import { ScadaGateway } from './scada/scada-gateway';
import { registerIpcHandlers } from './ipc';
import { JsonSettingsRepository } from './settings-repository';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let gateway: ScadaGateway | null = null;
let removeIpcHandlers: (() => void) | null = null;
let isQuitting = false;

const TRAY_ICON_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAGmSURBVFhHYxBSNPo/kJgBXYDeeNQBow4g2QGipu4YYpRgkh2g1L0AQ4wSTJIDRLRt/2sfvvVf3DUcQ45cTJIDpCNzwA6QL2rDkCMXk+QApbbZYAeoLdmFIUcuJskBmjvPgx0AwtRKjEQ7ABTvMMtBWDajGlWNmvl/Ca8YDH2EMNEOAMU7sgNUZ21EkZf0T/yvueU0OKGi68WHiXaA2vytKA7Q3ncVxTJY+gDR6HrxYaIcIGLgiGo5FINyBViNmjlK+gCFBroZuDBRDpCOK8SwHOxbaKEEshBZnJSowHAAyDCN9UcxLEO2FG7RzvNg38OCnxAGmQvyDF4H4LMchEG5QX3VATgflPKRg58g3ncVvwPkchowNUEx2MegHFHRAxcDFUowNsjxhEJDsXEqfgcQg0G+RjcYhEEOQ1dLCJPlABAGJTR0B5BTSZHtAPSgBgU/uhpiMNkOkAxJwxu3xGKyHQDKfqAUDXMAOfUACJPvAEWj/yoTloEtB6UHdDliMUUOgJWQ5AY/CFPkAFgdQW7wgzBFDgBhShupFDuA0pYRxQ6gFA+4AwDlilN/wUJjPAAAAABJRU5ErkJggg==';

startApplication();

function startApplication(): void {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.raidzer.scada-desktop');
  }

  const hasSingleInstanceLock = app.requestSingleInstanceLock();
  if (!hasSingleInstanceLock) {
    app.quit();
    return;
  }

  app.on('second-instance', () => showMainWindow());
  app.on('before-quit', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      void quitApplication();
    }
  });
  app.on('window-all-closed', () => {
    // Closing the window hides it to tray; the gRPC gateway remains active.
  });
  app.on('activate', () => {
    if (mainWindow) showMainWindow();
    else void createMainWindow();
  });

  void app.whenReady().then(async () => {
    const protoPath = path.join(
      app.isPackaged ? process.resourcesPath : app.getAppPath(),
      'proto',
      'user.proto',
    );
    gateway = new ScadaGateway(
      new JsonSettingsRepository(app.getPath('userData')),
      (callbacks) => new GrpcScadaTransport(protoPath, callbacks),
    );
    await gateway.initialize();
    removeIpcHandlers = registerIpcHandlers(gateway, () => mainWindow);
    await createMainWindow();
    createTray();
    gateway.onConnectionChanged(() => updateTrayMenu());
  }).catch((error: unknown) => {
    dialog.showErrorBox('SCADA Desktop не запущен', toErrorMessage(error));
    app.quit();
  });
}

async function createMainWindow(): Promise<void> {
  if (mainWindow && !mainWindow.isDestroyed()) {
    showMainWindow();
    return;
  }

  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0B111B',
    title: 'SCADA Desktop',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      devTools: !app.isPackaged,
    },
  });
  mainWindow = window;

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, navigationUrl) => {
    if (navigationUrl !== window.webContents.getURL()) event.preventDefault();
  });
  window.once('ready-to-show', () => window.show());
  window.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      window.hide();
    }
  });
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null;
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    await loadDevelopmentUrl(window, MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    await window.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }
}

async function loadDevelopmentUrl(window: BrowserWindow, url: string): Promise<void> {
  let lastError: unknown = new Error('Renderer Vite server is not ready.');
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      await window.loadURL(url);
      return;
    } catch (error) {
      lastError = error;
      if (window.isDestroyed()) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw lastError;
}

function createTray(): void {
  if (tray) return;
  tray = new Tray(createTrayImage());
  tray.setToolTip('SCADA Desktop');
  tray.on('click', () => showMainWindow());
  updateTrayMenu();
}

function updateTrayMenu(): void {
  if (!tray) return;
  const connection = gateway?.getBootstrap().connection;
  const connected = connection?.phase === 'connected';
  const template: MenuItemConstructorOptions[] = [
    { label: 'Открыть SCADA Desktop', click: () => showMainWindow() },
    {
      label: connected ? `Подключено: ${connection.address}` : 'Нет подключения',
      enabled: false,
    },
    {
      label: 'Отключиться',
      enabled: Boolean(connection && connection.phase !== 'idle'),
      click: () => void gateway?.disconnect(),
    },
    { type: 'separator' },
    { label: 'Выход', click: () => void quitApplication() },
  ];
  tray.setContextMenu(Menu.buildFromTemplate(template));
}

function showMainWindow(): void {
  const window = mainWindow;
  if (!window || window.isDestroyed()) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}

async function quitApplication(): Promise<void> {
  if (isQuitting) return;
  isQuitting = true;
  removeIpcHandlers?.();
  removeIpcHandlers = null;

  try {
    await gateway?.disconnect();
  } finally {
    tray?.destroy();
    tray = null;
    mainWindow?.destroy();
    mainWindow = null;
    app.quit();
  }
}

function createTrayImage() {
  const image = nativeImage
    .createFromBuffer(Buffer.from(TRAY_ICON_PNG_BASE64, 'base64'))
    .resize({ width: 16, height: 16 });
  if (image.isEmpty()) throw new Error('Не удалось загрузить PNG-иконку системного трея.');
  return image;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
