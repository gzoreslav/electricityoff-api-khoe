import { TelegramClient } from 'telegram';
import config from '../config';
import moment from 'moment-timezone';
import {
  ELECTRICITY_PROVIDER,
  ELECTRICITY_STATUS,
  GroupByQueueResult,
  IEoffEvent,
  ITargetDateObject,
  ParsedScheduleString,
} from './types-and-interfaces';
import axios from 'axios';

export interface DateObj {
  year: number;
  name: string;
  index: number;
}

const KYIV_TIMEZONE = 'Europe/Kiev';

export const MONTH_NAMES: string[] = [
  'січня',
  'лютого',
  'березня',
  'квітня',
  'травня',
  'червня',
  'липня',
  'серпня',
  'вересня',
  'жовтня',
  'листопада',
  'грудня',
];

const getCurrentMonth = (): DateObj => {
  const currentDate = getNewKyivDate();

  const currentMonth = currentDate.month(); // Returns a number (0-11)

  return { index: currentMonth + 1, name: MONTH_NAMES[currentMonth], year: currentDate.year() };
};

const getNextMonth = (): DateObj => {
  const currentDate = getNewKyivDate();
  let nextMonthIndex = currentDate.month() + 1; // Increment to get next month
  const currentYear = currentDate.year();

  let year = currentYear;
  // Handle wrap around for December
  if (nextMonthIndex === 12) {
    nextMonthIndex = 0; // January (0 index)
    if (currentDate.date() === 31) {
      year = currentYear + 1;
    }
  }

  return { index: nextMonthIndex + 1, name: MONTH_NAMES[nextMonthIndex], year };
};

function formatDateFromObject(obj: { day: any; index: any; name?: string; year?: number }): string {
  const year = new Date().getFullYear(); // Get the current year
  const monthIndex = obj.index - 1; // Convert month index to zero-based
  const month = (monthIndex + 1).toString().padStart(2, '0'); // Convert to one-based index and pad to two digits
  const day = obj.day.toString().padStart(2, '0'); // Ensure day is two digits with leading zero if necessary

  // Create date string in YYYY-MM-DD format
  return `${year}-${month}-${day}`;
}

let tgClient: TelegramClient;

const getTelegramClient = async (): Promise<TelegramClient> => {
  if (tgClient) {
    return tgClient;
  }

  tgClient = new TelegramClient(config.telegram.stringSession, config.telegram.apiId, config.telegram.apiHash, {
    connectionRetries: 10,
    floodSleepThreshold: 0,
  });

  await tgClient.connect();

  return tgClient;
};

const getFormattedDate = (date: moment.Moment): string => {
  const year = date.year();
  const month = (date.month() + 1).toString().padStart(2, '0'); // Months are zero-based, so add 1
  const day = date.date().toString().padStart(2, '0'); // Day of the month
  return `${year}-${month}-${day}`;
};

// Get the current date and time in Kyiv timezone
const getNewKyivDate = (): moment.Moment => moment.tz('Europe/Kyiv');

const toKyivDate = (date: any): moment.Moment => moment.tz(date, KYIV_TIMEZONE);

const getTodayAndTomorrowDate = (): { todayDate: string; tomorrowDate: string } => {
  const today: moment.Moment = getNewKyivDate();
  const todayDate: string = getFormattedDate(today);

  const tomorrow: moment.Moment = today.clone().add(1, 'day');
  const tomorrowDate: string = getFormattedDate(tomorrow);

  return { todayDate, tomorrowDate };
};

const getTargetDate = (message: string): null | ITargetDateObject => {
  const currentMonth: DateObj = getCurrentMonth();
  const nextMonth: DateObj = getNextMonth();

  let target;
  if (message.toUpperCase().includes(currentMonth.name.toUpperCase())) {
    target = currentMonth;
  } else if (message.toUpperCase().includes(nextMonth.name.toUpperCase())) {
    target = nextMonth;
  } else {
    // ponytail: wrong-month typo fallback ("6 липня" posted on Oct 6), only trusts day == today/tomorrow
    const upper = message.toUpperCase();
    const month = MONTH_NAMES.find((name) => upper.includes(` ${name.toUpperCase()}`));
    const dayMatch = month && upper.split(` ${month.toUpperCase()}`)[0].trim().match(/\d+$/);
    if (!dayMatch) return null;
    const today = getNewKyivDate();
    const match = [today, today.clone().add(1, 'day')].find((d) => d.date() === parseInt(dayMatch[0]));
    if (!match) return null;
    const rawDateObj = { index: match.month() + 1, name: MONTH_NAMES[match.month()], year: match.year(), day: match.date() };
    return { targetDate: getFormattedDate(match), rawDateObj };
  }

  const targetDayString: string = message.toUpperCase().split(` ${target.name.toUpperCase()}`)[0].trim();
  const targetDayMatch = targetDayString.match(/\d+$/);
  const targetDay: number | null = targetDayMatch ? parseInt(targetDayMatch[0]) : null;

  if (!targetDay) return null;

  const result = { ...target, day: targetDay };

  return {
    targetDate: formatDateFromObject(result),
    rawDateObj: result,
  };
};

