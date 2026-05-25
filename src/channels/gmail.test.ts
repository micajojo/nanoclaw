import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import type { ChannelAdapter } from './adapter.js';

vi.mock('fs');
vi.mock('./channel-registry.js', () => ({ registerChannelAdapter: vi.fn() }));

import { registerChannelAdapter } from './channel-registry.js';

async function getFactory(): Promise<(() => ChannelAdapter | Promise<ChannelAdapter> | null) | undefined> {
  await import('./gmail.js');
  const call = vi.mocked(registerChannelAdapter).mock.calls.at(-1);
  return call?.[1]?.factory as (() => ChannelAdapter | Promise<ChannelAdapter> | null) | undefined;
}

describe('gmail channel registration', () => {
  it('registers under the gmail channel type', async () => {
    await import('./gmail.js');
    expect(registerChannelAdapter).toHaveBeenCalledWith(
      'gmail',
      expect.objectContaining({ factory: expect.any(Function) }),
    );
  });
});

describe('gmail factory', () => {
  it('returns null when credentials are missing', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const factory = await getFactory();
    const adapter = factory?.();
    expect(adapter).toBeNull();
  });

  it('returns an adapter with correct metadata when credentials exist', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    const cred = JSON.stringify({ installed: { client_id: 'id', client_secret: 'sec', redirect_uris: [] } });
    vi.mocked(fs.readFileSync).mockReturnValue(cred);

    const factory = await getFactory();
    const adapter = (await factory?.()) as ChannelAdapter | null;
    expect(adapter).not.toBeNull();
    expect(adapter?.name).toBe('gmail');
    expect(adapter?.channelType).toBe('gmail');
    expect(adapter?.supportsThreads).toBe(true);
    expect(adapter?.isConnected()).toBe(false);
  });

  it('teardown resolves without error when not connected', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    const cred = JSON.stringify({ installed: { client_id: 'id', client_secret: 'sec', redirect_uris: [] } });
    vi.mocked(fs.readFileSync).mockReturnValue(cred);

    const factory = await getFactory();
    const adapter = (await factory?.()) as ChannelAdapter | null;
    await expect(adapter?.teardown()).resolves.toBeUndefined();
  });
});
