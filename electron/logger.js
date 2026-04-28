import fs from 'node:fs';
import path from 'node:path';
import { nowLocalIso, toLocalDateKey } from './localTime.js';

export function createLogger(logsDir, namespace = 'desktop') {
  fs.mkdirSync(logsDir, { recursive: true });

  const datePart = toLocalDateKey();
  const logFile = path.join(logsDir, `${namespace}-${datePart}.log`);

  const write = (level, args = []) => {
    const line = [
      nowLocalIso(),
      level.toUpperCase(),
      ...args.map((item) => {
        if (item instanceof Error) {
          return `${item.message}\n${item.stack || ''}`.trim();
        }

        if (typeof item === 'string') {
          return item;
        }

        try {
          return JSON.stringify(item);
        } catch {
          return String(item);
        }
      }),
    ].join(' ');

    fs.writeFileSync(logFile, `${line}\n`, { flag: 'a' });

    if (level === 'error') {
      console.error(...args);
      return;
    }

    if (level === 'warn') {
      console.warn(...args);
      return;
    }

    console.log(...args);
  };

  return {
    logFile,
    info: (...args) => write('info', args),
    warn: (...args) => write('warn', args),
    error: (...args) => write('error', args),
  };
}
