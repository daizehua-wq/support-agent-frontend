import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app } from 'electron';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function resolveProjectRoot() {
  if (!app.isPackaged) {
    return path.resolve(__dirname, '..');
  }

  return process.resourcesPath;
}

export function resolveResourcePath(...segments) {
  return path.resolve(resolveProjectRoot(), ...segments);
}

export function resolveElectronPath(...segments) {
  return path.resolve(__dirname, ...segments);
}

export function resolveAppPath(...segments) {
  return path.resolve(resolveProjectRoot(), ...segments);
}

export function resolveLogsDir() {
  if (!app.isPackaged) {
    return resolveAppPath('logs', 'desktop');
  }

  return path.join(app.getPath('userData'), 'logs');
}

export function resolveReferenceLibraryDir() {
  if (process.env.AP_REFERENCE_LIBRARY_PATH) {
    return path.resolve(process.env.AP_REFERENCE_LIBRARY_PATH);
  }

  if (process.platform === 'linux') {
    return path.join(app.getPath('home'), 'AP 2.0 资料库');
  }

  return path.join(app.getPath('documents'), 'AP 2.0 资料库');
}

export function resolveUserDataPath(...segments) {
  return path.join(app.getPath('userData'), ...segments);
}

export function resolveFrontendIndexPath() {
  if (!app.isPackaged) {
    return null;
  }

  return resolveResourcePath('dist', 'index.html');
}

export function resolveNodeRuntimePath() {
  if (!app.isPackaged) {
    return (
      process.env.AP_DESKTOP_NODE_PATH ||
      process.env.npm_node_execpath ||
      process.env.NODE ||
      (process.platform === 'win32' ? 'node.exe' : 'node')
    );
  }

  const executableName = process.platform === 'win32' ? 'node.exe' : 'node';
  return resolveResourcePath('runtime', executableName);
}