const log = (name: string, arg1?: any, arg2?: any, arg3?: any) =>
  console.log(
    `scv_${name}: ${arg1 ? JSON.stringify(arg1, null, 2) : ''}${arg2 ? ', ' + JSON.stringify(arg2, null, 2) : ''}${arg3 ? ', ' + JSON.stringify(arg3, null, 2) : ''}`
  );

const groupByQueue = (data: ParsedScheduleString[]): GroupByQueueResult =>
  data.reduce((acc: GroupByQueueResult, { queue, startTime, endTime }) => {
    if (!acc[queue]) {
      acc[queue] = [];
    }
    acc[queue].push({ startTime, endTime });
    return acc;
  }, {});

const convertToEvents = (
  scheduleData: GroupByQueueResult,
  date: string | null,
  provider: ELECTRICITY_PROVIDER
): IEoffEvent[] => {
  return Object.entries(scheduleData).flatMap(([queue, timeIntervals]) => {
    if (timeIntervals.length === 0) return [];

    timeIntervals.sort((a, b) => {
      const startA = a.startTime.split(':').map(Number);
      const startB = b.startTime.split(':').map(Number);
      return startA[0] - startB[0] || startA[1] - startB[1];
    });

    const result = [];
    const defaultValuesObj = {
      queue,
      date: date || '',
      electricity: ELECTRICITY_STATUS.OFF,
      provider,
    };

    let currentStartTime: string = timeIntervals[0].startTime;
    let currentEndTime: string = timeIntervals[0].endTime;

    for (let i = 1; i < timeIntervals.length; i++) {
      const previousEndTime: string = currentEndTime;
      const { startTime, endTime } = timeIntervals[i];

      if (startTime === previousEndTime) {
        // If the current interval starts when the previous one ends, merge them
        currentEndTime = endTime;
      } else {
        // Push the previous merged interval to result
        result.push({ ...defaultValuesObj, startTime: currentStartTime, endTime: currentEndTime });

        // Start a new interval
        currentStartTime = startTime;
        currentEndTime = endTime;
      }
    }

    // Push the last interval
    result.push({ ...defaultValuesObj, startTime: currentStartTime, endTime: currentEndTime });

    return result;
  });
};

const parseQueueNumbers = (line: string): string[] | null => {
  // Use regex to split the line by time intervals and capture queue numbers
  const parts: string[] = line.split(' ');

  // Extract the last part (which should contain queue numbers)
  const queuePart: string = parts[0].trim();

  // Regex to match patterns like "2.1", "2.І", "2.II", "3.2", "3.ІІ" with optional trailing dot
  const match = queuePart.match(/^(\d+)\.(І|ІІ|I|II|\d+)[:.]?$/);

  if (!match) {
    return null;
  }

  let sub = match[2];
  if (sub === 'І' || sub === 'I') {
    sub = '1';
  } else if (sub === 'ІІ' || sub === 'II') {
    sub = '2';
  }
  // If it's already a digit (e.g., '1' or '2'), sub remains as-is

  const normalizedQueue = `${match[1]}.${sub}`;

  return [normalizedQueue];
};

const getAxiosMethod = (method: string) => {
  switch (method) {
    case 'POST':
      return axios.post;
      break;
    case 'PUT':
      return axios.put;
      break;
    case 'PATCH':
      return axios.patch;
      break;
    case 'GET':
    default:
      return axios.get;
      break;
  }
};

const LEGACY_HTML_PROXY = 'https://eoff.vercel.app/get-html';

async function fetchWithUkrProxy(url: string, method: string = 'GET', options = {}) {
  const ukrProxyUrl = config.ukrProxy.url;
  const ukrProxyApiKey = config.ukrProxy.apiKey;

  if (ukrProxyUrl && ukrProxyApiKey) {
    return axios.post(
      ukrProxyUrl,
      { url, method },
      {
        timeout: 110000,
        headers: {
          'x-api-key': ukrProxyApiKey,
          'Content-Type': 'application/json',
        },
      }
    );
  }

  const proxyUrl = `${LEGACY_HTML_PROXY}?useProxy=1&url=${encodeURIComponent(url)}`;
  try {
    return await axios.get(proxyUrl, {
      timeout: 45000,
      responseType: 'text',
      ...options,
    });
  } catch (error) {
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    const message = error instanceof Error ? error.message : 'request failed';
    throw new Error(`Kharkiv fetch failed (${status ?? message}) for ${url}`);
  }
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const sortOutputEvents = (a: IEoffEvent, b: IEoffEvent) => {
  // First sort by queue (ascending)
  if (a.queue !== b.queue) {
    return parseFloat(a.queue) - parseFloat(b.queue);
  }

  // Then by date (ascending)
  if (a.date !== b.date) {
    return a.date.localeCompare(b.date);
  }

  // Then by startTime (ascending)
  return a.startTime.localeCompare(b.startTime);
};

export {
  getCurrentMonth,
  getNextMonth,
  formatDateFromObject,
  getTelegramClient,
  getFormattedDate,
  getNewKyivDate,
  toKyivDate,
  getTodayAndTomorrowDate,
  getTargetDate,
  log,
  groupByQueue,
  convertToEvents,
  parseQueueNumbers,
  fetchWithUkrProxy,
  delay,
  sortOutputEvents,
};
