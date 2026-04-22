import { createHmac, timingSafeEqual } from 'crypto';
import {
  getSettingsSecuritySettings,
  getSettingsTenantIsolationSettings,
  readSettings,
} from './settingsService.js';

const normalizeText = (value = '') => String(value || '').trim();

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const normalizeDomains = (value = []) => {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeText(item))
      .filter(Boolean);
  }

  const text = normalizeText(value);
  if (!text) {
    return [];
  }

  return text
    .split(',')
    .map((item) => normalizeText(item))
    .filter(Boolean);
};

const readHeader = (req = {}, headerName = '') => {
  const normalizedHeaderName = normalizeText(headerName).toLowerCase();

  if (!normalizedHeaderName || !req?.headers || typeof req.headers !== 'object') {
    return '';
  }

  const value = req.headers[normalizedHeaderName];

  if (typeof value === 'string') {
    return normalizeText(value);
  }

  if (Array.isArray(value) && value.length > 0) {
    return normalizeText(value[0]);
  }

  return '';
};

const shouldBypassSso = ({ req = {}, ssoSettings = {} } = {}) => {
  const bypassPaths = Array.isArray(ssoSettings.bypassPaths) ? ssoSettings.bypassPaths : [];
  const requestPath = normalizeText(req.path || req.originalUrl || req.url);

  if (!requestPath || bypassPaths.length === 0) {
    return false;
  }

  return bypassPaths.some((pathPrefix) => {
    const normalizedPrefix = normalizeText(pathPrefix);
    if (!normalizedPrefix) {
      return false;
    }

    return requestPath.startsWith(normalizedPrefix);
  });
};

const toBase64Url = (value = '') => {
  return Buffer.from(value)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
};

const fromBase64Url = (value = '') => {
  const normalized = normalizeText(value).replace(/-/g, '+').replace(/_/g, '/');

  if (!normalized) {
    return Buffer.from('');
  }

  const padding = normalized.length % 4;
  const padded = padding === 0 ? normalized : normalized + '='.repeat(4 - padding);
  return Buffer.from(padded, 'base64');
};

const decodeJwtPart = (part = '') => {
  const parsed = fromBase64Url(part).toString('utf-8');

  if (!parsed) {
    throw new Error('jwt part is empty');
  }

  return JSON.parse(parsed);
};

const verifyJwtHs256 = ({ token = '', secret = '' } = {}) => {
  const normalizedToken = normalizeText(token);
  const normalizedSecret = normalizeText(secret);

  if (!normalizedToken || !normalizedSecret) {
    throw new Error('token or secret is empty');
  }

  const segments = normalizedToken.split('.');
  if (segments.length !== 3) {
    throw new Error('jwt must have 3 segments');
  }

  const [headerSegment, payloadSegment, signatureSegment] = segments;
  const header = decodeJwtPart(headerSegment);

  if (normalizeText(header.alg).toUpperCase() !== 'HS256') {
    throw new Error('jwt alg must be HS256');
  }

  const expectedSignature = toBase64Url(
    createHmac('sha256', normalizedSecret)
      .update(`${headerSegment}.${payloadSegment}`)
      .digest(),
  );

  const providedBuffer = Buffer.from(signatureSegment);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    providedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    throw new Error('jwt signature mismatch');
  }

  const payload = decodeJwtPart(payloadSegment);
  const nowSeconds = Math.floor(Date.now() / 1000);

  if (Number.isFinite(Number(payload.exp)) && Number(payload.exp) < nowSeconds) {
    throw new Error('jwt expired');
  }

  if (Number.isFinite(Number(payload.nbf)) && Number(payload.nbf) > nowSeconds) {
    throw new Error('jwt not active yet');
  }

  return {
    header,
    payload,
  };
};

const resolveRouteDomain = ({ routeDomains = {}, requestPath = '' } = {}) => {
  const normalizedRequestPath = normalizeText(requestPath);

  if (!normalizedRequestPath || !isPlainObject(routeDomains)) {
    return '';
  }

  const matchedRoute = Object.keys(routeDomains)
    .map((routePrefix) => normalizeText(routePrefix))
    .filter(Boolean)
    .filter((routePrefix) => normalizedRequestPath.startsWith(routePrefix))
    .sort((left, right) => right.length - left.length)[0];

  if (!matchedRoute) {
    return '';
  }

  return normalizeText(routeDomains[matchedRoute]);
};

const resolveActorFromTrustedHeaders = ({ req = {}, ssoSettings = {} } = {}) => {
  const userId = readHeader(req, ssoSettings.userIdHeader || 'x-sso-user-id');
  const role = readHeader(req, ssoSettings.roleHeader || 'x-sso-role');
  const tenantId = readHeader(req, ssoSettings.tenantHeader || 'x-sso-tenant-id');
  const domains = normalizeDomains(
    readHeader(req, ssoSettings.domainsHeader || 'x-sso-domains'),
  );

  return {
    userId,
    role,
    tenantId,
    domains,
    authSource: 'sso-header-trusted',
  };
};

