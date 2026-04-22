import { spawn } from 'node:child_process';
import net from 'node:net';

const root = process.cwd();
const children = [];
const DEFAULT_HOST = '127.0.0.1';

const isPortBusy = (port, host = DEFAULT_HOST) =>
  new Promise((resolve) => {
    const socket = net.createConnection({ port, host });
    let settled = false;

    const finish = (busy) => {
      if (settled) {
        return;
      }

      settled = true;
      socket.destroy();
      resolve(busy);
    };

    socket.setTimeout(400);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', (error) => {
      if (
        error?.code === 'ECONNREFUSED' ||
        error?.code === 'EHOSTUNREACH' ||
        error?.code === 'ENOTFOUND' ||
        error?.code === 'ETIMEDOUT'
      ) {
        finish(false);
        return;
      }

      console.warn(
        `[dev:all] failed to probe ${host}:${port}, treating as unavailable: ${error?.message ?? error}`,
      );
      finish(false);
    });
  });

const spawnProcess = (name, command, args, { fatal = true } = {}) => {
  const child = spawn(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: false,
    env: process.env,
  });

  child.on('exit', (code, signal) => {
    const exitedBySignal = signal ? `signal ${signal}` : `code ${code ?? 0}`;
    console.log(`[dev:all] ${name} exited with ${exitedBySignal}`);

    if (!fatal) {
      return;
    }

    if (!shuttingDown) {
      shuttingDown = true;
      shutdown(code ?? 0);
    }
  });

  children.push(child);
  return child;
};

let shuttingDown = false;

const shutdown = (exitCode = 0) => {
  for (const child of children) {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  }

  setTimeout(() => {
    for (const child of children) {
      if (!child.killed) {
        child.kill('SIGKILL');
      }
    }

    process.exit(exitCode);
  }, 500);
};

process.on('SIGINT', () => {
  if (shuttingDown) return;
  shuttingDown = true;
  shutdown(0);
});

process.on('SIGTERM', () => {
  if (shuttingDown) return;
  shuttingDown = true;
  shutdown(0);
});

const start = async () => {
  const mockServerBusy = await isPortBusy(3001);
  if (mockServerBusy) {
    console.log('[dev:all] detected an existing backend on http://127.0.0.1:3001, skipping mock server startup');
  } else {
    console.log('[dev:all] starting mock server on http://127.0.0.1:3001');
    spawnProcess('mock-server', process.execPath, ['mock-server/server.js']);
  }

  const viteBusy = await isPortBusy(5173);
  if (viteBusy) {
    console.log('[dev:all] detected an existing Vite dev server on http://127.0.0.1:5173, skipping Vite startup');
    return;
  }

  console.log('[dev:all] starting vite dev server');
  spawnProcess('vite', process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'dev']);
};

start().catch((error) => {
  console.error('[dev:all] failed to start development services:', error);
  process.exit(1);
});
