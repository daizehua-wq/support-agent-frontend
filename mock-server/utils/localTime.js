const pad = (value, size = 2) => String(value).padStart(size, '0');

const toDate = (value = new Date()) => {
  if (value instanceof Date) {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'string') {
    return new Date(value);
  }

  return new Date();
};

const formatOffset = (date) => {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absolute = Math.abs(offsetMinutes);
  return `${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`;
};

export const getLocalTimeZone = () =>
  process.env.AP_LOCAL_TIME_ZONE ||
  Intl.DateTimeFormat().resolvedOptions().timeZone ||
  'local';

export const toLocalIso = (value = new Date(), { includeMilliseconds = true } = {}) => {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const milliseconds = includeMilliseconds ? `.${pad(date.getMilliseconds(), 3)}` : '';
  return [
    date.getFullYear(),
    '-',
    pad(date.getMonth() + 1),
    '-',
    pad(date.getDate()),
    'T',
    pad(date.getHours()),
    ':',
    pad(date.getMinutes()),
    ':',
    pad(date.getSeconds()),
    milliseconds,
    formatOffset(date),
  ].join('');
};

export const nowLocalIso = () => toLocalIso(new Date());

export const toLocalDateKey = (value = new Date()) => {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export const toLocalMinuteKey = (value = new Date()) => {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return `${toLocalDateKey(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const addDaysLocalIso = (days = 0, value = new Date()) => {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const next = new Date(date);
  next.setDate(next.getDate() + Number(days || 0));
  return toLocalIso(next);
};

export const toLocalFileStamp = (value = new Date()) =>
  toLocalIso(value).replace(/[:.]/g, '-');
