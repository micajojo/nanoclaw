/**
 * Container Runner for NanoClaw
 * Spawns agent execution in Docker container and handles IPC
 */
import { ChildProcess, exec, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

import {
  CONTAINER_IMAGE,
  CONTAINER_MAX_OUTPUT_SIZE,
  CONTAINER_TIMEOUT,
  DATA_DIR,
  GROUPS_DIR,
} from './config.js';
import { logger } from './logger.js';
import { validateAdditionalMounts } from './mount-security.js';
import { RegisteredGroup } from './types.js';

// Sentinel markers for robust output parsing (must match agent-runner)
const OUTPUT_START_MARKER = '---NANOCLAW_OUTPUT_START---';
const OUTPUT_END_MARKER = '---NANOCLAW_OUTPUT_END---';

export interface ContainerInput {
  prompt: string;
  sessionId?: string;
  groupFolder: string;
  chatJid: string;
  isMain: boolean;
}

export interface AgentResponse {
  outputType: 'message' | 'log';
  userMessage?: string;
  internalLog?: string;
}

export interface ContainerOutput {
  status: 'success' | 'error';
  result: AgentResponse | null;
  newSessionId?: string;
  error?: string;
}

interface VolumeMount {
  hostPath: string;
  containerPath: string;
  readonly: boolean;
}

// --- Volume mount helpers ---

function mountWorkspace(group: RegisteredGroup, isMain: boolean): VolumeMount[] {
  const projectRoot = process.cwd();
  if (isMain) {
    return [
      // Main gets the entire project root mounted
      { hostPath: projectRoot, containerPath: '/workspace/project', readonly: false },
      // Main also gets its group folder as the working directory
      { hostPath: path.join(GROUPS_DIR, group.folder), containerPath: '/workspace/group', readonly: false },
    ];
  }
  // Other groups only get their own folder
  return [
    { hostPath: path.join(GROUPS_DIR, group.folder), containerPath: '/workspace/group', readonly: false },
  ];
}

function mountGlobalDir(): VolumeMount[] {
  // Global memory directory (read-only for non-main)
  const globalDir = path.join(GROUPS_DIR, 'global');
  if (!fs.existsSync(globalDir)) return [];
  return [{ hostPath: globalDir, containerPath: '/workspace/global', readonly: true }];
}

function mountSessionDir(group: RegisteredGroup): VolumeMount {
  // Per-group Claude sessions directory (isolated from other groups)
  const groupSessionsDir = path.join(DATA_DIR, 'sessions', group.folder, '.claude');
  fs.mkdirSync(groupSessionsDir, { recursive: true });
  return { hostPath: groupSessionsDir, containerPath: '/home/node/.claude', readonly: false };
}

function mountIpcDir(group: RegisteredGroup): VolumeMount {
  // Per-group IPC namespace: prevents cross-group privilege escalation
  const groupIpcDir = path.join(DATA_DIR, 'ipc', group.folder);
  fs.mkdirSync(path.join(groupIpcDir, 'messages'), { recursive: true });
  fs.mkdirSync(path.join(groupIpcDir, 'tasks'), { recursive: true });
  return { hostPath: groupIpcDir, containerPath: '/workspace/ipc', readonly: false };
}

function mountEnvFile(): VolumeMount[] {
  // Environment file directory (keeps credentials out of process listings)
  // Only expose specific auth variables needed by Claude Code, not the entire .env
  const envDir = path.join(DATA_DIR, 'env');
  fs.mkdirSync(envDir, { recursive: true });

  const envFile = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envFile)) return [];

  const envContent = fs.readFileSync(envFile, 'utf-8');
  const allowedVars = ['CLAUDE_CODE_OAUTH_TOKEN', 'ANTHROPIC_API_KEY'];
  const filteredLines = envContent.split('\n').filter((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return false;
    return allowedVars.some((v) => trimmed.startsWith(`${v}=`));
  });

  if (filteredLines.length === 0) return [];

  fs.writeFileSync(path.join(envDir, 'env'), filteredLines.join('\n') + '\n');
  return [{ hostPath: envDir, containerPath: '/workspace/env-dir', readonly: true }];
}

