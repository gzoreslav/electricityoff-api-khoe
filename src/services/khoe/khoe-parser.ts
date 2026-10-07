import {
  ELECTRICITY_PROVIDER,
  GroupByQueueResult,
  IEoffEvent,
  IParsedMessage,
  ISchedule,
  KhoeNewsItem,
  ParsedScheduleString,
} from '../../common/types-and-interfaces';
import {
  convertToEvents,
  getTodayAndTomorrowDate,
  groupByQueue,
  log,
  parseQueueNumbers,
  sortOutputEvents,
} from '../../common/utils';

export class KhoeParser {
  private daysScheduleData: { [index: string]: IEoffEvent[] } = {};
  private provider: ELECTRICITY_PROVIDER = ELECTRICITY_PROVIDER.KHOE;

  filterOnlyTodayAndTomorrowNews(news: KhoeNewsItem[]): KhoeNewsItem[] {
    const phrase1: string = 'У Харківській області'.toUpperCase();
    const phrase2: string = 'діятимуть погодинні відключення'.toUpperCase();
    const phrase3: string = 'будуть діяти графіки погодинних відключень'.toUpperCase();
    const phrase4: string = 'діятимуть графіки погодинних відключень'.toUpperCase();

    log('filteringNews', news);
    const hourlyBlackouts: KhoeNewsItem[] = news.filter(
      (item) =>
        item.targetDate &&
        ((item.title.toUpperCase().includes(phrase1) && item.title.toUpperCase().includes(phrase2)) ||
          (item.title.toUpperCase().includes(phrase1) && item.title.toUpperCase().includes(phrase3)) ||
          (item.title.toUpperCase().includes(phrase1) && item.title.toUpperCase().includes(phrase4)))
    );

    const { todayDate, tomorrowDate } = getTodayAndTomorrowDate();
    log('dates', todayDate, tomorrowDate);
    const todayAndTomorrowNews = hourlyBlackouts.filter(
      (item) => item.targetDate?.targetDate === todayDate || item.targetDate?.targetDate === tomorrowDate
    );

    return todayAndTomorrowNews;
  }

  private parseSchedule = (newsItem: KhoeNewsItem): ParsedScheduleString[] | null => {
    if (!newsItem?.text?.length) return null;

    // Convert to JSON string (for handling invisible characters)
    const stringifiedLines = JSON.stringify(newsItem.text);

    // Parse the stringified lines back into an array
    let parsedLines: string[] = JSON.parse(stringifiedLines);
    log('parsedLines', parsedLines);
    const regex: RegExp = /^\d+\.(?:\d+|[ІI]{1,2})\s*.*$/;

    // Filter lines that match the pattern
    let filteredLines: string[] = parsedLines.filter((line) => regex.test(line));

    const offlineHours: ParsedScheduleString[] = [];

    filteredLines.forEach((line) => {
      log('parsing_line', line);
      const queues: string[] | null = parseQueueNumbers(line);
      log('queues_parsed', queues);
      const allTimeMatches = [...line.matchAll(/(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/g)];
      log('allTimeMatches', allTimeMatches);
      if (!queues || !allTimeMatches?.length) return;

      queues.forEach((queue) => {
        allTimeMatches.forEach((timeMatch) => {
          let [_, startTime, endTime] = timeMatch;

          // Only convert 00: to 24:00 if startTime is not also 00: (midnight crossing)
          // Events never cross midnight, so cap at exactly 24:00
          if (endTime.startsWith('00:') && !startTime.startsWith('00:')) {
            endTime = '24:00';
          }

          offlineHours.push({ queue, startTime, endTime });
        });
      });
    });

    return offlineHours;
  };

  parseNewsItemText = (news: KhoeNewsItem): IParsedMessage | null => {
    if (!news.targetDate) return null;
    const { targetDate, rawDateObj } = news.targetDate;
    log('TargetDate', targetDate);
    const parsedSchedule: ParsedScheduleString[] | null = this.parseSchedule(news);
    log('parsedSchedule', parsedSchedule);
    if (!parsedSchedule) return null;

    const groupedByQueue: GroupByQueueResult = groupByQueue(parsedSchedule);
    log('groupedByQueue', groupedByQueue);
    const eventsList: IEoffEvent[] | void = convertToEvents(groupedByQueue, targetDate, this.provider);
    log('eventsList', eventsList);
    if (!eventsList) return null;
    return { targetDate, eventsList };
  };

  convertNewsToEvents(news: KhoeNewsItem[]) {
    this.daysScheduleData = {};

    news.forEach((item) => {
      if (item.text) {
        const parsedMessage: IParsedMessage | null = this.parseNewsItemText(item);

        if (!parsedMessage?.targetDate) {
          return;
        }

        this.daysScheduleData[parsedMessage.targetDate] = parsedMessage.eventsList || [];
      }
    });

    const { todayDate, tomorrowDate } = getTodayAndTomorrowDate();
    const result: ISchedule = { events: [], hasTodayData: false, hasTomorrowData: false };

    if (this.daysScheduleData[todayDate]) {
      result.events = [...result.events, ...this.daysScheduleData[todayDate]];
      result.hasTodayData = true;
    }

    if (this.daysScheduleData[tomorrowDate]) {
      result.events = [...result.events, ...this.daysScheduleData[tomorrowDate]];
      result.hasTomorrowData = true;
    }

    result.events.sort(sortOutputEvents);

    log('final_res', result);
    return result;
  }
}

export const khoeParser = new KhoeParser();
