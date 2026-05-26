/**
 * One-shot script: creates Sitrep Agent group, wires it to #sitrep Discord channel,
 * creates a session, moves the ebola sitrep + violence report tasks from Research Agent.
 */
import Database from 'better-sqlite3';
import { CronExpressionParser } from 'cron-parser';
import { randomBytes } from 'crypto';
import fs from 'fs';
import path from 'path';

import { ensureSchema, insertMessage } from '../src/db/session-db.js';

const TIMEZONE = 'UTC';
const DATA_DIR = path.resolve(import.meta.dirname, '../data');
const CENTRAL_DB = path.join(DATA_DIR, 'v2.db');

const GUILD_ID = '1508444746018853064';
const SITREP_CHANNEL_ID = '1508548130126434565';
const SITREP_PLATFORM_ID = `discord:${GUILD_ID}:${SITREP_CHANNEL_ID}`;

const RESEARCH_SESSION_ID = 'sess-1779714215279-fva4g6';
const RESEARCH_INBOUND = path.join(DATA_DIR, `v2-sessions/research/${RESEARCH_SESSION_ID}/inbound.db`);

// Task IDs to remove from Research Agent
const EBOLA_TASK_ID = 'task-1779718392574-qgm5q1';
const VIOLENCE_TASK_ID = 'task-1779724815485-1m72d8';

function taskId(): string {
  return `task-${Date.now()}-${randomBytes(3).toString('hex')}`;
}

function nextOccurrence(cron: string): string {
  return CronExpressionParser.parse(cron, { tz: TIMEZONE }).next().toISOString();
}

// ── 1. Central DB: agent group, container config, messaging group, wiring ────
const central = new Database(CENTRAL_DB);
central.pragma('journal_mode = DELETE');

console.log('\n[1] Creating Sitrep Agent group...');
central
  .prepare(
    `INSERT OR IGNORE INTO agent_groups (id, name, folder, created_at)
     VALUES ('sitrep', 'Sitrep Agent', 'sitrep', datetime('now'))`,
  )
  .run();

console.log('[2] Creating container config...');
central
  .prepare(
    `INSERT OR IGNORE INTO container_configs
       (agent_group_id, skills, mcp_servers, packages_apt, packages_npm, additional_mounts, updated_at, cli_scope)
     VALUES ('sitrep', '"all"', '{}', '[]', '[]', '[]', datetime('now'), 'group')`,
  )
  .run();

console.log('[3] Creating Discord messaging group for #sitrep...');
central
  .prepare(
    `INSERT OR IGNORE INTO messaging_groups (id, channel_type, platform_id, name, is_group, unknown_sender_policy, created_at)
     VALUES ('discord-${SITREP_CHANNEL_ID}', 'discord', ?, 'Discord Sitrep', 1, 'public', datetime('now'))`,
  )
  .run(SITREP_PLATFORM_ID);

console.log('[4] Wiring messaging group to Sitrep Agent...');
central
  .prepare(
    `INSERT OR IGNORE INTO messaging_group_agents
       (id, messaging_group_id, agent_group_id, session_mode, priority, created_at, engage_mode, engage_pattern, sender_scope, ignored_message_policy)
     VALUES (?, 'discord-${SITREP_CHANNEL_ID}', 'sitrep', 'agent-shared', 0, datetime('now'), 'pattern', '.', 'all', 'drop')`,
  )
  .run(randomBytes(16).toString('hex'));

console.log('[5] Creating session...');
const sessionId = `sess-${Date.now()}-${randomBytes(3).toString('hex')}`;
central
  .prepare(
    `INSERT OR IGNORE INTO sessions
       (id, agent_group_id, messaging_group_id, thread_id, status, container_status, created_at)
     VALUES (?, 'sitrep', 'discord-${SITREP_CHANNEL_ID}', ?, 'active', 'stopped', datetime('now'))`,
  )
  .run(sessionId, SITREP_PLATFORM_ID);
central.close();

console.log(`   Session ID: ${sessionId}`);

// ── 2. Create session directory + initialize DBs ──────────────────────────────
const sessionDir = path.join(DATA_DIR, 'v2-sessions/sitrep', sessionId);
fs.mkdirSync(sessionDir, { recursive: true });
console.log(`\n[6] Created session directory: ${sessionDir}`);

const inboundPath = path.join(sessionDir, 'inbound.db');
const outboundPath = path.join(sessionDir, 'outbound.db');

ensureSchema(inboundPath, 'inbound');
ensureSchema(outboundPath, 'outbound');

// ── 3. Seed tasks into sitrep inbound.db ─────────────────────────────────────
const inDb = new Database(inboundPath);
inDb.pragma('journal_mode = DELETE');

console.log('\n[7] Seeding Ebola sitrep task (daily 5am UTC)...');
const ebolaRecurrence = '0 5 * * *';
const ebolaProcessAfter = nextOccurrence(ebolaRecurrence);
console.log(`   Next run: ${ebolaProcessAfter}`);
insertMessage(inDb, {
  id: taskId(),
  kind: 'task',
  timestamp: new Date().toISOString(),
  platformId: SITREP_PLATFORM_ID,
  channelType: 'discord',
  threadId: SITREP_PLATFORM_ID,
  content: JSON.stringify({
    prompt:
      'Produce a daily Ebola situation report (sitrep) and send it to the channel. ' +
      'The report must be written in both French and English — present the full report in English first, then the full report in French.',
  }),
  processAfter: ebolaProcessAfter,
  recurrence: ebolaRecurrence,
});

console.log('\n[8] Seeding KVR task (daily 4pm UTC)...');
const kvrRecurrence = '0 16 * * *';
const kvrProcessAfter = nextOccurrence(kvrRecurrence);
console.log(`   Next run: ${kvrProcessAfter}`);
insertMessage(inDb, {
  id: taskId(),
  kind: 'task',
  timestamp: new Date().toISOString(),
  platformId: SITREP_PLATFORM_ID,
  channelType: 'discord',
  threadId: SITREP_PLATFORM_ID,
  content: JSON.stringify({
    prompt:
      'Search Korean news sources (네이버뉴스, 연합뉴스, 한겨레, 경향신문) for significant incidents of violence against women ' +
      'in South Korea reported in the last 24 hours. Write a structured situation report in Korean followed by a brief English summary. ' +
      'Post to this channel, then post to Blogger using the blogger-post script.',
  }),
  processAfter: kvrProcessAfter,
  recurrence: kvrRecurrence,
});

inDb.close();

// ── 4. Cancel tasks in Research Agent session ─────────────────────────────────
console.log('\n[9] Cancelling tasks in Research Agent...');
const researchDb = new Database(RESEARCH_INBOUND);
researchDb.pragma('journal_mode = DELETE');
const cancelled = researchDb
  .prepare(`UPDATE messages_in SET status = 'cancelled' WHERE id IN (?, ?)`)
  .run(EBOLA_TASK_ID, VIOLENCE_TASK_ID);
console.log(`   Cancelled ${cancelled.changes} task(s)`);
researchDb.close();

console.log('\n✓ Done. Sitrep Agent created with session:', sessionId);
console.log('  Restart nanoclaw to activate the new agent group.');
