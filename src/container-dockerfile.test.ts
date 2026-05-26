import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const dockerfile = readFileSync(join(import.meta.dirname, '..', 'container', 'Dockerfile'), 'utf8');

const lines = dockerfile.split('\n');

function hasLine(pattern: RegExp): boolean {
  return lines.some((l) => pattern.test(l));
}

describe('Dockerfile', () => {
  describe('pinned versions', () => {
    it('pins CLAUDE_CODE_VERSION', () => {
      expect(hasLine(/^ARG CLAUDE_CODE_VERSION=\d/)).toBe(true);
    });

    it('pins BUN_VERSION', () => {
      expect(hasLine(/^ARG BUN_VERSION=\d/)).toBe(true);
    });

    it('pins VERCEL_VERSION', () => {
      expect(hasLine(/^ARG VERCEL_VERSION=\d/)).toBe(true);
    });

    it('pins PNPM_VERSION', () => {
      expect(hasLine(/^ARG PNPM_VERSION=\d/)).toBe(true);
    });
  });

  describe('signal handling', () => {
    it('uses tini as PID 1 entrypoint', () => {
      expect(hasLine(/ENTRYPOINT\s+\[.*tini/)).toBe(true);
    });

    it('installs tini via apt', () => {
      expect(hasLine(/\btini\b/)).toBe(true);
    });
  });

  describe('non-root execution', () => {
    it('switches to node user before ENTRYPOINT', () => {
      const userIdxes = lines.reduce<number[]>((acc, l, i) => (/^USER node/.test(l) ? [...acc, i] : acc), []);
      const userIdx = userIdxes[userIdxes.length - 1] ?? -1;
      const entrypointIdx = lines.findIndex((l) => /^ENTRYPOINT/.test(l));
      expect(userIdx).toBeGreaterThan(-1);
      expect(userIdx).toBeLessThan(entrypointIdx);
    });

    it('sets WORKDIR to /workspace/group for node user', () => {
      const userIdxes = lines.reduce<number[]>((acc, l, i) => (/^USER node/.test(l) ? [...acc, i] : acc), []);
      const userIdx = userIdxes[userIdxes.length - 1] ?? -1;
      const workdirAfterUser = lines.slice(userIdx).some((l) => /^WORKDIR \/workspace\/group/.test(l));
      expect(workdirAfterUser).toBe(true);
    });
  });

  describe('Chromium / Playwright', () => {
    it('sets PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1', () => {
      expect(hasLine(/ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1/)).toBe(true);
    });

    it('points AGENT_BROWSER_EXECUTABLE_PATH to system chromium', () => {
      expect(hasLine(/ENV AGENT_BROWSER_EXECUTABLE_PATH=\/usr\/bin\/chromium/)).toBe(true);
    });

    it('points PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH to system chromium', () => {
      expect(hasLine(/ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=\/usr\/bin\/chromium/)).toBe(true);
    });

    it('installs system chromium', () => {
      expect(hasLine(/^\s+chromium\s*\\/)).toBe(true);
    });
  });

  describe('agent-runner', () => {
    it('installs deps with --frozen-lockfile', () => {
      expect(hasLine(/bun install --frozen-lockfile/)).toBe(true);
    });

    it('does not COPY agent-runner source (source is mounted at runtime)', () => {
      const copiesSource = lines.some((l) => /^COPY\s+agent-runner\/src/.test(l) || /^ADD\s+agent-runner\/src/.test(l));
      expect(copiesSource).toBe(false);
    });
  });

  describe('ncl wrapper', () => {
    it('installs ncl CLI shim pointing to /app/src/cli/ncl.ts', () => {
      expect(hasLine(/\/app\/src\/cli\/ncl\.ts/)).toBe(true);
    });
  });
});
