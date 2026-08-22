// @vitest-environment happy-dom
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../i18n/LanguageContext';
import { CommunicationWorkspacePane } from './CommunicationWorkspacePane';
import type { UseCommunicationConversationResult } from '../../../lib/communication/hooks/useCommunicationConversation';

function baseConversationState(
  overrides: Partial<UseCommunicationConversationResult> = {},
): UseCommunicationConversationResult {
  return {
    conversation: {
      id: 'conv-1',
      channel: 'WHATSAPP',
      status: 'AI_ACTIVE',
      unreadCount: 0,
      lastActivityAt: '2026-08-22T10:00:00.000Z',
      displayLabel: 'Max Mustermann',
      customer: null,
      booking: null,
      vehicle: null,
      station: null,
      assignedUser: null,
      assignedAgent: null,
      createdAt: '2026-08-20T08:00:00.000Z',
      updatedAt: '2026-08-22T10:00:00.000Z',
    },
    events: [],
    detailLoading: false,
    timelineLoading: false,
    loadingOlder: false,
    hasMore: false,
    detailError: null,
    detailNotFound: false,
    timelineError: null,
    paginationError: null,
    conversationSignature: 'org-1:conv-1',
    reloadDetail: vi.fn(),
    reloadTimeline: vi.fn(),
    loadOlder: vi.fn(),
    retryLoadOlder: vi.fn(),
    ...overrides,
  };
}

describe('CommunicationWorkspacePane error surfaces', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    localStorage.setItem('synqdrive.locale', 'en');
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function renderPane(conversationState: UseCommunicationConversationResult | null) {
    act(() => {
      root.render(
        createElement(
          LanguageProvider,
          null,
          createElement(CommunicationWorkspacePane, {
            selectedConversationId: 'conv-1',
            activeChannel: 'whatsapp',
            conversationState,
          }),
        ),
      );
    });
  }

  it('renders permission-denied detail UX without retry', () => {
    renderPane(baseConversationState({ conversation: null, detailError: 'permission_denied' }));
    expect(container.querySelector('[data-testid="communication-detail-error"]')).not.toBeNull();
    expect(container.textContent).toContain('permission');
    expect(container.querySelector('button')).toBeNull();
  });

  it('keeps header when detail succeeds and timeline fails', () => {
    renderPane(
      baseConversationState({
        timelineError: 'unknown',
      }),
    );
    expect(container.querySelector('[data-testid="communication-conversation-header-title"]')?.textContent).toContain(
      'Max Mustermann',
    );
    expect(container.querySelector('[data-testid="communication-timeline-error"]')).not.toBeNull();
  });
});
