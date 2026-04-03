import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 当前文件位于项目根目录下的 config/ 目录
const projectRoot = path.resolve(__dirname, '..');
const configDir = path.join(projectRoot, 'config');

const envFiles = [
  path.join(configDir, 'database.env'),
  path.join(configDir, 'model.env'),
];

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

const loadedFiles = [];

for (const filePath of envFiles) {
  if (!fs.existsSync(filePath)) {
    continue;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  parseEnvFile(content);
  loadedFiles.push(path.basename(filePath));
}

console.log(`[config] env loaded: ${loadedFiles.join(', ') || 'none'}`);