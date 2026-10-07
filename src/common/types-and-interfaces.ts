import { StringSession } from 'telegram/sessions';
import { EntityLike } from 'telegram/define';

/** Name of the electricity service provider */
export enum ELECTRICITY_PROVIDER {
  CHERKOE = 'CHERKOE',
  KHOE = 'KHOE',
}

export enum ELECTRICITY_STATUS {
  ON = 'on',
  OFF = 'off',
}

export interface IEoffEvent {
  startTime: string; // e.g. "18:00"
  endTime: string; // e.g. "18:00"
  queue: string; // e.g. "2"
  date: string; // e.g. "2024-09-02"
  electricity: ELECTRICITY_STATUS; // "on"/"off"
  provider: ELECTRICITY_PROVIDER; // "CHERKOE"
}

export interface ISchedule {
  events: IEoffEvent[];
  hasTodayData: boolean;
  hasTomorrowData: boolean;
}

export interface IConfig {
  telegram: {
    apiId: number;
    apiHash: string;
    stringSession: StringSession | string;
    cherkoeChannel: EntityLike;
    MESSAGES_LIMIT: number;
    messageSource: string;
  };
  ukrProxy: {
    apiKey?: string;
    url?: string;
  };
}

export interface ITargetDateObject {
  targetDate: string;
  rawDateObj: { day: number; year: number; name: string; index: number };
}

export interface EoffEvent {
  startTime: string; // e.g. "18:00"
  endTime: string; // e.g. "18:00"
  queue: string; // e.g. "2"
  date: string; // e.g. "2024-09-02"
  electricity: string; // "on"/"off"
  provider: string; // "CHERKOE"
}

export interface ParsedScheduleString {
  queue: string;
  startTime: string;
  endTime: string;
}

export interface GroupByQueueResult {
  [queue: string]: { startTime: string; endTime: string }[];
}

export interface IParsedMessage {
  targetDate: string | null;
  eventsList: void | IEoffEvent[];
}

export interface KhoeNewsHeaderItem {
  title: string;
  url: string;
}

export interface KhoeNewsItem extends KhoeNewsHeaderItem {
  targetDate?: null | ITargetDateObject;
  text?: null | Array<String>;
}
