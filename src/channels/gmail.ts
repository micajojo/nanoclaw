import fs from 'fs';
import os from 'os';
import path from 'path';

import { google, gmail_v1 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

import { log } from '../log.js';
import type { ChannelAdapter, ChannelSetup, InboundMessage, OutboundMessage } from './adapter.js';
import { registerChannelAdapter } from './channel-registry.js';

interface ThreadMeta {
  sender: string;
  senderName: string;
  subject: string;
  messageId: string; // RFC 2822 Message-ID for In-Reply-To
}

function createGmailAdapter(): ChannelAdapter | null {
  const credDir = path.join(os.homedir(), '.gmail-mcp');
  const keysPath = path.join(credDir, 'gcp-oauth.keys.json');
  const tokensPath = path.join(credDir, 'credentials.json');

  if (!fs.existsSync(keysPath) || !fs.existsSync(tokensPath)) {
    log.warn('Gmail: credentials not found in ~/.gmail-mcp/ — skipping');
    return null;
  }

  let oauth2Client: OAuth2Client | null = null;
  let gmail: gmail_v1.Gmail | null = null;
  let userEmail = '';
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let consecutiveErrors = 0;
  const processedIds = new Set<string>();
  const threadMeta = new Map<string, ThreadMeta>();
  const POLL_INTERVAL_MS = 60_000;

  function buildQuery(): string {
    return 'is:unread category:primary';
  }

  function extractTextBody(payload: gmail_v1.Schema$MessagePart | undefined): string {
    if (!payload) return '';
    if (payload.mimeType === 'text/plain' && payload.body?.data) {
      return Buffer.from(payload.body.data, 'base64').toString('utf-8');
    }
    if (payload.parts) {
      for (const part of payload.parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          return Buffer.from(part.body.data, 'base64').toString('utf-8');
        }
      }
      for (const part of payload.parts) {
        const text = extractTextBody(part);
        if (text) return text;
      }
    }
    return '';
  }

  async function processMessage(messageId: string, config: ChannelSetup): Promise<void> {
    if (!gmail) return;

    const msg = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' });

    const headers = msg.data.payload?.headers || [];
    const getHeader = (name: string) => headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

    const from = getHeader('From');
    const subject = getHeader('Subject');
    const rfc2822MessageId = getHeader('Message-ID');
    const gmailThreadId = msg.data.threadId || messageId;
    const timestamp = new Date(parseInt(msg.data.internalDate || '0', 10)).toISOString();

    const senderMatch = from.match(/^(.+?)\s*<(.+?)>$/);
    const senderName = senderMatch ? senderMatch[1].replace(/"/g, '') : from;
    const senderEmail = senderMatch ? senderMatch[2] : from;

    if (senderEmail === userEmail) return;

    const body = extractTextBody(msg.data.payload);
    if (!body) {
      log.debug('Skipping email with no text body', { messageId, subject });
      return;
    }

    threadMeta.set(gmailThreadId, { sender: senderEmail, senderName, subject, messageId: rfc2822MessageId });

    config.onMetadata(senderEmail, senderName, false);

    const message: InboundMessage = {
      id: messageId,
      kind: 'chat',
      timestamp,
      content: {
        text: `[Email from ${senderName} <${senderEmail}>]\nSubject: ${subject}\n\n${body}`,
        sender: senderEmail,
        senderId: `gmail:${senderEmail}`,
      },
    };

    // Use the inbox owner's email as the stable platformId so all inbound
    // emails route to one messaging group (not one per sender).
    await config.onInbound(`gmail:${userEmail}`, gmailThreadId, message);

    try {
      await gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: { removeLabelIds: ['UNREAD'] },
      });
    } catch (err) {
      log.warn('Failed to mark email as read', { messageId, err });
    }

    log.info('Gmail email delivered', { from: senderName, subject });
  }

  async function pollForMessages(config: ChannelSetup): Promise<void> {
    if (!gmail) return;

    try {
      const res = await gmail.users.messages.list({ userId: 'me', q: buildQuery(), maxResults: 10 });
      const messages = res.data.messages || [];

      for (const stub of messages) {
        if (!stub.id || processedIds.has(stub.id)) continue;
        processedIds.add(stub.id);
        await processMessage(stub.id, config);
      }

      if (processedIds.size > 5000) {
        const ids = [...processedIds];
        processedIds.clear();
        for (const id of ids.slice(ids.length - 2500)) processedIds.add(id);
      }

      consecutiveErrors = 0;
    } catch (err) {
      consecutiveErrors++;
      const backoffMs = Math.min(POLL_INTERVAL_MS * Math.pow(2, consecutiveErrors), 30 * 60 * 1000);
      log.error('Gmail poll failed', { err, consecutiveErrors, nextPollMs: backoffMs });
    }
  }

  const adapter: ChannelAdapter = {
    name: 'gmail',
    channelType: 'gmail',
    supportsThreads: true,

    async setup(config: ChannelSetup): Promise<void> {
      const keys = JSON.parse(fs.readFileSync(keysPath, 'utf-8'));
      const tokens = JSON.parse(fs.readFileSync(tokensPath, 'utf-8'));

      const clientConfig = keys.installed || keys.web || keys;
      const { client_id, client_secret, redirect_uris } = clientConfig;
      oauth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris?.[0]);
      oauth2Client.setCredentials(tokens);

      oauth2Client.on('tokens', (newTokens) => {
        try {
          const current = JSON.parse(fs.readFileSync(tokensPath, 'utf-8'));
          Object.assign(current, newTokens);
          fs.writeFileSync(tokensPath, JSON.stringify(current, null, 2));
          log.debug('Gmail OAuth tokens refreshed');
        } catch (err) {
          log.warn('Failed to persist refreshed Gmail tokens', { err });
        }
      });

      gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      const profile = await gmail.users.getProfile({ userId: 'me' });
      userEmail = profile.data.emailAddress || '';
      log.info('Gmail channel connected', { email: userEmail });

      const schedulePoll = () => {
        const backoffMs =
          consecutiveErrors > 0
            ? Math.min(POLL_INTERVAL_MS * Math.pow(2, consecutiveErrors), 30 * 60 * 1000)
            : POLL_INTERVAL_MS;
        pollTimer = setTimeout(() => {
          pollForMessages(config)
            .catch((err) => log.error('Gmail poll error', { err }))
            .finally(() => {
              if (gmail) schedulePoll();
            });
        }, backoffMs);
      };

      await pollForMessages(config);
      schedulePoll();
    },

    async teardown(): Promise<void> {
      if (pollTimer) {
        clearTimeout(pollTimer);
        pollTimer = null;
      }
      gmail = null;
      oauth2Client = null;
      log.info('Gmail channel stopped');
    },

    isConnected(): boolean {
      return gmail !== null;
    },

    async deliver(platformId: string, threadId: string | null, message: OutboundMessage): Promise<string | undefined> {
      if (!gmail) {
        log.warn('Gmail not initialized');
        return;
      }

      const meta = threadId ? threadMeta.get(threadId) : undefined;
      if (!meta) {
        log.warn('No thread metadata for reply', { platformId, threadId });
        return;
      }

      const content = message.content as { text?: string };
      const text = content?.text ?? String(message.content);
      const subject = meta.subject.startsWith('Re:') ? meta.subject : `Re: ${meta.subject}`;

      const headers = [
        `To: ${meta.sender}`,
        `From: ${userEmail}`,
        `Subject: ${subject}`,
        `In-Reply-To: ${meta.messageId}`,
        `References: ${meta.messageId}`,
        'Content-Type: text/plain; charset=utf-8',
        '',
        text,
      ].join('\r\n');

      const raw = Buffer.from(headers).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

      try {
        const res = await gmail.users.messages.send({
          userId: 'me',
          requestBody: { raw, threadId: threadId ?? undefined },
        });
        log.info('Gmail reply sent', { to: meta.sender, threadId });
        return res.data.id ?? undefined;
      } catch (err) {
        log.error('Failed to send Gmail reply', { platformId, threadId, err });
        return undefined;
      }
    },
  };

  return adapter;
}

registerChannelAdapter('gmail', { factory: createGmailAdapter });
