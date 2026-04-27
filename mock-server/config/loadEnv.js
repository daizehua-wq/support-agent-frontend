import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 这里从 mock-server/config 回到项目根目录，再进入 config/
const projectRoot = path.resolve(__dirname, '..', '..');
const configDir = path.join(projectRoot, 'config');
const desktopUserConfigDir = process.env.AP_DESKTOP_USER_DATA_DIR
  ? path.join(process.env.AP_DESKTOP_USER_DATA_DIR, 'config')
  : '';

const envFiles = [
  desktopUserConfigDir ? path.join(desktopUserConfigDir, 'database.env') : '',
  desktopUserConfigDir ? path.join(desktopUserConfigDir, 'model.env') : '',
  desktopUserConfigDir ? path.join(desktopUserConfigDir, 'python-runtime.env') : '',
  path.join(configDir, 'database.env'),
  path.join(configDir, 'model.env'),
  path.join(configDir, 'python-runtime.env'),
].filter(Boolean);

const parseEnvFile = (content) => {
  const lines = content.split('\n');

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) {
      continue;
    }

    const equalIndex = line.indexOf('=');
    if (equalIndex === -1) {
      continue;
    }

    const key = line.slice(0, equalIndex).trim();
    const value = line.slice(equalIndex + 1).trim();

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
};

for (const filePath of envFiles) {
  if (!fs.existsSync(filePath)) {
    continue;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  parseEnvFile(content);
}

console.log(
  '[config] env loaded from config/database.env, config/model.env and config/python-runtime.env (if exists)',
);
