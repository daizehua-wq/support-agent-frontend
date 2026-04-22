import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { readJsonFile, resolveMockDataPath, writeJsonFile } from './jsonDataService.js';

const SECRET_VAULT_CONTRACT_VERSION = 'secret-vault/v1';
const SECRET_VAULT_FILE = 'secretVault.json';
const SECRET_REF_PREFIX = 'secret://';
const SECRET_CIPHER_VERSION = 'v1';
const KEY_MANAGEMENT_PROVIDER_FILE = 'encrypted-file-vault';
const KEY_MANAGEMENT_PROVIDER_HASHICORP = 'hashicorp-vault';
const KEY_MANAGEMENT_PROVIDER_CLOUD_KMS = 'cloud-kms';

export const SUPPORTED_KEY_MANAGEMENT_PROVIDERS = Object.freeze([
  {
    value: KEY_MANAGEMENT_PROVIDER_FILE,
    label: 'Encrypted File Vault',
    integrationStatus: 'ready',
  },
  {
    value: KEY_MANAGEMENT_PROVIDER_HASHICORP,
    label: 'HashiCorp Vault',
    integrationStatus: 'planned',
  },
  {
    value: KEY_MANAGEMENT_PROVIDER_CLOUD_KMS,
    label: 'Cloud KMS',
    integrationStatus: 'planned',
  },
]);

export const DEFAULT_KEY_MANAGEMENT_PROVIDER_CONFIG = Object.freeze({
  encryptedFileVault: {
    vaultFile: SECRET_VAULT_FILE,
  },
  hashicorpVault: {
    endpointEnvVar: 'SETTINGS_HASHICORP_VAULT_ADDR',
    tokenEnvVar: 'SETTINGS_HASHICORP_VAULT_TOKEN',
    namespaceEnvVar: 'SETTINGS_HASHICORP_VAULT_NAMESPACE',
    mountPath: 'secret',
    secretPathPrefix: 'sales-support-agent',
  },
  cloudKms: {
    vendor: 'aws-kms',
    credentialsEnvVar: 'SETTINGS_CLOUD_KMS_CREDENTIALS',
    keyIdEnvVar: 'SETTINGS_CLOUD_KMS_KEY_ID',
    regionEnvVar: 'SETTINGS_CLOUD_KMS_REGION',
    secretPathPrefix: 'sales-support-agent',
  },
});

const DEFAULT_KEY_MANAGEMENT_POLICY = Object.freeze({
  enabled: true,
  provider: KEY_MANAGEMENT_PROVIDER_FILE,
  strict: false,
  allowPlaintextWhenVaultUnavailable: true,
  masterKeyEnvVar: 'SETTINGS_SECRET_MASTER_KEY',
  rotateAfterDays: 90,
  providerConfig: JSON.parse(JSON.stringify(DEFAULT_KEY_MANAGEMENT_PROVIDER_CONFIG)),
});

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const normalizeText = (value = '') => String(value || '').trim();

const nowIso = () => new Date().toISOString();

const cloneRecord = (value) => JSON.parse(JSON.stringify(value));

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const normalizeKeyManagementProviderName = (value = '') => {
  const normalized = normalizeText(value).toLowerCase();
  const supportedProvider = SUPPORTED_KEY_MANAGEMENT_PROVIDERS.find(
    (item) => item.value === normalized,
  );
  return supportedProvider?.value || KEY_MANAGEMENT_PROVIDER_FILE;
};

