import 'dotenv/config';
import { StringSession } from 'telegram/sessions/index.js';
import { IConfig } from './common/types-and-interfaces';

const config: IConfig = {
  telegram: {
    apiId: parseInt(process.env.TELEGRAM_APP_ID || ''),
    apiHash: process.env.TELEGRAM_API_HASH || '',
    stringSession: new StringSession(process.env.TELEGRAM_SESSION_STRING || ''), // Empty string for new session
    cherkoeChannel: process.env.TELEGRAM_CHERKOE_CHANNEL_NAME || 'pat_cherkasyoblenergo', //channel to listen
    MESSAGES_LIMIT: parseInt(process.env.MESSAGES_LIMIT || '') || 30,
    messageSource: process.env.TELEGRAM_MESSAGE_SOURCE || 'TG_CLIENT',
  },
  ukrProxy: {
    //config for UkrProxy - we use it for calls whic are not available from cloud directly
    apiKey: process.env.UKR_PROXY_API_KEY,
    url: process.env.UKR_PROXY_URL,
  },
};

export default config;
