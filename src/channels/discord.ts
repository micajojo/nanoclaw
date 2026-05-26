/**
 * Discord channel adapter(s) (v2) — uses Chat SDK bridge.
 * Self-registers on import.
 *
 * Supports multiple named bot instances via DISCORD_BOT_NAMES (comma-separated).
 * Each name "foo" reads DISCORD_FOO_BOT_TOKEN / DISCORD_FOO_PUBLIC_KEY /
 * DISCORD_FOO_APPLICATION_ID and registers as channel type "discord-foo".
 * Messaging groups must have their channel_type set to "discord-foo" to route
 * through that bot.
 */
import { createDiscordAdapter } from '@chat-adapter/discord';

import { readEnvFile } from '../env.js';
import { createChatSdkBridge, type ReplyContext } from './chat-sdk-bridge.js';
import { registerChannelAdapter } from './channel-registry.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractReplyContext(raw: Record<string, any>): ReplyContext | null {
  if (!raw.referenced_message) return null;
  const reply = raw.referenced_message;
  return {
    text: reply.content || '',
    sender: reply.author?.global_name || reply.author?.username || 'Unknown',
  };
}

function makeBridge(botToken: string, publicKey?: string, applicationId?: string) {
  return createChatSdkBridge({
    adapter: createDiscordAdapter({ botToken, publicKey, applicationId }),
    concurrency: 'concurrent',
    botToken,
    extractReplyContext,
    supportsThreads: true,
  });
}

// Default Discord bot — channel type "discord"
registerChannelAdapter('discord', {
  factory: () => {
    const env = readEnvFile(['DISCORD_BOT_TOKEN', 'DISCORD_PUBLIC_KEY', 'DISCORD_APPLICATION_ID']);
    if (!env.DISCORD_BOT_TOKEN) return null;
    return makeBridge(env.DISCORD_BOT_TOKEN, env.DISCORD_PUBLIC_KEY, env.DISCORD_APPLICATION_ID);
  },
});

// Named Discord bots — set DISCORD_BOT_NAMES=research,investment,assistant in .env
// Each registers as channel type "discord-<name>".
const { DISCORD_BOT_NAMES } = readEnvFile(['DISCORD_BOT_NAMES']);
for (const name of (DISCORD_BOT_NAMES ?? '')
  .split(',')
  .map((n) => n.trim())
  .filter(Boolean)) {
  const upper = name.toUpperCase();
  const channelType = `discord-${name.toLowerCase()}`;
  registerChannelAdapter(channelType, {
    factory: () => {
      const env = readEnvFile([
        `DISCORD_${upper}_BOT_TOKEN`,
        `DISCORD_${upper}_PUBLIC_KEY`,
        `DISCORD_${upper}_APPLICATION_ID`,
      ]);
      if (!env[`DISCORD_${upper}_BOT_TOKEN`]) return null;
      const bridge = makeBridge(
        env[`DISCORD_${upper}_BOT_TOKEN`]!,
        env[`DISCORD_${upper}_PUBLIC_KEY`],
        env[`DISCORD_${upper}_APPLICATION_ID`],
      );
      // Override so routing uses the named type, not generic "discord"
      bridge.channelType = channelType;
      bridge.name = channelType;
      return bridge;
    },
  });
}
