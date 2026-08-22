// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';

import { resolveCommunicationComposerState } from './communication-composer-capability';
import type { CommunicationConversationDetail } from './types';

const baseConversation: CommunicationConversationDetail = {
  id: 'conv-1',
  channel: 'WHATSAPP',
  status: 'HUMAN_ACTIVE',
  unreadCount: 0,
  lastActivityAt: '2026-08-22T12:00:00.000Z',
  displayLabel: 'Test',
  createdAt: '2026-08-22T10:00:00.000Z',
  updatedAt: '2026-08-22T12:00:00.000Z',
};

describe('resolveCommunicationComposerState', () => {
  it('hides composer for read-only users', () => {
    expect(
      resolveCommunicationComposerState({ canWrite: false, conversation: baseConversation }),
    ).toEqual({ mode: 'hidden', reason: 'READ_ONLY' });
  });

  it('hides composer for voice conversations', () => {
    expect(
      resolveCommunicationComposerState({
        canWrite: true,
        conversation: { ...baseConversation, channel: 'VOICE' },
      }),
    ).toEqual({ mode: 'hidden', reason: 'CHANNEL_UNSUPPORTED' });
  });

  it('blocks composer for SMS until runtime is configured', () => {
    expect(
      resolveCommunicationComposerState({
        canWrite: true,
        conversation: { ...baseConversation, channel: 'SMS' },
      }),
    ).toEqual({ mode: 'blocked', reason: 'CHANNEL_NOT_CONFIGURED' });
  });

  it('hides composer for resolved conversations', () => {
    expect(
      resolveCommunicationComposerState({
        canWrite: true,
        conversation: { ...baseConversation, status: 'RESOLVED' },
      }),
    ).toEqual({ mode: 'hidden', reason: 'RESOLVED' });
  });

  it('enables composer for writable whatsapp human-active threads', () => {
    expect(
      resolveCommunicationComposerState({ canWrite: true, conversation: baseConversation }),
    ).toEqual({ mode: 'enabled' });
  });
});
