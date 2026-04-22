export const buildSuccessPayload = ({ message = 'ok', data = undefined, meta = undefined } = {}) => {
  const payload = {
    success: true,
    message,
  };

  if (data !== undefined) {
    payload.data = data;
  }

  if (meta !== undefined) {
    payload.meta = meta;
  }

  return payload;
};

export const buildFailurePayload = ({
  message = 'request failed',
  error = undefined,
  data = undefined,
} = {}) => {
  const payload = {
    success: false,
    message,
  };

  if (error !== undefined) {
    payload.error = error;
  }

  if (data !== undefined) {
    payload.data = data;
  }

  return payload;
};

const pickDefined = (record = {}) => {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  );
};

export const buildWriteBackPayload = ({
  writeBackStatus,
  version = undefined,
  modifiedAt = undefined,
  modifiedBy = undefined,
  summary = undefined,
} = {}) => {
  const payload = {
    writeBackStatus,
  };

  if (version !== undefined) {
    payload.version = version;
  }

  if (modifiedAt !== undefined) {
    payload.modifiedAt = modifiedAt;
  }

  if (modifiedBy !== undefined) {
    payload.modifiedBy = modifiedBy;
  }

  if (summary !== undefined) {
    payload.summary = summary;
  }

  return payload;
};

export const buildGovernanceSuccessPayload = ({
  message = 'governance request succeeded',
  action = undefined,
  targetType = undefined,
  targetId = undefined,
  data = undefined,
  meta = undefined,
  warnings = undefined,
  trace = undefined,
  writeBack = undefined,
} = {}) => {
  const payload = {
    success: true,
    message,
    ...pickDefined({
      action,
      targetType,
      targetId,
      data,
      meta,
      warnings,
      trace,
      writeBack,
    }),
  };

  return payload;
};

export const buildGovernanceFailurePayload = ({
  message = 'governance request failed',
  action = undefined,
  targetType = undefined,
  targetId = undefined,
  error = undefined,
  data = undefined,
  meta = undefined,
  trace = undefined,
  writeBack = undefined,
} = {}) => {
  const payload = {
    success: false,
    message,
    ...pickDefined({
      action,
      targetType,
      targetId,
      error,
      data,
      meta,
      trace,
      writeBack,
    }),
  };

  return payload;
};

export const buildGovernanceBlockedPayload = ({
  message = 'governance request blocked',
  action = undefined,
  targetType = undefined,
  targetId = undefined,
  blockers = undefined,
  error = undefined,
  data = undefined,
  meta = undefined,
  trace = undefined,
  writeBack = undefined,
} = {}) => {
  const payload = {
    success: false,
    message,
    ...pickDefined({
      action,
      targetType,
      targetId,
      blockers,
      error,
      data,
      meta,
      trace,
      writeBack,
    }),
  };

  return payload;
};

export const sendGovernanceSuccess = (
  res,
  {
    status = 200,
    message = 'governance request succeeded',
    action = undefined,
    targetType = undefined,
    targetId = undefined,
    data = undefined,
    meta = undefined,
    warnings = undefined,
    trace = undefined,
    writeBack = undefined,
  } = {},
) => {
  return res.status(status).json(
    buildGovernanceSuccessPayload({
      message,
      action,
      targetType,
      targetId,
      data,
      meta,
      warnings,
      trace,
      writeBack,
    }),
  );
};

export const sendGovernanceFailure = (
  res,
  {
    status = 500,
    message = 'governance request failed',
    action = undefined,
    targetType = undefined,
    targetId = undefined,
    error = undefined,
    data = undefined,
    meta = undefined,
    trace = undefined,
    writeBack = undefined,
  } = {},
) => {
  return res.status(status).json(
    buildGovernanceFailurePayload({
      message,
      action,
      targetType,
      targetId,
      error,
      data,
      meta,
      trace,
      writeBack,
    }),
  );
};

export const sendGovernanceBlocked = (
  res,
  {
    status = 409,
    message = 'governance request blocked',
    action = undefined,
    targetType = undefined,
    targetId = undefined,
    blockers = undefined,
    error = undefined,
    data = undefined,
    meta = undefined,
    trace = undefined,
    writeBack = undefined,
  } = {},
) => {
  return res.status(status).json(
    buildGovernanceBlockedPayload({
      message,
      action,
      targetType,
      targetId,
      blockers,
      error,
      data,
      meta,
      trace,
      writeBack,
    }),
  );
};

export const sendSuccess = (
  res,
  { status = 200, message = 'ok', data = undefined, meta = undefined } = {},
) => {
  return res.status(status).json(
    buildSuccessPayload({
      message,
      data,
      meta,
    }),
  );
};

export const sendFailure = (
  res,
  { status = 500, message = 'request failed', error = undefined, data = undefined } = {},
) => {
  return res.status(status).json(
    buildFailurePayload({
      message,
      error,
      data,
    }),
  );
};