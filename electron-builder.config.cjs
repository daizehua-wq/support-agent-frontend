const fs = require('node:fs');

const nodeRuntimePath = process.env.AP_DESKTOP_NODE_SOURCE || fs.realpathSync(process.execPath);
const electronVersion = require('electron/package.json').version;

const commonResourceExcludes = [
  '!**/.git/**',
  '!**/.git',
  '!**/.gitmodules',
  '!**/.gitignore',
  '!**/.gitattributes',
  '!**/.github/**',
  '!**/.svn/**',
  '!**/.hg/**',
  '!**/.DS_Store',
  '!**/.cache/**',
  '!**/cache/**',
  '!**/coverage/**',
  '!coverage/**',
  '!**/.nyc_output/**',
  '!**/test-results/**',
  '!test-results/**',
  '!test-evidence/**',
  '!mock-server/test-results/**',
  '!**/.pytest_cache/**',
  '!.pytest_cache/**',
  '!**/__pycache__/**',
  '!**/*.pyc',
  '!**/*.pyo',
  '!**/*.log',
  '!**/*.tmp',
  '!**/*.temp',
  '!**/*.bak',
  '!**/*.swp',
];

const localEnvExcludes = [
  '!.env',
  '!.env.*',
  '!config/model.env',
  '!config/*.env',
  'config/*.env.example',
];

const runtimeDataExcludes = [
  '!data/secretVault.json',
  '!data/*.jsonl',
  '!data/*.db',
  '!data/*.sqlite',
  '!data/*.sqlite3',
  '!data/*Log*.json',
  '!data/*Audit*.json',
  '!data/*Metrics*.json',
  '!data/opsRuntimeDashboard.json',
  '!data/externalProviderCallLog.jsonl',
  '!mock-server/data/secretVault.json',
  '!mock-server/data/*.jsonl',
  '!mock-server/data/*.db',
  '!mock-server/data/*.sqlite',
  '!mock-server/data/*.sqlite3',
  '!mock-server/data/*Log*.json',
  '!mock-server/data/*Audit*.json',
  '!mock-server/data/*Metrics*.json',
  '!secretVault.json',
  '!*.jsonl',
  '!*.db',
  '!*.sqlite',
  '!*.sqlite3',
  '!*Log*.json',
  '!*Audit*.json',
  '!*Metrics*.json',
  '!opsRuntimeDashboard.json',
  '!externalProviderCallLog.jsonl',
];

const modelResourceExcludes = [
  '!models/*.gguf',
  '!models/*.bin',
  '!models/*.safetensors',
  '!*.gguf',
  '!*.bin',
  '!*.safetensors',
];

const testResourceExcludes = [
  '!**/__tests__/**',
  '!**/__mocks__/**',
  '!**/test/**',
  '!**/tests/**',
  '!**/spec/**',
  '!**/specs/**',
  '!**/*.test.*',
  '!**/*.spec.*',
];

const desktopResourceExcludes = [
  ...commonResourceExcludes,
  ...testResourceExcludes,
  ...localEnvExcludes,
  ...runtimeDataExcludes,
  ...modelResourceExcludes,
];

const nodeModuleRuntimeExcludes = [
  ...desktopResourceExcludes,
  '!node-llama-cpp/llama/llama.cpp/.git/**',
  '!node-llama-cpp/llama/llama.cpp/.git',
  '!electron/**',
  '!electron-builder/**',
  '!@electron/**',
  '!@electron-forge/**',
  '!@types/**',
  '!typescript/**',
  '!vite/**',
  '!@vitejs/**',
  '!eslint/**',
  '!@eslint/**',
  '!@eslint-community/**',
  '!eslint-plugin-*',
  '!typescript-eslint/**',
];

module.exports = {
  productName: 'AP 2.0',
  appId: 'com.ap.agent-platform',
  electronVersion,
  electronDist: 'node_modules/electron/dist',
  directories: {
    output: 'release',
  },
  files: [
    'electron/**/*',
    'package.json',
    ...desktopResourceExcludes,
  ],
  asar: true,
  npmRebuild: false,
  buildDependenciesFromSource: false,
  asarUnpack: [
    'node_modules/node-llama-cpp/**/*',
    'node_modules/**/*.node',
  ],
  extraResources: [
    {
      from: 'dist',
      to: 'dist',
      filter: [
        '**/*',
        ...desktopResourceExcludes,
      ],
    },
    {
      from: 'mock-server',
      to: 'mock-server',
      filter: [
        '**/*',
        ...desktopResourceExcludes,
      ],
    },
    {
      from: 'api-gateway',
      to: 'api-gateway',
      filter: [
        '**/*',
        ...desktopResourceExcludes,
      ],
    },
    {
      from: 'platform-manager',
      to: 'platform-manager',
      filter: [
        '**/*',
        ...desktopResourceExcludes,
      ],
    },
    {
      from: 'data',
      to: 'data',
      filter: [
        '**/*',
        ...desktopResourceExcludes,
      ],
    },
    {
      from: 'config',
      to: 'config',
      filter: ['*.env.example'],
    },
    {
      from: 'models',
      to: 'models',
      filter: [
        '.gitkeep',
        ...modelResourceExcludes,
      ],
    },
    {
      from: 'node_modules',
      to: 'node_modules',
      filter: [
        '**/*',
        ...nodeModuleRuntimeExcludes,
      ],
    },
    {
      from: nodeRuntimePath,
      to: 'runtime/node',
    },
  ],
  mac: {
    target: [
      {
        target: 'dmg',
        arch: ['arm64'],
      },
      {
        target: 'dir',
        arch: ['arm64'],
      },
    ],
    identity: null,
    hardenedRuntime: false,
  },
  dmg: {
    sign: false,
  },
};
