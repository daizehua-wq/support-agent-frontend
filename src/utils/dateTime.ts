const resolvedLocalTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;

const LOCAL_TIME_ZONE = resolvedLocalTimeZone || 'local';

const localDateTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: resolvedLocalTimeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

const localDateFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: resolvedLocalTimeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

type LocalTimeFormatOptions = {
  includeMilliseconds?: boolean;
  includeTimeZoneLabel?: boolean;
};

const padMilliseconds = (value: number) => String(value).padStart(3, '0');

const isValidDate = (date: Date) => !Number.isNaN(date.getTime());

const hasExplicitTimeZone = (value: string) => /(?:z|[+-]\d{2}:?\d{2})$/i.test(value.trim());

const parseDateTimeValue = (value?: string | number | Date | null) => {
  if (value instanceof Date) {
    return value;
  }

  if (typeof value === 'number') {
    return new Date(value);
  }

  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  const normalizedValue = value.trim();
  const dateOnlyMatch = normalizedValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  if (!hasExplicitTimeZone(normalizedValue)) {
    return new Date(normalizedValue.replace(' ', 'T'));
  }

  return new Date(normalizedValue);
};

const getDateParts = (date: Date) => {
  const parts = localDateTimeFormatter.formatToParts(date);
  return Object.fromEntries(
    parts.map((part: Intl.DateTimeFormatPart) => [part.type, part.value]),
  );
};

export const formatDateTimeToLocalTime = (
  value?: string | number | Date | null,
  {
    includeMilliseconds = false,
    includeTimeZoneLabel = false,
  }: LocalTimeFormatOptions = {},
) => {
  const date = parseDateTimeValue(value);
  if (!date) {
    return '';
  }

  if (!isValidDate(date)) {
    return typeof value === 'string' ? value : '';
  }

  const lookup = getDateParts(date);
  const milliseconds = includeMilliseconds ? `.${padMilliseconds(date.getMilliseconds())}` : '';
  const timeZoneLabel = includeTimeZoneLabel ? ` ${LOCAL_TIME_ZONE}` : '';

  return `${lookup.year}-${lookup.month}-${lookup.day} ${lookup.hour}:${lookup.minute}:${lookup.second}${milliseconds}${timeZoneLabel}`;
};

export const formatDateToLocalDateKey = (value: string | number | Date = new Date()) => {
  const date = parseDateTimeValue(value);
  if (!date || !isValidDate(date)) {
    return '';
  }

  const parts = localDateFormatter.formatToParts(date);
  const lookup = Object.fromEntries(
    parts.map((part: Intl.DateTimeFormatPart) => [part.type, part.value]),
  );

  return `${lookup.year}-${lookup.month}-${lookup.day}`;
};