const resolveActorFromJwt = ({ req = {}, ssoSettings = {} } = {}) => {
  const authorization = readHeader(req, 'authorization');
  const token = authorization.replace(/^Bearer\s+/i, '');
  const jwtSecretEnvVar = normalizeText(ssoSettings.jwtSecretEnvVar || 'SETTINGS_SSO_JWT_SECRET');
  const jwtSecret = normalizeText(process.env[jwtSecretEnvVar]);

  if (!jwtSecret) {
    throw new Error(`jwt secret env ${jwtSecretEnvVar} is empty`);
  }

  const jwtClaims = verifyJwtHs256({
    token,
    secret: jwtSecret,
  });
  const claims = isPlainObject(jwtClaims.payload) ? jwtClaims.payload : {};

  const issuer = normalizeText(ssoSettings.issuer);
  const audience = normalizeText(ssoSettings.audience);
  if (issuer && normalizeText(claims.iss) !== issuer) {
    throw new Error(`jwt issuer mismatch: expected ${issuer}`);
  }
  if (audience && normalizeText(claims.aud) !== audience) {
    throw new Error(`jwt audience mismatch: expected ${audience}`);
  }

  const userId = normalizeText(claims[ssoSettings.userIdClaim || 'sub']);
  const role = normalizeText(claims[ssoSettings.roleClaim || 'role']);
  const tenantId = normalizeText(claims[ssoSettings.tenantClaim || 'tenantId']);
  const domains = normalizeDomains(claims[ssoSettings.domainsClaim || 'domains']);

  return {
    userId,
    role,
    tenantId,
    domains,
    authSource: 'sso-jwt-hs256',
    claims,
  };
};

const buildFailurePayload = ({
  message = 'sso auth failed',
  code = 'sso-auth-failed',
  details = null,
} = {}) => {
  return {
    success: false,
    message,
    error: {
      code,
      message,
      details,
    },
  };
};

const attachSecurityHeaders = ({
  req = {},
  actor = {},
  tenantIsolation = {},
} = {}) => {
  const actorHeader = normalizeText(tenantIsolation.actorHeader || 'x-user-id').toLowerCase();
  const roleHeader = normalizeText(tenantIsolation.roleHeader || 'x-user-role').toLowerCase();
  const tenantHeader = normalizeText(tenantIsolation.tenantHeader || 'x-tenant-id').toLowerCase();

  if (actor.userId) {
    req.headers[actorHeader] = actor.userId;
    req.headers['x-user-id'] = actor.userId;
  }

  if (actor.role) {
    req.headers[roleHeader] = actor.role;
    req.headers['x-user-role'] = actor.role;
  }

  if (actor.tenantId) {
    req.headers[tenantHeader] = actor.tenantId;
    req.headers['x-tenant-id'] = actor.tenantId;
  }
};

const checkTenantIsolation = ({
  req = {},
  actor = {},
  tenantIsolation = {},
  permissionDomains = {},
} = {}) => {
  if (permissionDomains.strictTenantMatch === false) {
    return {
      allowed: true,
      reason: '',
    };
  }

  const expectedTenantHeaderName = normalizeText(tenantIsolation.tenantHeader || 'x-tenant-id');
  const requestedTenantId =
    readHeader(req, expectedTenantHeaderName) || normalizeText(req.query?.tenantId);
  const actorTenantId = normalizeText(actor.tenantId);

  if (!requestedTenantId || !actorTenantId) {
    return {
      allowed: true,
      reason: '',
    };
  }

  if (requestedTenantId === actorTenantId) {
    return {
      allowed: true,
      reason: '',
    };
  }

  return {
    allowed: false,
    reason: `tenant mismatch: request=${requestedTenantId} actor=${actorTenantId}`,
  };
};

const checkPermissionDomainIsolation = ({
  actor = {},
  permissionDomains = {},
  requestPath = '',
} = {}) => {
  const routeDomain = resolveRouteDomain({
    routeDomains: permissionDomains.routeDomains,
    requestPath,
  });

  if (!routeDomain || permissionDomains.enabled === false) {
    return {
      allowed: true,
      reason: '',
      routeDomain,
    };
  }

  const actorDomains = normalizeDomains(actor.domains);

  if (actorDomains.length === 0) {
    return {
      allowed: true,
      reason: '',
      routeDomain,
    };
  }

  if (actorDomains.includes(routeDomain)) {
    return {
      allowed: true,
      reason: '',
      routeDomain,
    };
  }

  return {
    allowed: false,
    reason: `permission domain denied: routeDomain=${routeDomain}`,
    routeDomain,
  };
};

const resolveSecurityActor = ({ req = {}, ssoSettings = {} } = {}) => {
  const mode = normalizeText(ssoSettings.mode || 'header-trusted').toLowerCase();

  if (mode === 'jwt-hs256') {
    return resolveActorFromJwt({
      req,
      ssoSettings,
    });
  }

  return resolveActorFromTrustedHeaders({
    req,
    ssoSettings,
  });
};