export const normalizeKeyManagementProviderConfig = (providerConfig = {}) => {
  const rawConfig = isPlainObject(providerConfig) ? providerConfig : {};
  const fileConfig = isPlainObject(rawConfig.encryptedFileVault)
    ? rawConfig.encryptedFileVault
    : {};
  const hashicorpConfig = isPlainObject(rawConfig.hashicorpVault)
    ? rawConfig.hashicorpVault
    : {};
  const cloudKmsConfig = isPlainObject(rawConfig.cloudKms) ? rawConfig.cloudKms : {};

  return {
    encryptedFileVault: {
      vaultFile:
        normalizeText(fileConfig.vaultFile) ||
        DEFAULT_KEY_MANAGEMENT_PROVIDER_CONFIG.encryptedFileVault.vaultFile,
    },
    hashicorpVault: {
      endpointEnvVar:
        normalizeText(hashicorpConfig.endpointEnvVar) ||
        DEFAULT_KEY_MANAGEMENT_PROVIDER_CONFIG.hashicorpVault.endpointEnvVar,
      tokenEnvVar:
        normalizeText(hashicorpConfig.tokenEnvVar) ||
        DEFAULT_KEY_MANAGEMENT_PROVIDER_CONFIG.hashicorpVault.tokenEnvVar,
      namespaceEnvVar:
        normalizeText(hashicorpConfig.namespaceEnvVar) ||
        DEFAULT_KEY_MANAGEMENT_PROVIDER_CONFIG.hashicorpVault.namespaceEnvVar,
      mountPath:
        normalizeText(hashicorpConfig.mountPath) ||
        DEFAULT_KEY_MANAGEMENT_PROVIDER_CONFIG.hashicorpVault.mountPath,
      secretPathPrefix:
        normalizeText(hashicorpConfig.secretPathPrefix) ||
        DEFAULT_KEY_MANAGEMENT_PROVIDER_CONFIG.hashicorpVault.secretPathPrefix,
    },
    cloudKms: {
      vendor:
        normalizeText(cloudKmsConfig.vendor) ||
        DEFAULT_KEY_MANAGEMENT_PROVIDER_CONFIG.cloudKms.vendor,
      credentialsEnvVar:
        normalizeText(cloudKmsConfig.credentialsEnvVar) ||
        DEFAULT_KEY_MANAGEMENT_PROVIDER_CONFIG.cloudKms.credentialsEnvVar,
      keyIdEnvVar:
        normalizeText(cloudKmsConfig.keyIdEnvVar) ||
        DEFAULT_KEY_MANAGEMENT_PROVIDER_CONFIG.cloudKms.keyIdEnvVar,
      regionEnvVar:
        normalizeText(cloudKmsConfig.regionEnvVar) ||
        DEFAULT_KEY_MANAGEMENT_PROVIDER_CONFIG.cloudKms.regionEnvVar,
      secretPathPrefix:
        normalizeText(cloudKmsConfig.secretPathPrefix) ||
        DEFAULT_KEY_MANAGEMENT_PROVIDER_CONFIG.cloudKms.secretPathPrefix,
    },
  };
};

const resolveEncryptedVaultFile = (providerConfig = {}) =>
  normalizeText(providerConfig?.encryptedFileVault?.vaultFile) || SECRET_VAULT_FILE;

const readSecretVault = (vaultFile = SECRET_VAULT_FILE) => {
  const payload = readJsonFile(vaultFile, {
    contractVersion: SECRET_VAULT_CONTRACT_VERSION,
    updatedAt: nowIso(),
    items: {},
  });

  const items = isPlainObject(payload?.items) ? payload.items : {};

  return {
    contractVersion: SECRET_VAULT_CONTRACT_VERSION,
    updatedAt: normalizeText(payload?.updatedAt) || nowIso(),
    items,
  };
};

const writeSecretVault = (vault = {}, vaultFile = SECRET_VAULT_FILE) => {
  const normalizedVault = {
    contractVersion: SECRET_VAULT_CONTRACT_VERSION,
    updatedAt: nowIso(),
    items: isPlainObject(vault.items) ? vault.items : {},
  };

  writeJsonFile(vaultFile, normalizedVault);
  return normalizedVault;
};

const buildDefaultSecuritySettings = () => ({
  security: {
    keyManagement: {
      ...DEFAULT_KEY_MANAGEMENT_POLICY,
      providerConfig: JSON.parse(JSON.stringify(DEFAULT_KEY_MANAGEMENT_PROVIDER_CONFIG)),
    },
  },
});

