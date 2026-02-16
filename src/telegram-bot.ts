import fs from 'fs';
import path from 'path';
import https from 'https';
import { logger } from './logger.js';

export interface TelegramConfig {
  bot_token: string;
  chat_id: string;
}

export interface TelegramMessage {
  message_id: number;
  from: {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
  };
  chat: {
    id: number;
    type: string;
  };
  date: number;
  text?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

export class TelegramBot {
  private botToken: string;
  private chatId: string;
  private apiUrl: string;
  private lastUpdateId: number = 0;

  constructor(config: TelegramConfig) {
    this.botToken = config.bot_token;
    this.chatId = config.chat_id;
    this.apiUrl = `https://api.telegram.org/bot${this.botToken}`;
  }

  /**
   * Send a text message to the configured chat
   */
  async sendMessage(text: string): Promise<boolean> {
    try {
      const chunks = this.splitMessage(text);
      for (const chunk of chunks) {
        const ok = await this.sendSingleMessage(chunk);
        if (!ok) return false;
      }
      return true;
    } catch (err) {
      logger.error({ err }, 'Error sending Telegram message');
      return false;
    }
  }

  private async sendSingleMessage(text: string): Promise<boolean> {
    // Try with Markdown first, fall back to plain text if parsing fails
    let response = await this.apiCall('sendMessage', {
      chat_id: this.chatId,
      text: text,
      parse_mode: 'Markdown',
    });

    if (!response.ok && response.description?.includes("can't parse entities")) {
      logger.debug('Markdown parse failed, retrying as plain text');
      response = await this.apiCall('sendMessage', {
        chat_id: this.chatId,
        text: text,
      });
    }

    if (response.ok) {
      logger.info({ chatId: this.chatId, length: text.length }, 'Telegram message sent');
      return true;
    } else {
      logger.error({ error: response.description }, 'Failed to send Telegram message');
      return false;
    }
  }

  private splitMessage(text: string, maxLen = 4000): string[] {
    if (text.length <= maxLen) return [text];

    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= maxLen) {
        chunks.push(remaining);
        break;
      }

      // Find a good split point: prefer double newline, then single newline, then space
      let splitAt = remaining.lastIndexOf('\n\n', maxLen);
      if (splitAt < maxLen * 0.3) splitAt = remaining.lastIndexOf('\n', maxLen);
      if (splitAt < maxLen * 0.3) splitAt = remaining.lastIndexOf(' ', maxLen);
      if (splitAt < maxLen * 0.3) splitAt = maxLen;

      chunks.push(remaining.slice(0, splitAt).trimEnd());
      remaining = remaining.slice(splitAt).trimStart();
    }

    return chunks;
  }

  /**
   * Send typing indicator
   */
  async sendTyping(): Promise<void> {
    try {
      await this.apiCall('sendChatAction', {
        chat_id: this.chatId,
        action: 'typing',
      });
    } catch (err) {
      logger.debug({ err }, 'Failed to send typing indicator');
    }
  }

  /**
   * Get updates from Telegram (long polling)
   */
  async getUpdates(timeout: number = 30): Promise<TelegramUpdate[]> {
    try {
      const response = await this.apiCall('getUpdates', {
        offset: this.lastUpdateId + 1,
        timeout: timeout,
        allowed_updates: ['message'],
      });

      if (response.ok && Array.isArray(response.result)) {
        const updates = response.result as TelegramUpdate[];

        // Update the last update ID
        if (updates.length > 0) {
          this.lastUpdateId = updates[updates.length - 1].update_id;
        }

        return updates;
      }

      return [];
    } catch (err) {
      logger.error({ err }, 'Error getting Telegram updates');
      return [];
    }
  }

  /**
   * Make an API call to Telegram Bot API
   */
  private async apiCall(method: string, params: Record<string, any>): Promise<any> {
    return new Promise((resolve, reject) => {
      const url = `${this.apiUrl}/${method}`;
      const postData = JSON.stringify(params);

      const options: https.RequestOptions = {
        method: 'POST',
        family: 4, // Force IPv4 — IPv6 to Telegram is unreachable on this network
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
      };

      const req = https.request(url, options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed);
          } catch (err) {
            reject(new Error(`Failed to parse response: ${data}`));
          }
        });
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.write(postData);
      req.end();
    });
  }

  /**
   * Test the bot connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await this.apiCall('getMe', {});
      if (response.ok) {
        logger.info({ botInfo: response.result }, 'Telegram bot connected successfully');
        return true;
      }
      return false;
    } catch (err) {
      logger.error({ err }, 'Failed to connect to Telegram');
      return false;
    }
  }

  /**
   * Load configuration from file
   */
  static loadConfig(configPath: string): TelegramConfig | null {
    try {
      const data = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(data);

      if (!config.bot_token || !config.chat_id) {
        logger.error('Invalid Telegram config: missing bot_token or chat_id');
        return null;
      }

      return {
        bot_token: config.bot_token,
        chat_id: config.chat_id,
      };
    } catch (err) {
      logger.error({ err, configPath }, 'Failed to load Telegram config');
      return null;
    }
  }
}
