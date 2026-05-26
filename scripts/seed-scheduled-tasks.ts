/**
 * Seeds the 5 scheduled tasks for research and investment agents.
 * Run once: pnpm exec tsx scripts/seed-scheduled-tasks.ts
 */
import Database from 'better-sqlite3';
import { CronExpressionParser } from 'cron-parser';
import { randomBytes } from 'crypto';
import path from 'path';

import { insertMessage } from '../src/db/session-db.js';

const TIMEZONE = 'UTC';
const DATA_DIR = path.resolve(import.meta.dirname, '../data');

function taskId(): string {
  return `task-${Date.now()}-${randomBytes(3).toString('hex')}`;
}

function nextOccurrence(cron: string): string {
  return CronExpressionParser.parse(cron, { tz: TIMEZONE }).next().toISOString();
}

function insertTask(
  db: Database.Database,
  opts: { prompt: string; recurrence: string; platformId: string; channelType: string; threadId: string },
): void {
  const id = taskId();
  const processAfter = nextOccurrence(opts.recurrence);
  console.log(`  Inserting: ${id}`);
  console.log(`  Next run:  ${processAfter}`);
  insertMessage(db, {
    id,
    kind: 'task',
    timestamp: new Date().toISOString(),
    platformId: opts.platformId,
    channelType: opts.channelType,
    threadId: opts.threadId,
    content: JSON.stringify({ prompt: opts.prompt }),
    processAfter,
    recurrence: opts.recurrence,
  });
}

// ── Research Agent ────────────────────────────────────────────────────────────
const researchDb = new Database(
  path.join(DATA_DIR, 'v2-sessions/research/sess-1779714215279-fva4g6/inbound.db'),
);
const researchChannel = {
  platformId: 'discord:1508444746018853064:1508453832441462784',
  channelType: 'discord',
  threadId: 'discord:1508444746018853064:1508453832441462784',
};

console.log('\n[Research Agent] Research Digest (daily 3am UTC)');
insertTask(researchDb, {
  prompt:
    'Research Digest: Collect and summarize the latest academic papers, news, and developments relevant to GeoAI, spatial epidemiology, humanitarian health systems, and conflict-related health access. Focus on preprints, new publications, and significant policy/field updates. Organize by theme. Send the digest to the research Discord channel.',
  recurrence: '0 3 * * *',
  ...researchChannel,
});

console.log('\n[Research Agent] Weekly PhD Synthesis (Fridays noon UTC)');
insertTask(researchDb, {
  prompt:
    "Weekly PhD Synthesis: Synthesize the week's research findings, identify emerging themes, and highlight how they connect to the PhD focus on GeoAI for surgical care access in humanitarian and conflict settings. Note any gaps, contradictions, or promising new directions. Include relevant new papers or reports. Send the synthesis to the research Discord channel.",
  recurrence: '0 12 * * 5',
  ...researchChannel,
});

console.log('\n[Research Agent] Violence Report (daily 4pm UTC)');
insertTask(researchDb, {
  prompt:
    'Violence Report: Search for significant conflict events, armed violence incidents, and humanitarian crises reported in the last 24 hours. Summarize events that may affect healthcare access or humanitarian operations. Include key regions, casualty estimates where available, and any changes to conflict dynamics. Send the report to the research Discord channel.',
  recurrence: '0 16 * * *',
  ...researchChannel,
});

researchDb.close();

// ── Investment Agent ──────────────────────────────────────────────────────────
const investmentDb = new Database(
  path.join(DATA_DIR, 'v2-sessions/investment/sess-1779714231891-ak4vhk/inbound.db'),
);
const investmentChannel = {
  platformId: 'discord:1508444746018853064:1508453895792234637',
  channelType: 'discord',
  threadId: 'discord:1508444746018853064:1508453895792234637',
};

console.log('\n[Investment Agent] Korean Stocks (Sundays noon UTC)');
insertTask(investmentDb, {
  prompt:
    'Korean Stock Market Weekly Analysis: Review the KOSPI and KOSDAQ performance for the past week. Identify top gaining and declining sectors and notable individual stocks. Summarize key economic news, earnings announcements, and market-moving events in Korea. Send a structured analysis to the investment Discord channel. Email a copy to jojobtd@icloud.com with subject "Korean Stock Weekly" and save a copy to stock_analysis/korea-YYYY-MM-DD.md.',
  recurrence: '0 12 * * 0',
  ...investmentChannel,
});

console.log('\n[Investment Agent] US Stocks (Saturdays noon UTC)');
insertTask(investmentDb, {
  prompt:
    'US Stock Market Weekly Analysis: Review S&P 500, NASDAQ, and Dow performance for the past week. Identify top sectors, major movers, and macro themes (Fed signals, earnings, economic data). Note any significant geopolitical or regulatory developments affecting markets. Send a structured analysis to the investment Discord channel. Email a copy to jojobtd@icloud.com with subject "US Stock Weekly" and save a copy to stock_analysis/us-YYYY-MM-DD.md.',
  recurrence: '0 12 * * 6',
  ...investmentChannel,
});

investmentDb.close();

console.log('\nDone. All 5 tasks seeded.');