const resolveGovernanceSecurity = (settings = {}) => {
  if (!isPlainObject(settings?.governance)) {
    return buildDefaultSecuritySettings().security;
  }

  const securitySettings = isPlainObject(settings.governance.security)
    ? settings.governance.security
    : {};

  return {
    ...buildDefaultSecuritySettings().security,
    ...securitySettings,
    keyManagement: {
      ...DEFAULT_KEY_MANAGEMENT_POLICY,
      ...(isPlainObject(securitySettings.keyManagement) ? securitySettings.keyManagement : {}),
    },
  };
};

export const resolveKeyManagementPolicy = (settings = {}) => {
  const security = resolveGovernanceSecurity(settings);
  const keyManagement = isPlainObject(security.keyManagement)
    ? security.keyManagement
    : {};

  return {
    enabled:
      keyManagement.enabled === undefined
        ? DEFAULT_KEY_MANAGEMENT_POLICY.enabled === true
        : keyManagement.enabled === true,
    provider: normalizeKeyManagementProviderName(
      normalizeText(keyManagement.provider) || DEFAULT_KEY_MANAGEMENT_POLICY.provider,
    ),
    strict:
      keyManagement.strict === undefined
        ? DEFAULT_KEY_MANAGEMENT_POLICY.strict === true
        : keyManagement.strict === true,
    allowPlaintextWhenVaultUnavailable:
      keyManagement.allowPlaintextWhenVaultUnavailable === undefined
        ? DEFAULT_KEY_MANAGEMENT_POLICY.allowPlaintextWhenVaultUnavailable === true
        : keyManagement.allowPlaintextWhenVaultUnavailable === true,
    masterKeyEnvVar:
      normalizeText(keyManagement.masterKeyEnvVar) ||
      DEFAULT_KEY_MANAGEMENT_POLICY.masterKeyEnvVar,
    rotateAfterDays: Math.max(
      1,
      toNumber(keyManagement.rotateAfterDays, DEFAULT_KEY_MANAGEMENT_POLICY.rotateAfterDays),
    ),
    providerConfig: normalizeKeyManagementProviderConfig(keyManagement.providerConfig),
  };
};

const buildUnavailableProviderMessage = (provider = '') =>
  `key management provider ${normalizeText(provider) || KEY_MANAGEMENT_PROVIDER_FILE} is not implemented yet`;

const buildProviderConfigSummary = (policy = {}) => {
  const providerConfig = normalizeKeyManagementProviderConfig(policy.providerConfig);

  if (policy.provider === KEY_MANAGEMENT_PROVIDER_HASHICORP) {
    return {
      endpointEnvVar: providerConfig.hashicorpVault.endpointEnvVar,
      tokenEnvVar: providerConfig.hashicorpVault.tokenEnvVar,
      namespaceEnvVar: providerConfig.hashicorpVault.namespaceEnvVar,
      mountPath: providerConfig.hashicorpVault.mountPath,
      secretPathPrefix: providerConfig.hashicorpVault.secretPathPrefix,
    };
  }

  if (policy.provider === KEY_MANAGEMENT_PROVIDER_CLOUD_KMS) {
    return {
      vendor: providerConfig.cloudKms.vendor,
      credentialsEnvVar: providerConfig.cloudKms.credentialsEnvVar,
      keyIdEnvVar: providerConfig.cloudKms.keyIdEnvVar,
      regionEnvVar: providerConfig.cloudKms.regionEnvVar,
      secretPathPrefix: providerConfig.cloudKms.secretPathPrefix,
    };
  }

  const vaultFile = resolveEncryptedVaultFile(providerConfig);
  return {
    vaultFile: resolveMockDataPath(vaultFile),
  };
};