function buildVolumeMounts(group: RegisteredGroup, isMain: boolean): VolumeMount[] {
  const mounts: VolumeMount[] = [
    ...mountWorkspace(group, isMain),
    ...(isMain ? [] : mountGlobalDir()),
    mountSessionDir(group),
    mountIpcDir(group),
    ...mountEnvFile(),
  ];

  // Additional mounts validated against external allowlist (tamper-proof from containers)
  if (group.containerConfig?.additionalMounts) {
    const validatedMounts = validateAdditionalMounts(
      group.containerConfig.additionalMounts,
      group.name,
      isMain,
    );
    mounts.push(...validatedMounts);
  }

  return mounts;
}

// --- Container args ---

function buildContainerArgs(mounts: VolumeMount[], containerName: string): string[] {
  const args: string[] = ['run', '-i', '--rm', '--name', containerName];

  // Docker: -v with :ro suffix for readonly
  for (const mount of mounts) {
    if (mount.readonly) {
      args.push('-v', `${mount.hostPath}:${mount.containerPath}:ro`);
    } else {
      args.push('-v', `${mount.hostPath}:${mount.containerPath}`);
    }
  }

  args.push(CONTAINER_IMAGE);
  return args;
}

// --- Stream buffering ---

interface StreamBuffer {
  onData: (data: Buffer) => void;
  getText: () => string;
  isTruncated: () => boolean;
}

function createStreamBuffer(label: string, groupName: string): StreamBuffer {
  let text = '';
  let truncated = false;

  return {
    onData(data: Buffer) {
      if (truncated) return;
      const chunk = data.toString();
      const remaining = CONTAINER_MAX_OUTPUT_SIZE - text.length;
      if (chunk.length > remaining) {
        text += chunk.slice(0, remaining);
        truncated = true;
        logger.warn(
          { group: groupName, size: text.length },
          `Container ${label} truncated due to size limit`,
        );
      } else {
        text += chunk;
      }
    },
    getText: () => text,
    isTruncated: () => truncated,
  };
}

// --- Output parsing ---

function parseContainerOutput(stdout: string): ContainerOutput {
  const startIdx = stdout.indexOf(OUTPUT_START_MARKER);
  const endIdx = stdout.indexOf(OUTPUT_END_MARKER);

  let jsonLine: string;
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    jsonLine = stdout.slice(startIdx + OUTPUT_START_MARKER.length, endIdx).trim();
  } else {
    // Fallback: last non-empty line (backwards compatibility)
    const lines = stdout.trim().split('\n');
    jsonLine = lines[lines.length - 1];
  }

  return JSON.parse(jsonLine);
}

// --- Log writing ---

interface ContainerLogContext {
  group: RegisteredGroup;
  input: ContainerInput;
  containerArgs: string[];
  mounts: VolumeMount[];
  stdout: string;
  stderr: string;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  duration: number;
  code: number | null;
  timedOut: boolean;
  containerName: string;
}

