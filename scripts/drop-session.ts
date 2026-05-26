/**
 * scripts/drop-session.ts — safely remove one or more sessions.
 *
 * Closes the DB record first (stops the sweep from waking it), then
 * deletes the session directory. The two steps are always done in that
 * order so a crash between them leaves an orphaned directory rather
 * than an active DB record with no directory (the worse failure mode).
 *
 * Usage:
 *   # Drop a specific session by ID
 *   pnpm exec tsx scripts/drop-session.ts <session-id>
 *
 *   # Drop all sessions for an agent group
 *   pnpm exec tsx scripts/drop-session.ts --group <agent-group-id>
 *
 *   # Drop every session whose directory is missing (orphaned DB records)
 *   # or whose DB record is closed/missing (orphaned directories)
 *   pnpm exec tsx scripts/drop-session.ts --orphaned
 *
 *   # Preview without making changes
 *   pnpm exec tsx scripts/drop-session.ts --orphaned --dry-run
 */
import fs from 'node:fs';
import path from 'node:path';

import { DATA_DIR } from '../src/config.js';
import { initDb } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrations/index.js';

const V2_DB = path.join(DATA_DIR, 'v2.db');
const SESSIONS_DIR = path.join(DATA_DIR, 'v2-sessions');

const db = initDb(V2_DB);
runMigrations(db);

interface SessionRow {
  id: string;
  agent_group_id: string;
  status: string;
  container_status: string;
}

function allSessions(): SessionRow[] {
  return db.prepare('SELECT id, agent_group_id, status, container_status FROM sessions').all() as SessionRow[];
}

function sessionDir(agentGroupId: string, sessionId: string): string {
  return path.join(SESSIONS_DIR, agentGroupId, sessionId);
}

function closeInDb(sessionId: string, dry: boolean): void {
  if (dry) return;
  db.prepare(
    "UPDATE sessions SET status = 'closed', container_status = 'stopped' WHERE id = ?",
  ).run(sessionId);
}

function deleteDir(dir: string, dry: boolean): void {
  if (!fs.existsSync(dir)) return;
  if (dry) return;
  fs.rmSync(dir, { recursive: true, force: true });
}

function drop(session: SessionRow, dry: boolean): void {
  const dir = sessionDir(session.agent_group_id, session.id);
  const dirExists = fs.existsSync(dir);
  const prefix = dry ? '[dry-run] would drop' : 'dropping';
  console.log(
    `${prefix} ${session.id} (group: ${session.agent_group_id}, status: ${session.status}, dir: ${dirExists ? 'exists' : 'missing'})`,
  );
  closeInDb(session.id, dry);
  deleteDir(dir, dry);
}

// ---- arg parsing ----

const argv = process.argv.slice(2);
const dry = argv.includes('--dry-run');
const args = argv.filter((a) => a !== '--dry-run');

if (args.length === 0) {
  console.error(
    'usage: pnpm exec tsx scripts/drop-session.ts <session-id|--group <id>|--orphaned> [--dry-run]',
  );
  process.exit(1);
}

const sessions = allSessions();

if (args[0] === '--orphaned') {
  // DB records that have no directory on disk
  const missingDir = sessions.filter(
    (s) => s.status === 'active' && !fs.existsSync(sessionDir(s.agent_group_id, s.id)),
  );

  // Directories on disk that have no active DB record
  const knownActiveIds = new Set(sessions.filter((s) => s.status === 'active').map((s) => s.id));
  const orphanedDirs: { agentGroupId: string; sessionId: string; dir: string }[] = [];
  if (fs.existsSync(SESSIONS_DIR)) {
    for (const groupFolder of fs.readdirSync(SESSIONS_DIR)) {
      const groupPath = path.join(SESSIONS_DIR, groupFolder);
      if (!fs.statSync(groupPath).isDirectory()) continue;
      for (const sessFolder of fs.readdirSync(groupPath)) {
        if (sessFolder.startsWith('.')) continue;
        if (!/^(sess-\d+-[a-z0-9]+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.test(sessFolder)) continue;
        const sessPath = path.join(groupPath, sessFolder);
        if (!fs.statSync(sessPath).isDirectory()) continue;
        if (!knownActiveIds.has(sessFolder)) {
          orphanedDirs.push({ agentGroupId: groupFolder, sessionId: sessFolder, dir: sessPath });
        }
      }
    }
  }

  if (missingDir.length === 0 && orphanedDirs.length === 0) {
    console.log('No orphaned sessions found.');
    process.exit(0);
  }

  for (const s of missingDir) drop(s, dry);

  for (const { agentGroupId, sessionId, dir } of orphanedDirs) {
    const prefix = dry ? '[dry-run] would remove' : 'removing';
    console.log(`${prefix} orphaned directory ${dir} (no active DB record for ${sessionId})`);
    if (!dry) fs.rmSync(dir, { recursive: true, force: true });
  }
} else if (args[0] === '--group') {
  const groupId = args[1];
  if (!groupId) {
    console.error('--group requires an agent-group-id argument');
    process.exit(1);
  }
  const targets = sessions.filter((s) => s.agent_group_id === groupId);
  if (targets.length === 0) {
    console.log(`No sessions found for group "${groupId}".`);
    process.exit(0);
  }
  for (const s of targets) drop(s, dry);
} else {
  const sessionId = args[0];
  const target = sessions.find((s) => s.id === sessionId);
  if (!target) {
    // Session not in DB but directory might exist — clean up the dir anyway
    const globMatch = fs.existsSync(SESSIONS_DIR)
      ? fs.readdirSync(SESSIONS_DIR).flatMap((g) => {
          const p = path.join(SESSIONS_DIR, g, sessionId);
          return fs.existsSync(p) ? [p] : [];
        })
      : [];
    if (globMatch.length === 0) {
      console.log(`Session "${sessionId}" not found in DB or on disk.`);
      process.exit(1);
    }
    for (const dir of globMatch) {
      const prefix = dry ? '[dry-run] would remove' : 'removing';
      console.log(`${prefix} orphaned directory ${dir} (not in DB)`);
      if (!dry) fs.rmSync(dir, { recursive: true, force: true });
    }
  } else {
    drop(target, dry);
  }
}

console.log(dry ? 'Dry run complete — no changes made.' : 'Done.');
