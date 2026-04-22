import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');
const mockDataDir = path.join(projectRoot, 'data');

export const resolveMockDataPath = (filename) => {
  return path.join(mockDataDir, filename);
};

export const readJsonFile = (filename, fallbackValue = []) => {
  const filePath = resolveMockDataPath(filename);

  if (!fs.existsSync(filePath)) {
    return fallbackValue;
  }

  const rawText = fs.readFileSync(filePath, 'utf-8');

  if (!rawText.trim()) {
    return fallbackValue;
  }

  return JSON.parse(rawText);
};

export const writeJsonFile = (filename, payload) => {
  const filePath = resolveMockDataPath(filename);
  const dir = path.dirname(filePath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
  return filePath;
};