const createEncryptedFileVaultSession = (policy = {}) => {
  const masterKey = resolveMasterKey(policy);
  const providerConfig = normalizeKeyManagementProviderConfig(policy.providerConfig);
  const vaultFile = resolveEncryptedVaultFile(providerConfig);
  const vault = readSecretVault(vaultFile);
  let dirty = false;

  return {
    provider: KEY_MANAGEMENT_PROVIDER_FILE,
    integrationStatus: 'ready',
    canWrite: Boolean(masterKey),
    canRead: Boolean(masterKey),
    allowPlaintextFallback: true,
    buildWriteUnavailableError: () =>
      new Error(`key management requires env ${policy.masterKeyEnvVar}, but it is empty`),
    buildReadUnavailableError: () =>
      new Error(`secret vault requires env ${policy.masterKeyEnvVar}, but it is empty`),
    persistSecret: ({ pathKey = '', value = '' } = {}) => {
      const normalizedValue = String(value ?? '');
      const secretId = buildStableSecretId(pathKey);
      const cipherText = encryptSecretText({
        plaintext: normalizedValue,
        masterKey,
      });
      const currentRecord = isPlainObject(vault.items[secretId]) ? vault.items[secretId] : null;

      vault.items[secretId] = {
        contractVersion: SECRET_VAULT_CONTRACT_VERSION,
        secretId,
        pathKey,
        provider: KEY_MANAGEMENT_PROVIDER_FILE,
        cipherText,
        createdAt: currentRecord?.createdAt || nowIso(),
        updatedAt: nowIso(),
        rotateAfterDays: policy.rotateAfterDays,
      };
      dirty = true;
      return buildSecretRef(secretId);
    },
    resolveSecretRef: (secretRef = '') => {
      const secretId = parseSecretRef(secretRef);
      const secretRecord = isPlainObject(vault.items[secretId]) ? vault.items[secretId] : null;

      if (!secretRecord) {
        return {
          found: false,
          plaintext: '',
        };
      }

      const plaintext = decryptSecretText({
        cipherText: secretRecord.cipherText,
        masterKey,
      });

      return {
        found: true,
        plaintext,
      };
    },
    flush: () => {
      if (dirty) {
        writeSecretVault(vault, vaultFile);
      }
    },
    getSummary: () => ({
      contractVersion: SECRET_VAULT_CONTRACT_VERSION,
      provider: KEY_MANAGEMENT_PROVIDER_FILE,
      integrationStatus: 'ready',
      hasMasterKey: Boolean(masterKey),
      itemCount: Object.keys(vault.items || {}).length,
      updatedAt: vault.updatedAt,
      vaultFile: resolveMockDataPath(vaultFile),
      providerConfigSummary: buildProviderConfigSummary({
        ...policy,
        provider: KEY_MANAGEMENT_PROVIDER_FILE,
        providerConfig,
      }),
    }),
  };
};

const createPlannedProviderSession = (policy = {}) => {
  const message = buildUnavailableProviderMessage(policy.provider);

  return {
    provider: policy.provider,
    integrationStatus: 'planned',
    canWrite: false,
    canRead: false,
    allowPlaintextFallback: false,
    buildWriteUnavailableError: () => new Error(message),
    buildReadUnavailableError: () => new Error(message),
    persistSecret: () => {
      throw new Error(message);
    },
    resolveSecretRef: () => {
      throw new Error(message);
    },
    flush: () => {},
    getSummary: () => ({
      contractVersion: SECRET_VAULT_CONTRACT_VERSION,
      provider: policy.provider,
      integrationStatus: 'planned',
      hasMasterKey: false,
      itemCount: 0,
      updatedAt: '',
      vaultFile: '',
      providerConfigSummary: buildProviderConfigSummary(policy),
    }),
  };
};

const createSecretProviderSession = (policy = {}) => {
  if (policy.provider === KEY_MANAGEMENT_PROVIDER_HASHICORP) {
    return createPlannedProviderSession(policy);
  }

  if (policy.provider === KEY_MANAGEMENT_PROVIDER_CLOUD_KMS) {
    return createPlannedProviderSession(policy);
  }

  return createEncryptedFileVaultSession(policy);
};

const deriveSecretKey = (masterKey = '') => {
  const normalizedMasterKey = normalizeText(masterKey);

  if (!normalizedMasterKey) {
    return null;
  }

  return createHash('sha256').update(normalizedMasterKey).digest();
};

