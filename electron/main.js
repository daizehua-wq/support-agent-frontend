import path from 'node:path';
import { app, BrowserWindow, ipcMain } from 'electron';
import { ServiceManager } from './serviceManager.js';
import { createLogger } from './logger.js';
import {
  resolveElectronPath,
  resolveFrontendIndexPath,
  resolveLogsDir,
  resolveNodeRuntimePath,
  resolveProjectRoot,
  resolveReferenceLibraryDir,
  resolveUserDataPath,
} from './pathResolver.js';

let mainWindow = null;
let serviceManager = null;
let logger = null;
let quitting = false;
let servicesStopped = false;
let shutdownPromise = null;

if (app.isPackaged) {
  app.setPath('userData', path.join(app.getPath('appData'), 'AP 2.0'));
}

async function stopAllServices(reason = 'shutdown') {
  if (servicesStopped) return;

  try {
    await serviceManager?.stopAllServices(reason);
  } catch (error) {
    logger?.error('[desktop] failed to stop services', error);
  } finally {
    servicesStopped = true;
  }
}

async function shutdown(exitCode = 0, reason = 'shutdown') {
  if (shutdownPromise) return shutdownPromise;
  quitting = true;

  shutdownPromise = (async () => {
    await stopAllServices(reason);
    app.exit(exitCode);
  })();

  return shutdownPromise;
}

function buildLoadingHtml(message = 'AP 2.0 正在启动本地服务...') {
  return `<!doctype html>
  <html lang="zh-CN">
    <head>
      <meta charset="utf-8" />
      <title>AP 2.0 Desktop</title>
      <style>
        html, body {
          margin: 0;
          height: 100%;
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif;
          background: #f5f7fb;
          color: #111827;
        }
        body {
          display: grid;
          place-items: center;
        }
        main {
          width: min(520px, calc(100vw - 48px));
          padding: 32px;
          border-radius: 28px;
          background: rgba(255, 255, 255, 0.82);
          box-shadow: 0 24px 80px rgba(15, 23, 42, 0.12);
          backdrop-filter: blur(24px);
        }
        h1 {
          margin: 0 0 10px;
          font-size: 26px;
        }
        p {
          margin: 0;
          color: #64748b;
          line-height: 1.7;
        }
        .pulse {
          width: 12px;
          height: 12px;
          margin-bottom: 20px;
          border-radius: 999px;
          background: #22c55e;
          box-shadow: 0 0 0 rgba(34, 197, 94, 0.4);
          animation: pulse 1.4s infinite;
        }
        @keyframes pulse {
          0% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.36); }
          70% { box-shadow: 0 0 0 18px rgba(34, 197, 94, 0); }
          100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
        }
      </style>
    </head>
    <body>
      <main>
        <div class="pulse"></div>
        <h1>AP 2.0 Desktop</h1>
        <p>${message}</p>
      </main>
    </body>
  </html>`;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 1100,
    minHeight: 720,
    title: 'AP 2.0 Desktop',
    backgroundColor: '#f5f7fb',
    show: false,
    webPreferences: {
      preload: resolveElectronPath('preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('close', (event) => {
    if (quitting) return;

    logger?.info('[desktop] main window close requested');
    event.preventDefault();
    shutdown(0, 'window-close');
  });

  mainWindow.on('closed', () => {
    logger?.info('[desktop] main window closed');
    mainWindow = null;
  });

  return mainWindow;
}

async function loadApp() {
  const win = createWindow();
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(buildLoadingHtml())}`);

  const projectRoot = resolveProjectRoot();
  logger = createLogger(resolveLogsDir(), 'ap-desktop');
  logger.info('[desktop] project root', projectRoot);
  logger.info('[desktop] runtime mode', {
    packaged: app.isPackaged,
    userData: app.getPath('userData'),
  });

  serviceManager = new ServiceManager({
    projectRoot,
    logsDir: resolveLogsDir(),
    logger,
    nodeCommand: resolveNodeRuntimePath(),
    userDataDir: resolveUserDataPath(),
    referenceLibraryDir: resolveReferenceLibraryDir(),
    frontendIndexPath: resolveFrontendIndexPath(),
    packaged: app.isPackaged,
  });

  try {
    const records = await serviceManager.startAll();
    logger.info('[desktop] services ready', records);

    await win.loadURL(serviceManager.getHomeUrl());
    logger.info('[desktop] health summary', await serviceManager.getHealthSummary());

    if (process.env.ELECTRON_OPEN_DEVTOOLS === 'true') {
      win.webContents.openDevTools({ mode: 'detach' });
    }
  } catch (error) {
    logger.error('[desktop] failed to start AP 2.0 Desktop', error);
    await stopAllServices('startup-failure');
    await win.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(
        buildLoadingHtml(`启动失败：${error.message || error}。请查看 logs/desktop 下的日志。`),
      )}`,
    );
  }
}

ipcMain.handle('ap-desktop:get-service-status', async () => {
  if (!serviceManager) {
    return {
      success: false,
      message: 'service manager not initialized',
    };
  }

  return {
    success: true,
    records: serviceManager.getRecords(),
    health: await serviceManager.getHealthSummary(),
  };
});

app.whenReady().then(async () => {
  app.setName('AP 2.0 Desktop');
  await loadApp();

  app.on('activate', () => {
    if (quitting) return;

    if (BrowserWindow.getAllWindows().length === 0) {
      loadApp().catch((error) => {
        logger?.error('[desktop] failed to activate window', error);
      });
    }
  });
});

app.on('before-quit', async (event) => {
  if (servicesStopped) return;

  event.preventDefault();
  await shutdown(0, 'before-quit');
});

app.on('will-quit', async (event) => {
  if (servicesStopped) return;

  event.preventDefault();
  await shutdown(0, 'will-quit');
});

app.on('window-all-closed', () => {
  logger?.info('[desktop] all windows closed');
  shutdown(0, 'window-all-closed');
});

process.on('uncaughtException', (error) => {
  logger?.error('[desktop] uncaught exception', error);
});

process.on('unhandledRejection', (error) => {
  logger?.error('[desktop] unhandled rejection', error);
});

process.once('SIGINT', () => {
  shutdown(0, 'SIGINT');
});

process.once('SIGTERM', () => {
  shutdown(0, 'SIGTERM');
});