function writeContainerLog(logsDir: string, ctx: ContainerLogContext): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logFile = path.join(logsDir, `container-${timestamp}.log`);

  if (ctx.timedOut) {
    fs.writeFileSync(logFile, [
      `=== Container Run Log (TIMEOUT) ===`,
      `Timestamp: ${new Date().toISOString()}`,
      `Group: ${ctx.group.name}`,
      `Container: ${ctx.containerName}`,
      `Duration: ${ctx.duration}ms`,
      `Exit Code: ${ctx.code}`,
    ].join('\n'));
    return logFile;
  }

  const isVerbose =
    process.env.LOG_LEVEL === 'debug' || process.env.LOG_LEVEL === 'trace';
  const isError = ctx.code !== 0;

  const logLines = [
    `=== Container Run Log ===`,
    `Timestamp: ${new Date().toISOString()}`,
    `Group: ${ctx.group.name}`,
    `IsMain: ${ctx.input.isMain}`,
    `Duration: ${ctx.duration}ms`,
    `Exit Code: ${ctx.code}`,
    `Stdout Truncated: ${ctx.stdoutTruncated}`,
    `Stderr Truncated: ${ctx.stderrTruncated}`,
    ``,
  ];

  if (isVerbose || isError) {
    logLines.push(
      `=== Input ===`,
      JSON.stringify(ctx.input, null, 2),
      ``,
      `=== Container Args ===`,
      ctx.containerArgs.join(' '),
      ``,
      `=== Mounts ===`,
      ctx.mounts
        .map((m) => `${m.hostPath} -> ${m.containerPath}${m.readonly ? ' (ro)' : ''}`)
        .join('\n'),
      ``,
      `=== Stderr${ctx.stderrTruncated ? ' (TRUNCATED)' : ''} ===`,
      ctx.stderr,
      ``,
      `=== Stdout${ctx.stdoutTruncated ? ' (TRUNCATED)' : ''} ===`,
      ctx.stdout,
    );
  } else {
    logLines.push(
      `=== Input Summary ===`,
      `Prompt length: ${ctx.input.prompt.length} chars`,
      `Session ID: ${ctx.input.sessionId || 'new'}`,
      ``,
      `=== Mounts ===`,
      ctx.mounts
        .map((m) => `${m.containerPath}${m.readonly ? ' (ro)' : ''}`)
        .join('\n'),
      ``,
    );
  }

  fs.writeFileSync(logFile, logLines.join('\n'));
  logger.debug({ logFile, verbose: isVerbose }, 'Container log written');
  return logFile;
}

// --- Main runner ---