const encryptSecretText = ({ plaintext = '', masterKey = '' } = {}) => {
  const normalizedPlaintext = String(plaintext ?? '');
  const key = deriveSecretKey(masterKey);

  if (!key) {
    throw new Error('secret master key is empty');
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(normalizedPlaintext, 'utf-8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    SECRET_CIPHER_VERSION,
    iv.toString('base64'),
    authTag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(':');
};

const decryptSecretText = ({ cipherText = '', masterKey = '' } = {}) => {
  const normalizedCipherText = normalizeText(cipherText);

  if (!normalizedCipherText) {
    return '';
  }

  const parts = normalizedCipherText.split(':');
  if (parts.length !== 4 || parts[0] !== SECRET_CIPHER_VERSION) {
    throw new Error('unsupported secret cipher format');
  }

  const key = deriveSecretKey(masterKey);
  if (!key) {
    throw new Error('secret master key is empty');
  }

  const iv = Buffer.from(parts[1], 'base64');
  const authTag = Buffer.from(parts[2], 'base64');
  const ciphertext = Buffer.from(parts[3], 'base64');

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return plaintext.toString('utf-8');
};

const isSecretRef = (value = '') => {
  const text = normalizeText(value);
  return text.startsWith(SECRET_REF_PREFIX) && text.length > SECRET_REF_PREFIX.length;
};

const parseSecretRef = (value = '') => {
  if (!isSecretRef(value)) {
    return '';
  }

  return normalizeText(value).slice(SECRET_REF_PREFIX.length);
};

const buildSecretRef = (secretId = '') => {
  const normalizedSecretId = normalizeText(secretId);
  return normalizedSecretId ? `${SECRET_REF_PREFIX}${normalizedSecretId}` : '';
};

const buildStableSecretId = (pathKey = '') => {
  return createHash('sha1').update(pathKey).digest('hex');
};

const walkSensitiveFields = (settings = {}, onField = () => {}) => {
  const database = isPlainObject(settings.database) ? settings.database : null;
  if (database) {
    onField({
      pathKey: 'database.default.password',
      value: database.password,
      setValue: (nextValue) => {
        database.password = nextValue;
      },
    });
  }

  const model = isPlainObject(settings.model) ? settings.model : null;
  if (model) {
    onField({
      pathKey: 'model.active.apiKey',
      value: model.apiKey,
      setValue: (nextValue) => {
        model.apiKey = nextValue;
      },
    });

    const models = Array.isArray(model.models) ? model.models : [];
    models.forEach((item, index) => {
      if (!isPlainObject(item)) {
        return;
      }

      const modelId = normalizeText(item.id) || `model-${index + 1}`;
      onField({
        pathKey: `model.models.${modelId}.apiKey`,
        value: item.apiKey,
        setValue: (nextValue) => {
          item.apiKey = nextValue;
        },
      });
    });
  }

  const pythonRuntime = isPlainObject(settings.pythonRuntime) ? settings.pythonRuntime : null;
  if (pythonRuntime) {
    const localChannel = isPlainObject(pythonRuntime.channels?.local)
      ? pythonRuntime.channels.local
      : null;
    if (localChannel) {
      onField({
        pathKey: 'pythonRuntime.channels.local.apiKey',
        value: localChannel.apiKey,
        setValue: (nextValue) => {
          localChannel.apiKey = nextValue;
        },
      });
    }

    const cloudChannel = isPlainObject(pythonRuntime.channels?.cloud)
      ? pythonRuntime.channels.cloud
      : null;
    if (cloudChannel) {
      onField({
        pathKey: 'pythonRuntime.channels.cloud.apiKey',
        value: cloudChannel.apiKey,
        setValue: (nextValue) => {
          cloudChannel.apiKey = nextValue;
        },
      });
    }
  }

  const search = isPlainObject(settings.search) ? settings.search : null;
  if (search) {
    const connectors = isPlainObject(search.connectors) ? search.connectors : {};

    const processDatabaseConnector = (connector = {}, index = 0, connectorListKey = '') => {
      if (!isPlainObject(connector) || !isPlainObject(connector.connection)) {
        return;
      }

      const connectorId = normalizeText(connector.id) || `${connectorListKey}-${index + 1}`;
      onField({
        pathKey: `search.connectors.${connectorListKey}.${connectorId}.connection.password`,
        value: connector.connection.password,
        setValue: (nextValue) => {
          connector.connection.password = nextValue;
        },
      });
    };

    const databases = Array.isArray(connectors.databases) ? connectors.databases : [];
    databases.forEach((item, index) => {
      processDatabaseConnector(item, index, 'databases');
    });

    const registry = Array.isArray(connectors.registry) ? connectors.registry : [];
    registry
      .filter((item) => {
        const connectorType = normalizeText(item?.connectorType || item?.adapterType || item?.kind).toLowerCase();
        return connectorType === 'database';
      })
      .forEach((item, index) => {
        processDatabaseConnector(item, index, 'registry');
      });
  }
};

const walkExternalDataSourceSensitiveFields = (items = [], onField = () => {}) => {
  if (!Array.isArray(items)) {
    return;
  }

  items.forEach((item, index) => {
    if (!isPlainObject(item)) {
      return;
    }

    const sourceId = normalizeText(item.id) || `external-source-${index + 1}`;

    onField({
      pathKey: `externalDataSources.${sourceId}.apiKey`,
      value: item.apiKey,
      setValue: (nextValue) => {
        item.apiKey = nextValue;
      },
    });

    onField({
      pathKey: `externalDataSources.${sourceId}.username`,
      value: item.username,
      setValue: (nextValue) => {
        item.username = nextValue;
      },
    });

    onField({
      pathKey: `externalDataSources.${sourceId}.password`,
      value: item.password,
      setValue: (nextValue) => {
        item.password = nextValue;
      },
    });
  });
};

const resolveMasterKey = (policy = {}) => {
  const envVarName = normalizeText(policy.masterKeyEnvVar);

  if (!envVarName) {
    return '';
  }

  return normalizeText(process.env[envVarName]);
};

const materializeSecretFields = ({
  root = {},
  policySeed = {},
  walkFields = () => {},
  requireVault = false,
} = {}) => {
  const rootClone = cloneRecord(root || {});
  const policy = resolveKeyManagementPolicy(policySeed);

  if (policy.enabled !== true) {
    return {
      root: rootClone,
      summary: {
        enabled: false,
        encryptedFieldCount: 0,
        reusedSecretRefCount: 0,
        plaintextFallbackCount: 0,
      },
    };
  }

  const providerSession = createSecretProviderSession(policy);
  let encryptedFieldCount = 0;
  let reusedSecretRefCount = 0;
  let plaintextFallbackCount = 0;

  walkFields(rootClone, ({ pathKey, value, setValue }) => {
    const textValue = String(value ?? '');
    const normalizedValue = normalizeText(textValue);

    if (!normalizedValue) {
      return;
    }

    if (isSecretRef(normalizedValue)) {
      reusedSecretRefCount += 1;
      return;
    }

    if (!providerSession.canWrite) {
      if (requireVault) {
        throw providerSession.buildWriteUnavailableError();
      }

      if (
        providerSession.allowPlaintextFallback &&
        policy.allowPlaintextWhenVaultUnavailable
      ) {
        plaintextFallbackCount += 1;
        return;
      }

      throw providerSession.buildWriteUnavailableError();
    }

    const secretRef = providerSession.persistSecret({
      pathKey,
      value: textValue,
    });

    setValue(secretRef);
    encryptedFieldCount += 1;
  });

  providerSession.flush();
  const providerSummary = providerSession.getSummary();

  return {
    root: rootClone,
    summary: {
      enabled: true,
      provider: policy.provider,
      integrationStatus: providerSummary.integrationStatus,
      encryptedFieldCount,
      reusedSecretRefCount,
      plaintextFallbackCount,
      vaultFile: providerSummary.vaultFile,
    },
  };
};

const resolveSecretFields = ({
  root = {},
  policySeed = {},
  walkFields = () => {},
  requireVault = false,
} = {}) => {
  const rootClone = cloneRecord(root || {});
  const policy = resolveKeyManagementPolicy(policySeed);

  if (policy.enabled !== true) {
    return {
      root: rootClone,
      summary: {
        enabled: false,
        resolvedSecretRefCount: 0,
        unresolvedSecretRefCount: 0,
      },
    };
  }

  const providerSession = createSecretProviderSession(policy);
  let resolvedSecretRefCount = 0;
  let unresolvedSecretRefCount = 0;

  walkFields(rootClone, ({ value, setValue }) => {
    const textValue = String(value ?? '');

    if (!isSecretRef(textValue)) {
      return;
    }

    if (!providerSession.canRead) {
      unresolvedSecretRefCount += 1;
      if (policy.strict || requireVault) {
        throw providerSession.buildReadUnavailableError();
      }
      setValue('');
      return;
    }

    try {
      const resolvedSecret = providerSession.resolveSecretRef(textValue);
      if (!resolvedSecret?.found) {
        unresolvedSecretRefCount += 1;
        if (policy.strict) {
          throw new Error(`secret ref ${textValue} not found in vault`);
        }
        setValue('');
        return;
      }

      const plaintext = resolvedSecret.plaintext || '';
      setValue(plaintext);
      resolvedSecretRefCount += 1;
    } catch (error) {
      unresolvedSecretRefCount += 1;

      if (policy.strict || requireVault) {
        throw new Error(`secret ref ${textValue} decrypt failed: ${error.message}`);
      }

      setValue('');
    }
  });

  return {
    root: rootClone,
    summary: {
      enabled: true,
      provider: policy.provider,
      integrationStatus: providerSession.getSummary().integrationStatus,
      resolvedSecretRefCount,
      unresolvedSecretRefCount,
      vaultFile: providerSession.getSummary().vaultFile,
    },
  };
};

export const materializeSettingsSecrets = ({ settings = {} } = {}) => {
  const result = materializeSecretFields({
    root: settings,
    policySeed: settings,
    walkFields: walkSensitiveFields,
  });

  return {
    settings: result.root,
    summary: result.summary,
  };
};

export const resolveSettingsSecrets = ({ settings = {} } = {}) => {
  const result = resolveSecretFields({
    root: settings,
    policySeed: settings,
    walkFields: walkSensitiveFields,
  });

  return {
    settings: result.root,
    summary: result.summary,
  };
};

export const materializeExternalDataSourceSecrets = ({
  items = [],
  settings = {},
} = {}) => {
  const result = materializeSecretFields({
    root: items,
    policySeed: settings,
    walkFields: walkExternalDataSourceSensitiveFields,
    requireVault: true,
  });

  return {
    items: result.root,
    summary: result.summary,
  };
};

export const resolveExternalDataSourceSecrets = ({
  items = [],
  settings = {},
} = {}) => {
  const result = resolveSecretFields({
    root: items,
    policySeed: settings,
    walkFields: walkExternalDataSourceSensitiveFields,
    requireVault: true,
  });

  return {
    items: result.root,
    summary: result.summary,
  };
};

export const getSecretVaultSummary = ({ settings = {} } = {}) => {
  const policy = resolveKeyManagementPolicy(settings || {});
  const providerSession = createSecretProviderSession(policy);
  const providerSummary = providerSession.getSummary();

  return {
    contractVersion: SECRET_VAULT_CONTRACT_VERSION,
    enabled: policy.enabled === true,
    provider: policy.provider,
    strict: policy.strict === true,
    masterKeyEnvVar: policy.masterKeyEnvVar,
    hasMasterKey: Boolean(providerSummary.hasMasterKey),
    itemCount: providerSummary.itemCount,
    updatedAt: providerSummary.updatedAt,
    vaultFile: providerSummary.vaultFile,
    integrationStatus: providerSummary.integrationStatus,
    providerConfigSummary: providerSummary.providerConfigSummary || {},
    supportedProviders: SUPPORTED_KEY_MANAGEMENT_PROVIDERS,
  };
};
