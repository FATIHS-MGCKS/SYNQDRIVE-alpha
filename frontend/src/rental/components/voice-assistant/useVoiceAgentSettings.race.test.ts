// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitForHook } from '../../../test/renderHook';
import { useVoiceAgentSettings } from './useVoiceAgentSettings';

vi.mock('../../../lib/api', () => ({
  api: {
    voiceAssistant: {
      get: vi.fn(),
      update: vi.fn(),
      readiness: vi.fn(),
      voices: vi.fn(),
    },
  },
  getErrorMessage: (err: unknown) => (err instanceof Error ? err.message : 'error'),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { api } from '../../../lib/api';
import { toast } from 'sonner';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('useVoiceAgentSettings race safety', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.voiceAssistant.readiness).mockResolvedValue({ ready: true, checks: [] } as never);
    vi.mocked(api.voiceAssistant.voices).mockResolvedValue([] as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('ignores stale org A response after switching to org B', async () => {
    const orgA = deferred({ id: 'assistant-a', name: 'Org A', status: 'ACTIVE' });
    const orgB = deferred({ id: 'assistant-b', name: 'Org B', status: 'INACTIVE' });

    vi.mocked(api.voiceAssistant.get).mockImplementation((orgId: string) => {
      if (orgId === 'org-a') return orgA.promise as never;
      if (orgId === 'org-b') return orgB.promise as never;
      return Promise.reject(new Error('unknown org'));
    });

    const { result, rerender, unmount } = renderHook(
      ({ orgId }) => useVoiceAgentSettings({ orgId, enabled: true }),
      { initialProps: { orgId: 'org-a' } },
    );

    rerender({ orgId: 'org-b' });
    orgB.resolve({ id: 'assistant-b', name: 'Org B', status: 'INACTIVE' } as never);
    await waitForHook(() => result.current.loading === false);
    expect(result.current.assistant?.name).toBe('Org B');

    orgA.resolve({ id: 'assistant-a', name: 'Org A', status: 'ACTIVE' } as never);
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.assistant?.name).toBe('Org B');

    unmount();
  });

  it('does not apply stale org A save completion to org B state', async () => {
    const orgASave = deferred({ id: 'assistant-a', name: 'Org A Saved', status: 'ACTIVE' });

    vi.mocked(api.voiceAssistant.get).mockImplementation((orgId: string) => {
      if (orgId === 'org-a') {
        return Promise.resolve({ id: 'assistant-a', name: 'Org A', status: 'ACTIVE' } as never);
      }
      if (orgId === 'org-b') {
        return Promise.resolve({ id: 'assistant-b', name: 'Org B', status: 'INACTIVE' } as never);
      }
      return Promise.reject(new Error('unknown org'));
    });
    vi.mocked(api.voiceAssistant.update).mockImplementation(() => orgASave.promise as never);

    const { result, rerender, unmount } = renderHook(
      ({ orgId }) => useVoiceAgentSettings({ orgId, enabled: true }),
      { initialProps: { orgId: 'org-a' } },
    );

    await waitForHook(() => result.current.loading === false);

    await act(async () => {
      result.current.setTextField('name', 'Changed');
      void result.current.save();
    });

    rerender({ orgId: 'org-b' });
    await waitForHook(() => result.current.assistant?.name === 'Org B');

    orgASave.resolve({ id: 'assistant-a', name: 'Org A Saved', status: 'ACTIVE' } as never);
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.assistant?.name).toBe('Org B');
    expect(toast.success).not.toHaveBeenCalled();

    unmount();
  });
});