export async function runContainerAgent(
  group: RegisteredGroup,
  input: ContainerInput,
  onProcess: (proc: ChildProcess, containerName: string) => void,
): Promise<ContainerOutput> {
  const startTime = Date.now();

  const groupDir = path.join(GROUPS_DIR, group.folder);
  fs.mkdirSync(groupDir, { recursive: true });

  const mounts = buildVolumeMounts(group, input.isMain);
  const safeName = group.folder.replace(/[^a-zA-Z0-9-]/g, '-');
  const containerName = `nanoclaw-${safeName}-${Date.now()}`;
  const containerArgs = buildContainerArgs(mounts, containerName);

  logger.debug(
    {
      group: group.name,
      containerName,
      mounts: mounts.map(
        (m) => `${m.hostPath} -> ${m.containerPath}${m.readonly ? ' (ro)' : ''}`,
      ),
      containerArgs: containerArgs.join(' '),
    },
    'Container mount configuration',
  );

  logger.info(
    {
      group: group.name,
      containerName,
      mountCount: mounts.length,
      isMain: input.isMain,
    },
    'Spawning container agent',
  );

  const logsDir = path.join(GROUPS_DIR, group.folder, 'logs');
  fs.mkdirSync(logsDir, { recursive: true });

  return new Promise((resolve) => {
    const container = spawn('docker', containerArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    onProcess(container, containerName);

    const stdoutBuf = createStreamBuffer('stdout', group.name);
    const stderrBuf = createStreamBuffer('stderr', group.name);

    container.stdin.write(JSON.stringify(input));
    container.stdin.end();

    container.stdout.on('data', stdoutBuf.onData);

    container.stderr.on('data', (data) => {
      // Log stderr lines in real-time for debugging
      const chunk = data.toString();
      const lines = chunk.trim().split('\n');
      for (const line of lines) {
        if (line) logger.debug({ container: group.folder }, line);
      }
      stderrBuf.onData(data);
    });

    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      logger.error({ group: group.name, containerName }, 'Container timeout, stopping gracefully');
      // Graceful stop: sends SIGTERM, waits, then SIGKILL — lets --rm fire
      exec(`docker stop ${containerName}`, { timeout: 15000 }, (err) => {
        if (err) {
          logger.warn({ group: group.name, containerName, err }, 'Graceful stop failed, force killing');
          container.kill('SIGKILL');
        }
      });
    }, group.containerConfig?.timeout || CONTAINER_TIMEOUT);

    container.on('close', (code) => {
      clearTimeout(timeout);
      const duration = Date.now() - startTime;
      const stdout = stdoutBuf.getText();
      const stderr = stderrBuf.getText();

      const logCtx: ContainerLogContext = {
        group, input, containerArgs, mounts,
        stdout, stderr,
        stdoutTruncated: stdoutBuf.isTruncated(),
        stderrTruncated: stderrBuf.isTruncated(),
        duration, code, timedOut, containerName,
      };
      const logFile = writeContainerLog(logsDir, logCtx);

      if (timedOut) {
        logger.error(
          { group: group.name, containerName, duration, code },
          'Container timed out',
        );
        resolve({
          status: 'error',
          result: null,
          error: `Container timed out after ${group.containerConfig?.timeout || CONTAINER_TIMEOUT}ms`,
        });
        return;
      }

      if (code !== 0) {
        logger.error(
          { group: group.name, code, duration, stderr, stdout, logFile },
          'Container exited with error',
        );
        resolve({
          status: 'error',
          result: null,
          error: `Container exited with code ${code}: ${stderr.slice(-200)}`,
        });
        return;
      }

      try {
        const output = parseContainerOutput(stdout);

        logger.info(
          {
            group: group.name,
            duration,
            status: output.status,
            hasResult: !!output.result,
          },
          'Container completed',
        );

        resolve(output);
      } catch (err) {
        logger.error(
          { group: group.name, stdout, stderr, error: err },
          'Failed to parse container output',
        );
        resolve({
          status: 'error',
          result: null,
          error: `Failed to parse container output: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    });

    container.on('error', (err) => {
      clearTimeout(timeout);
      logger.error({ group: group.name, containerName, error: err }, 'Container spawn error');
      resolve({
        status: 'error',
        result: null,
        error: `Container spawn error: ${err.message}`,
      });
    });
  });
}

// --- IPC snapshot writers ---

export function writeTasksSnapshot(
  groupFolder: string,
  isMain: boolean,
  tasks: Array<{
    id: string;
    groupFolder: string;
    prompt: string;
    schedule_type: string;
    schedule_value: string;
    status: string;
    next_run: string | null;
  }>,
): void {
  // Write filtered tasks to the group's IPC directory
  const groupIpcDir = path.join(DATA_DIR, 'ipc', groupFolder);
  fs.mkdirSync(groupIpcDir, { recursive: true });

  // Main sees all tasks, others only see their own
  const filteredTasks = isMain
    ? tasks
    : tasks.filter((t) => t.groupFolder === groupFolder);

  const tasksFile = path.join(groupIpcDir, 'current_tasks.json');
  fs.writeFileSync(tasksFile, JSON.stringify(filteredTasks, null, 2));
}

export interface AvailableGroup {
  jid: string;
  name: string;
  lastActivity: string;
  isRegistered: boolean;
}

/**
 * Write available groups snapshot for the container to read.
 * Only main group can see all available groups (for activation).
 * Non-main groups only see their own registration status.
 */
export function writeGroupsSnapshot(
  groupFolder: string,
  isMain: boolean,
  groups: AvailableGroup[],
  registeredJids: Set<string>,
): void {
  const groupIpcDir = path.join(DATA_DIR, 'ipc', groupFolder);
  fs.mkdirSync(groupIpcDir, { recursive: true });

  // Main sees all groups; others see nothing (they can't activate groups)
  const visibleGroups = isMain ? groups : [];

  const groupsFile = path.join(groupIpcDir, 'available_groups.json');
  fs.writeFileSync(
    groupsFile,
    JSON.stringify(
      {
        groups: visibleGroups,
        lastSync: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
}