export const buildSecurityContext = ({ req = {}, settings = {} } = {}) => {
  const securitySettings = getSettingsSecuritySettings(settings);
  const ssoSettings = isPlainObject(securitySettings?.sso)
    ? securitySettings.sso
    : {};
  const tenantIsolation = getSettingsTenantIsolationSettings(settings);
  const permissionDomains = isPlainObject(securitySettings?.permissionDomains)
    ? securitySettings.permissionDomains
    : {};

  if (ssoSettings.enabled !== true) {
    return {
      enabled: false,
      authenticated: false,
      actor: {
        userId: '',
        role: '',
        tenantId: '',
        domains: [],
      },
      sso: ssoSettings,
      tenantIsolation,
      permissionDomains,
      allowed: true,
      reason: 'sso-disabled',
      routeDomain: '',
    };
  }

  if (shouldBypassSso({ req, ssoSettings })) {
    return {
      enabled: true,
      authenticated: false,
      actor: {
        userId: '',
        role: '',
        tenantId: '',
        domains: [],
      },
      sso: ssoSettings,
      tenantIsolation,
      permissionDomains,
      allowed: true,
      reason: 'sso-bypass-path',
      routeDomain: '',
    };
  }

  const requestPath = normalizeText(req.path || req.originalUrl || req.url);

  try {
    const actor = resolveSecurityActor({
      req,
      ssoSettings,
    });
    const hasActorIdentity = Boolean(actor.userId || actor.role || actor.tenantId);

    if (!hasActorIdentity) {
      if (ssoSettings.allowAnonymousRead === true && String(req.method || 'GET').toUpperCase() === 'GET') {
        return {
          enabled: true,
          authenticated: false,
          actor: {
            userId: 'anonymous',
            role: 'viewer',
            tenantId: normalizeText(tenantIsolation.defaultTenantId || 'default'),
            domains: [],
            authSource: 'sso-anonymous-read',
          },
          sso: ssoSettings,
          tenantIsolation,
          permissionDomains,
          allowed: true,
          reason: 'sso-anonymous-read-allowed',
          routeDomain: resolveRouteDomain({
            routeDomains: permissionDomains.routeDomains,
            requestPath,
          }),
        };
      }

      if (ssoSettings.required !== false) {
        return {
          enabled: true,
          authenticated: false,
          actor,
          sso: ssoSettings,
          tenantIsolation,
          permissionDomains,
          allowed: false,
          reason: 'sso-actor-empty',
          routeDomain: '',
        };
      }
    }

    const tenantCheck = checkTenantIsolation({
      req,
      actor,
      tenantIsolation,
      permissionDomains,
    });

    if (!tenantCheck.allowed) {
      return {
        enabled: true,
        authenticated: hasActorIdentity,
        actor,
        sso: ssoSettings,
        tenantIsolation,
        permissionDomains,
        allowed: false,
        reason: tenantCheck.reason,
        routeDomain: '',
      };
    }

    const domainCheck = checkPermissionDomainIsolation({
      actor,
      permissionDomains,
      requestPath,
    });

    if (!domainCheck.allowed) {
      return {
        enabled: true,
        authenticated: hasActorIdentity,
        actor,
        sso: ssoSettings,
        tenantIsolation,
        permissionDomains,
        allowed: false,
        reason: domainCheck.reason,
        routeDomain: domainCheck.routeDomain,
      };
    }

    return {
      enabled: true,
      authenticated: hasActorIdentity,
      actor,
      sso: ssoSettings,
      tenantIsolation,
      permissionDomains,
      allowed: true,
      reason: 'sso-authenticated',
      routeDomain: domainCheck.routeDomain,
    };
  } catch (error) {
    return {
      enabled: true,
      authenticated: false,
      actor: {
        userId: '',
        role: '',
        tenantId: '',
        domains: [],
      },
      sso: ssoSettings,
      tenantIsolation,
      permissionDomains,
      allowed: false,
      reason: error.message,
      routeDomain: '',
    };
  }
};

export const enforceSecurityContext = (req, res, next) => {
  try {
    const settings = readSettings();
    const securityContext = buildSecurityContext({
      req,
      settings,
    });

    req.securityContext = securityContext;

    if (!securityContext.allowed) {
      return res
        .status(401)
        .json(
          buildFailurePayload({
            message: 'security policy rejected request',
            code: 'security-policy-reject',
            details: {
              reason: securityContext.reason,
              routeDomain: securityContext.routeDomain,
              actor: securityContext.actor,
            },
          }),
        );
    }

    if (securityContext.enabled === true && isPlainObject(securityContext.actor)) {
      attachSecurityHeaders({
        req,
        actor: securityContext.actor,
        tenantIsolation: securityContext.tenantIsolation || {},
      });
    }

    return next();
  } catch (error) {
    return res
      .status(500)
      .json(
        buildFailurePayload({
          message: 'security middleware execution failed',
          code: 'security-middleware-failed',
          details: {
            error: error.message,
          },
        }),
      );
  }
};
