import { exec, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

import { CronExpressionParser } from 'cron-parser';

import {
  ASSISTANT_NAME,
  DATA_DIR,
  IPC_POLL_INTERVAL,
  MAIN_GROUP_FOLDER,
  POLL_INTERVAL,
  TIMEZONE,
} from './config.js';
import {
  AgentResponse,
  AvailableGroup,
  runContainerAgent,
  writeGroupsSnapshot,
  writeTasksSnapshot,
} from './container-runner.js';
import {
  createTask,
  deleteTask,
  getAllChats,
  getAllRegisteredGroups,
  getAllSessions,
  getAllTasks,
  getLastGroupSync,
  getMessagesSince,
  getNewMessages,
  getRouterState,
  getTaskById,
  initDatabase,
  setLastGroupSync,
  setRegisteredGroup,
  setRouterState,
  setSession,
  storeChatMetadata,
  storeRawMessage,
  updateChatName,
  updateTask,
} from './db.js';
import { GroupQueue } from './group-queue.js';
import { startSchedulerLoop } from './task-scheduler.js';
import { RegisteredGroup } from './types.js';
import { logger } from './logger.js';
import { TelegramBot, TelegramUpdate, TelegramMessage } from './telegram-bot.js';

const GROUP_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

let telegramBot: TelegramBot;
let lastTimestamp = '';
let sessions: Record<string, string> = {};
let registeredGroups: Record<string, RegisteredGroup> = {};
let lastAgentTimestamp: Record<string, string> = {};
// Guards to prevent duplicate loops
let messageLoopRunning = false;
let ipcWatcherRunning = false;
let groupSyncTimerStarted = false;

const queue = new GroupQueue();

// For Telegram, we use a fixed chat JID (since it's a private bot)
const TELEGRAM_CHAT_JID = 'telegram_private_chat';

async function setTyping(isTyping: boolean): Promise<void> {
  try {
    if (isTyping) {
      await telegramBot.sendTyping();
    }
  } catch (err) {
    logger.debug({ err }, 'Failed to update typing status');
  }
}

function loadState(): void {
  // Load from SQLite (migration from JSON happens in initDatabase)
  lastTimestamp = getRouterState('last_timestamp') || '';
  const agentTs = getRouterState('last_agent_timestamp');
  try {
    lastAgentTimestamp = agentTs ? JSON.parse(agentTs) : {};
  } catch {
    logger.warn('Corrupted last_agent_timestamp in DB, resetting');
    lastAgentTimestamp = {};
  }
  sessions = getAllSessions();
  registeredGroups = getAllRegisteredGroups();
  logger.info(
    { groupCount: Object.keys(registeredGroups).length },
    'State loaded',
  );
}

function saveState(): void {
  setRouterState('last_timestamp', lastTimestamp);
  setRouterState(
    'last_agent_timestamp',
    JSON.stringify(lastAgentTimestamp),
  );
}

function registerGroup(jid: string, group: RegisteredGroup): void {
  registeredGroups[jid] = group;
  setRegisteredGroup(jid, group);

  // Create group folder
  const groupDir = path.join(DATA_DIR, '..', 'groups', group.folder);
  fs.mkdirSync(path.join(groupDir, 'logs'), { recursive: true });

  logger.info(
    { jid, name: group.name, folder: group.folder },
    'Group registered',
  );
}

/**
 * Sync group metadata for Telegram.
 * For Telegram, we just update the single chat metadata.
 */
async function syncGroupMetadata(force = false): Promise<void> {
  // Check if we need to sync (skip if synced recently, unless forced)
  if (!force) {
    const lastSync = getLastGroupSync();
    if (lastSync) {
      const lastSyncTime = new Date(lastSync).getTime();
      const now = Date.now();
      if (now - lastSyncTime < GROUP_SYNC_INTERVAL_MS) {
        logger.debug({ lastSync }, 'Skipping group sync - synced recently');
        return;
      }
    }
  }

  try {
    logger.info('Syncing Telegram chat metadata...');
    // For Telegram, update the single chat name
    updateChatName(TELEGRAM_CHAT_JID, 'Telegram Private Chat');
    setLastGroupSync();
    logger.info('Telegram chat metadata synced');
  } catch (err) {
    logger.error({ err }, 'Failed to sync Telegram chat metadata');
  }
}

/**
 * Get available groups list for the agent.
 * For Telegram, returns the single private chat.
 */
function getAvailableGroups(): AvailableGroup[] {
  const chats = getAllChats();
  const registeredJids = new Set(Object.keys(registeredGroups));

  return chats
    .filter((c) => c.jid !== '__group_sync__')
    .map((c) => ({
      jid: c.jid,
      name: c.name,
      lastActivity: c.last_message_time,
      isRegistered: registeredJids.has(c.jid),
    }));
}

/**
 * Process all pending messages for a group.
 * Called by the GroupQueue when it's this group's turn.
 */
async function processGroupMessages(chatJid: string): Promise<boolean> {
  const group = registeredGroups[chatJid];
  if (!group) return true;

  const isMainGroup = group.folder === MAIN_GROUP_FOLDER;

  // Get all messages since last agent interaction
  const sinceTimestamp = lastAgentTimestamp[chatJid] || '';
  const missedMessages = getMessagesSince(
    chatJid,
    sinceTimestamp,
    ASSISTANT_NAME,
  );

  if (missedMessages.length === 0) return true;

  // For Telegram private chat, no trigger is required (requiresTrigger is false)
  // All messages should be processed

  const lines = missedMessages.map((m) => {
    const escapeXml = (s: string) =>
      s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    return `<message sender="${escapeXml(m.sender_name)}" time="${m.timestamp}">${escapeXml(m.content)}</message>`;
  });
  const prompt = `<messages>\n${lines.join('\n')}\n</messages>`;

  logger.info(
    { group: group.name, messageCount: missedMessages.length },
    'Processing messages',
  );

  await setTyping(true);
  const response = await runAgent(group, prompt, chatJid);
  await setTyping(false);

  if (response === 'error') {
    // Container or agent error — signal failure so queue can retry with backoff
    return false;
  }

  // Agent processed messages successfully (whether it responded or stayed silent)
  lastAgentTimestamp[chatJid] =
    missedMessages[missedMessages.length - 1].timestamp;
  saveState();

  if (response.outputType === 'message' && response.userMessage) {
    // For Telegram, send without "Andy:" prefix
    await sendMessage(response.userMessage);
  }

  if (response.internalLog) {
    logger.info(
      { group: group.name, outputType: response.outputType },
      `Agent: ${response.internalLog}`,
    );
  }

  return true;
}

async function runAgent(
  group: RegisteredGroup,
  prompt: string,
  chatJid: string,
): Promise<AgentResponse | 'error'> {
  const isMain = group.folder === MAIN_GROUP_FOLDER;
  const sessionId = sessions[group.folder];

  // Update tasks snapshot for container to read (filtered by group)
  const tasks = getAllTasks();
  writeTasksSnapshot(
    group.folder,
    isMain,
    tasks.map((t) => ({
      id: t.id,
      groupFolder: t.group_folder,
      prompt: t.prompt,
      schedule_type: t.schedule_type,
      schedule_value: t.schedule_value,
      status: t.status,
      next_run: t.next_run,
    })),
  );

  // Update available groups snapshot (main group only can see all groups)
  const availableGroups = getAvailableGroups();
  writeGroupsSnapshot(
    group.folder,
    isMain,
    availableGroups,
    new Set(Object.keys(registeredGroups)),
  );

  try {
    const output = await runContainerAgent(
      group,
      {
        prompt,
        sessionId,
        groupFolder: group.folder,
        chatJid,
        isMain,
      },
      (proc, containerName) => queue.registerProcess(chatJid, proc, containerName),
    );

    if (output.newSessionId) {
      sessions[group.folder] = output.newSessionId;
      setSession(group.folder, output.newSessionId);
    }

    if (output.status === 'error') {
      logger.error(
        { group: group.name, error: output.error },
        'Container agent error',
      );
      return 'error';
    }

    return output.result ?? { outputType: 'log' };
  } catch (err) {
    logger.error({ group: group.name, err }, 'Agent error');
    return 'error';
  }
}

async function sendMessage(text: string): Promise<void> {
  try {
    const ok = await telegramBot.sendMessage(text);
    if (ok) {
      logger.info({ length: text.length }, 'Telegram message sent');
    } else {
      logger.error({ length: text.length }, 'Failed to send Telegram message');
    }
  } catch (err) {
    logger.error({ err }, 'Failed to send Telegram message');
  }
}

function startIpcWatcher(): void {
  if (ipcWatcherRunning) {
    logger.debug('IPC watcher already running, skipping duplicate start');
    return;
  }
  ipcWatcherRunning = true;

  const ipcBaseDir = path.join(DATA_DIR, 'ipc');
  fs.mkdirSync(ipcBaseDir, { recursive: true });

  const processIpcFiles = async () => {
    // Scan all group IPC directories (identity determined by directory)
    let groupFolders: string[];
    try {
      groupFolders = fs.readdirSync(ipcBaseDir).filter((f) => {
        const stat = fs.statSync(path.join(ipcBaseDir, f));
        return stat.isDirectory() && f !== 'errors';
      });
    } catch (err) {
      logger.error({ err }, 'Error reading IPC base directory');
      setTimeout(processIpcFiles, IPC_POLL_INTERVAL);
      return;
    }

    for (const sourceGroup of groupFolders) {
      const isMain = sourceGroup === MAIN_GROUP_FOLDER;
      const messagesDir = path.join(ipcBaseDir, sourceGroup, 'messages');
      const tasksDir = path.join(ipcBaseDir, sourceGroup, 'tasks');

      // Process messages from this group's IPC directory
      try {
        if (fs.existsSync(messagesDir)) {
          const messageFiles = fs
            .readdirSync(messagesDir)
            .filter((f) => f.endsWith('.json'));
          for (const file of messageFiles) {
            const filePath = path.join(messagesDir, file);
            try {
              const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
              if (data.type === 'message' && data.chatJid && data.text) {
                // Authorization: verify this group can send to this chatJid
                const targetGroup = registeredGroups[data.chatJid];
                if (
                  isMain ||
                  (targetGroup && targetGroup.folder === sourceGroup)
                ) {
                  // For Telegram, send without prefix
                  await sendMessage(data.text);
                  logger.info(
                    { chatJid: data.chatJid, sourceGroup },
                    'IPC message sent',
                  );
                } else {
                  logger.warn(
                    { chatJid: data.chatJid, sourceGroup },
                    'Unauthorized IPC message attempt blocked',
                  );
                }
              }
              fs.unlinkSync(filePath);
            } catch (err) {
              logger.error(
                { file, sourceGroup, err },
                'Error processing IPC message',
              );
              const errorDir = path.join(ipcBaseDir, 'errors');
              fs.mkdirSync(errorDir, { recursive: true });
              fs.renameSync(
                filePath,
                path.join(errorDir, `${sourceGroup}-${file}`),
              );
            }
          }
        }
      } catch (err) {
        logger.error(
          { err, sourceGroup },
          'Error reading IPC messages directory',
        );
      }

      // Process tasks from this group's IPC directory
      try {
        if (fs.existsSync(tasksDir)) {
          const taskFiles = fs
            .readdirSync(tasksDir)
            .filter((f) => f.endsWith('.json'));
          for (const file of taskFiles) {
            const filePath = path.join(tasksDir, file);
            try {
              const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
              // Pass source group identity to processTaskIpc for authorization
              await processTaskIpc(data, sourceGroup, isMain);
              fs.unlinkSync(filePath);
            } catch (err) {
              logger.error(
                { file, sourceGroup, err },
                'Error processing IPC task',
              );
              const errorDir = path.join(ipcBaseDir, 'errors');
              fs.mkdirSync(errorDir, { recursive: true });
              fs.renameSync(
                filePath,
                path.join(errorDir, `${sourceGroup}-${file}`),
              );
            }
          }
        }
      } catch (err) {
        logger.error({ err, sourceGroup }, 'Error reading IPC tasks directory');
      }
    }

    setTimeout(processIpcFiles, IPC_POLL_INTERVAL);
  };

  processIpcFiles();
  logger.info('IPC watcher started (per-group namespaces)');
}

async function processTaskIpc(
  data: {
    type: string;
    taskId?: string;
    prompt?: string;
    schedule_type?: string;
    schedule_value?: string;
    context_mode?: string;
    groupFolder?: string;
    chatJid?: string;
    targetJid?: string;
    // For register_group
    jid?: string;
    name?: string;
    folder?: string;
    trigger?: string;
    containerConfig?: RegisteredGroup['containerConfig'];
  },
  sourceGroup: string, // Verified identity from IPC directory
  isMain: boolean, // Verified from directory path
): Promise<void> {
  switch (data.type) {
    case 'schedule_task':
      if (
        data.prompt &&
        data.schedule_type &&
        data.schedule_value &&
        data.targetJid
      ) {
        // Resolve the target group from JID
        const targetJid = data.targetJid as string;
        const targetGroupEntry = registeredGroups[targetJid];

        if (!targetGroupEntry) {
          logger.warn(
            { targetJid },
            'Cannot schedule task: target group not registered',
          );
          break;
        }

        const targetFolder = targetGroupEntry.folder;

        // Authorization: non-main groups can only schedule for themselves
        if (!isMain && targetFolder !== sourceGroup) {
          logger.warn(
            { sourceGroup, targetFolder },
            'Unauthorized schedule_task attempt blocked',
          );
          break;
        }

        const scheduleType = data.schedule_type as 'cron' | 'interval' | 'once';

        let nextRun: string | null = null;
        if (scheduleType === 'cron') {
          try {
            const interval = CronExpressionParser.parse(data.schedule_value, {
              tz: TIMEZONE,
            });
            nextRun = interval.next().toISOString();
          } catch {
            logger.warn(
              { scheduleValue: data.schedule_value },
              'Invalid cron expression',
            );
            break;
          }
        } else if (scheduleType === 'interval') {
          const ms = parseInt(data.schedule_value, 10);
          if (isNaN(ms) || ms <= 0) {
            logger.warn(
              { scheduleValue: data.schedule_value },
              'Invalid interval',
            );
            break;
          }
          nextRun = new Date(Date.now() + ms).toISOString();
        } else if (scheduleType === 'once') {
          const scheduled = new Date(data.schedule_value);
          if (isNaN(scheduled.getTime())) {
            logger.warn(
              { scheduleValue: data.schedule_value },
              'Invalid timestamp',
            );
            break;
          }
          nextRun = scheduled.toISOString();
        }

        const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const contextMode =
          data.context_mode === 'group' || data.context_mode === 'isolated'
            ? data.context_mode
            : 'isolated';
        createTask({
          id: taskId,
          group_folder: targetFolder,
          chat_jid: targetJid,
          prompt: data.prompt,
          schedule_type: scheduleType,
          schedule_value: data.schedule_value,
          context_mode: contextMode,
          next_run: nextRun,
          status: 'active',
          created_at: new Date().toISOString(),
        });
        logger.info(
          { taskId, sourceGroup, targetFolder, contextMode },
          'Task created via IPC',
        );
      }
      break;

    case 'pause_task':
      if (data.taskId) {
        const task = getTaskById(data.taskId);
        if (task && (isMain || task.group_folder === sourceGroup)) {
          updateTask(data.taskId, { status: 'paused' });
          logger.info(
            { taskId: data.taskId, sourceGroup },
            'Task paused via IPC',
          );
        } else {
          logger.warn(
            { taskId: data.taskId, sourceGroup },
            'Unauthorized task pause attempt',
          );
        }
      }
      break;

    case 'resume_task':
      if (data.taskId) {
        const task = getTaskById(data.taskId);
        if (task && (isMain || task.group_folder === sourceGroup)) {
          updateTask(data.taskId, { status: 'active' });
          logger.info(
            { taskId: data.taskId, sourceGroup },
            'Task resumed via IPC',
          );
        } else {
          logger.warn(
            { taskId: data.taskId, sourceGroup },
            'Unauthorized task resume attempt',
          );
        }
      }
      break;

    case 'cancel_task':
      if (data.taskId) {
        const task = getTaskById(data.taskId);
        if (task && (isMain || task.group_folder === sourceGroup)) {
          deleteTask(data.taskId);
          logger.info(
            { taskId: data.taskId, sourceGroup },
            'Task cancelled via IPC',
          );
        } else {
          logger.warn(
            { taskId: data.taskId, sourceGroup },
            'Unauthorized task cancel attempt',
          );
        }
      }
      break;

    case 'refresh_groups':
      // Only main group can request a refresh
      if (isMain) {
        logger.info(
          { sourceGroup },
          'Group metadata refresh requested via IPC',
        );
        await syncGroupMetadata(true);
        // Write updated snapshot immediately
        const availableGroups = getAvailableGroups();
        writeGroupsSnapshot(
          sourceGroup,
          true,
          availableGroups,
          new Set(Object.keys(registeredGroups)),
        );
      } else {
        logger.warn(
          { sourceGroup },
          'Unauthorized refresh_groups attempt blocked',
        );
      }
      break;

    case 'register_group':
      // Only main group can register new groups
      if (!isMain) {
        logger.warn(
          { sourceGroup },
          'Unauthorized register_group attempt blocked',
        );
        break;
      }
      if (data.jid && data.name && data.folder && data.trigger) {
        registerGroup(data.jid, {
          name: data.name,
          folder: data.folder,
          trigger: data.trigger,
          added_at: new Date().toISOString(),
          containerConfig: data.containerConfig,
        });
      } else {
        logger.warn(
          { data },
          'Invalid register_group request - missing required fields',
        );
      }
      break;

    default:
      logger.warn({ type: data.type }, 'Unknown IPC task type');
  }
}

/**
 * Store a Telegram message in the database.
 */
function storeTelegramMessage(
  message: TelegramMessage,
  chatJid: string,
): void {
  if (!message.text) return;

  const timestamp = new Date(message.date * 1000).toISOString();
  const sender = `${message.from.id}`;
  const senderName = message.from.username || message.from.first_name;
  const msgId = `${message.message_id}`;

  storeRawMessage(msgId, chatJid, sender, senderName, message.text, timestamp, false);
}

async function initializeTelegramBot(): Promise<void> {
  // Load Telegram config
  const configPath = path.join(DATA_DIR, '..', 'groups', 'main', 'telegram_config.json');
  const config = TelegramBot.loadConfig(configPath);

  if (!config) {
    logger.error('Failed to load Telegram config');
    throw new Error('Invalid Telegram configuration');
  }

  // Create bot instance
  telegramBot = new TelegramBot(config);

  // Test connection
  const connected = await telegramBot.testConnection();
  if (!connected) {
    throw new Error('Failed to connect to Telegram');
  }

  logger.info('Connected to Telegram');

  // Auto-register the Telegram chat as main group if not already registered
  if (!registeredGroups[TELEGRAM_CHAT_JID]) {
    registerGroup(TELEGRAM_CHAT_JID, {
      name: 'Telegram Private Chat',
      folder: MAIN_GROUP_FOLDER,
      trigger: '@Computer', // Not actually used since requiresTrigger is false
      added_at: new Date().toISOString(),
      requiresTrigger: false, // No trigger needed for private bot
    });
  }

  // Sync metadata on startup
  await syncGroupMetadata();

  // Set up daily sync timer (only once)
  if (!groupSyncTimerStarted) {
    groupSyncTimerStarted = true;
    setInterval(() => {
      syncGroupMetadata().catch((err) =>
        logger.error({ err }, 'Periodic group sync failed'),
      );
    }, GROUP_SYNC_INTERVAL_MS);
  }

  // Start scheduler loop
  startSchedulerLoop({
    sendMessage: async (jid: string, text: string) => {
      // For Telegram, ignore jid and send to the configured chat
      await sendMessage(text);
    },
    registeredGroups: () => registeredGroups,
    getSessions: () => sessions,
    queue,
    onProcess: (groupJid, proc, containerName) =>
      queue.registerProcess(groupJid, proc, containerName),
  });

  // Start IPC watcher
  startIpcWatcher();

  // Set queue process function
  queue.setProcessMessagesFn(processGroupMessages);

  // Recover pending messages
  recoverPendingMessages();

  // Start message polling loop
  startMessageLoop();
}

async function startMessageLoop(): Promise<void> {
  if (messageLoopRunning) {
    logger.debug('Message loop already running, skipping duplicate start');
    return;
  }
  messageLoopRunning = true;

  logger.info('NanoClaw Telegram running');

  while (true) {
    try {
      // Get updates from Telegram (30 second long polling)
      const updates = await telegramBot.getUpdates(30);

      for (const update of updates) {
        if (!update.message) continue;

        const message = update.message;
        const timestamp = new Date(message.date * 1000).toISOString();

        // Store chat metadata
        storeChatMetadata(TELEGRAM_CHAT_JID, timestamp);

        // Store the message
        storeTelegramMessage(message, TELEGRAM_CHAT_JID);

        // Enqueue for processing
        queue.enqueueMessageCheck(TELEGRAM_CHAT_JID);
      }

      // Check for new messages from database
      const jids = Object.keys(registeredGroups);
      const { messages, newTimestamp } = getNewMessages(
        jids,
        lastTimestamp,
        ASSISTANT_NAME,
      );

      if (messages.length > 0) {
        logger.info({ count: messages.length }, 'New messages');

        // Advance the "seen" cursor for all messages immediately
        lastTimestamp = newTimestamp;
        saveState();

        // Deduplicate by group and enqueue
        const groupsWithMessages = new Set<string>();
        for (const msg of messages) {
          groupsWithMessages.add(msg.chat_jid);
        }

        for (const chatJid of groupsWithMessages) {
          queue.enqueueMessageCheck(chatJid);
        }
      }
    } catch (err) {
      logger.error({ err }, 'Error in message loop');
    }

    // Small delay between polling cycles to avoid hammering the API
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
  }
}

/**
 * Startup recovery: check for unprocessed messages in registered groups.
 * Handles crash between advancing lastTimestamp and processing messages.
 */
function recoverPendingMessages(): void {
  for (const [chatJid, group] of Object.entries(registeredGroups)) {
    const sinceTimestamp = lastAgentTimestamp[chatJid] || '';
    const pending = getMessagesSince(chatJid, sinceTimestamp, ASSISTANT_NAME);
    if (pending.length > 0) {
      logger.info(
        { group: group.name, pendingCount: pending.length },
        'Recovery: found unprocessed messages',
      );
      queue.enqueueMessageCheck(chatJid);
    }
  }
}

function ensureDockerRunning(): void {
  try {
    execSync('docker info', { stdio: 'pipe', timeout: 10000 });
    logger.debug('Docker daemon is running');
  } catch {
    logger.error('Docker daemon is not running');
    console.error('\n╔════════════════════════════════════════════════════════════════╗');
    console.error('║  FATAL: Docker is not running                                  ║');
    console.error('║                                                                ║');
    console.error('║  Agents cannot run without Docker. To fix:                     ║');
    console.error('║  macOS: Start Docker Desktop                                   ║');
    console.error('║  Linux: sudo systemctl start docker                            ║');
    console.error('║                                                                ║');
    console.error('║  Install from: https://docker.com/products/docker-desktop      ║');
    console.error('╚════════════════════════════════════════════════════════════════╝\n');
    throw new Error('Docker is required but not running');
  }

  // Clean up stopped NanoClaw containers from previous runs
  try {
    const output = execSync('docker ps -a --filter "name=nanoclaw-" --format "{{.Names}}"', {
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf-8',
    });
    const stale = output
      .split('\n')
      .map((n) => n.trim())
      .filter((n) => n.startsWith('nanoclaw-'));
    if (stale.length > 0) {
      execSync(`docker rm ${stale.join(' ')}`, { stdio: 'pipe' });
      logger.info({ count: stale.length }, 'Cleaned up stopped containers');
    }
  } catch {
    // No stopped containers
  }
}

async function main(): Promise<void> {
  ensureDockerRunning();
  initDatabase();
  logger.info('Database initialized');
  loadState();

  // Graceful shutdown handlers
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received');
    await queue.shutdown(10000);
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  await initializeTelegramBot();
}

main().catch((err) => {
  logger.error({ err }, 'Failed to start NanoClaw Telegram');
  process.exit(1);
});
