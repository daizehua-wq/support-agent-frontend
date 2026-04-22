const BEIJING_TIME_ZONE = 'Asia/Shanghai';

const beijingFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: BEIJING_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

type BeijingTimeFormatOptions = {
  includeMilliseconds?: boolean;
};

const padMilliseconds = (value: number) => String(value).padStart(3, '0');

const isValidDate = (date: Date) => !Number.isNaN(date.getTime());

export const formatDateTimeToBeijingTime = (
  value?: string | null,
  { includeMilliseconds = false }: BeijingTimeFormatOptions = {},
) => {
  if (typeof value !== 'string' || !value.trim()) {
    return '';
  }

  const date = new Date(value);
  if (!isValidDate(date)) {
    return value;
  }

  const parts = beijingFormatter.formatToParts(date);
  const lookup = Object.fromEntries(
    parts.map((part: Intl.DateTimeFormatPart) => [part.type, part.value]),
  );
  const milliseconds = includeMilliseconds ? `.${padMilliseconds(date.getUTCMilliseconds())}` : '';

  return `${lookup.year}-${lookup.month}-${lookup.day} ${lookup.hour}:${lookup.minute}:${lookup.second}${milliseconds} 北京时间`;
};
