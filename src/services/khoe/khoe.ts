import { KhoeNewsItem } from '../../common/types-and-interfaces';
import { khoeParser } from './khoe-parser';
import { khoeApi } from './khoe-api';
import { getTargetDate, log } from '../../common/utils';

export class KhoeService {
  constructor() {}

  async getSchedule() {
    const allNews = await khoeApi.fetchAllNewsHeaders();

    const formattedNews: KhoeNewsItem[] = allNews.map((item) => ({
      ...item,
      targetDate: getTargetDate(item.title),
    }));

    const filteredNews = khoeParser.filterOnlyTodayAndTomorrowNews(formattedNews);
    log('filteredNews', filteredNews);
    const enrichedNews = await khoeApi.injectNewsDetails(filteredNews);
    log('enrichedNews', enrichedNews);

    return khoeParser.convertNewsToEvents(enrichedNews);
  }
}

export const khoeService = new KhoeService();
