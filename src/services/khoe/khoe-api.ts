import { KhoeNewsHeaderItem, KhoeNewsItem } from '../../common/types-and-interfaces';
import * as cheerio from 'cheerio';
import { fetchWithUkrProxy, log } from '../../common/utils';
import axios from 'axios';

const BASE_URL = 'https://www.oblenergo.kharkov.ua';

// Uncomment intercepros for network requests debugging
// // Using axios interceptors
// axios.interceptors.request.use((config) => {
//   console.log('➡️ Request:', config.method?.toUpperCase(), config.url);
//   console.log('   Headers:', config.headers);
//   console.log('   Params:', config.params);
//   return config;
// });
//
// axios.interceptors.response.use(
//   (response) => {
//     console.log('✅ Response:', response.status, response.config.url);
//     return response;
//   },
//   (error) => {
//     console.log('❌ Error:', error.response?.status, error.config?.url);
//     return Promise.reject(error);
//   }
// );ﬁ

export class KhoeApi {
  constructor() {}

  async fetchOnePageNewsHeaders(pageNumber: number): Promise<KhoeNewsHeaderItem[]> {
    const pageUrl = `${BASE_URL}/uk?page=${pageNumber}`;

    const { data: html } = await fetchWithUkrProxy(pageUrl);
    const $ = cheerio.load(html);

    const news: KhoeNewsHeaderItem[] = [];

    $('.view-id-novyny .view-content tr').each((_, row) => {
      const link = $(row).find('td.views-field-title a, td.news-mobile-href a').first();
      const title = link.text().trim();
      const url = link.attr('href');

      if (title && url) {
        news.push({ title, url });
      }
    });

    return news;
  }

  async fetchAllNewsHeaders(): Promise<KhoeNewsHeaderItem[]> {
    const results = await Promise.all([
      this.fetchOnePageNewsHeaders(0),
      this.fetchOnePageNewsHeaders(1),
      this.fetchOnePageNewsHeaders(2),
    ]);

    return results.flat().sort((a, b) => {
      const idA = parseInt(a.url.match(/\d+$/)?.[0] ?? '0');
      const idB = parseInt(b.url.match(/\d+$/)?.[0] ?? '0');
      return idA - idB;
    });
  }

  async fetchOneNewsDetails(item: KhoeNewsItem) {
    const url = `${BASE_URL}${item.url}`;
    log('fetching_details', url);

    const { data: html } = await fetchWithUkrProxy(url);

    const scheduleText = this.extractScheduleLines(html);

    log('scheduleText', scheduleText);

    return {
      path: item.url,
      text: scheduleText,
    };
  }

  extractScheduleLines(html: string): string[] {
    const text = html
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/\s+/g, ' ');

    const pattern = /(\d\.(?:[12]|[IІ]{1,2}))\s+((?:\d{1,2}:\d{2}\s*[-–—]\s*\d{1,2}:\d{2}[\s;,]*)+)/g;

    const results: string[] = [];
    const seen = new Set<string>();
    let match;

    while ((match = pattern.exec(text)) !== null) {
      const queue = match[1].replace(/[IІ]{2}/g, '2').replace(/[IІ]/g, '1');

      if (seen.has(queue)) continue;
      seen.add(queue);

      const timeRanges = match[2].trim().replace(/[;,]\s*$/, '');
      results.push(`${queue} ${timeRanges}`);
    }

    return results.sort((a, b) => parseFloat(a) - parseFloat(b));
  }

  async injectNewsDetails(news: KhoeNewsItem[]): Promise<KhoeNewsItem[]> {
    const allDetails = await Promise.all(news.map((item) => this.fetchOneNewsDetails(item)));
    log('all_news', news);
    log('all_details', allDetails);
    return news.map((newsItem: KhoeNewsItem) => {
      const details = allDetails.find((detail) => detail.path === newsItem.url);
      if (details) {
        newsItem.text = details.text;
      }

      return newsItem;
    });
  }
}

export const khoeApi = new KhoeApi();
