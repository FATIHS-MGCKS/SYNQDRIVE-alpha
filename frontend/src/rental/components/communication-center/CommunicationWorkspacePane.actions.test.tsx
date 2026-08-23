// @vitest-environment happy-dom
import { createElement, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../i18n/LanguageContext';
import { CommunicationWorkspacePane } from './CommunicationWorkspacePane';
import type { UseCommunicationConversationResult } from '../../../lib/communication/hooks/useCommunicationConversation';
import type { UseCommunicationConversationActionsResult } from '../../../lib/communication/hooks/useCommunicationConversationActions';

function baseConversationState(
  overrides: Partial<UseCommunicationConversationResult> = {},
): UseCommunicationConversationResult {
  return {
    conversation: {
      id: 'conv-1',
      channel: 'WHATSAPP',
      status: 'HUMAN_REQUIRED',
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
    applyConversationUpdate: vi.fn(),
    ...overrides,
  };
}

function baseActions(
  overrides: Partial<UseCommunicationConversationActionsResult> = {},
): UseCommunicationConversationActionsResult {
  return {
    pendingAction: null,
    actionError: null,
    claim: vi.fn(),
    assign: vi.fn(),
    unassign: vi.fn(),
    takeOverSelf: vi.fn(),
    resolve: vi.fn(),
    reopen: vi.fn(),
    markRead: vi.fn(),
    clearActionError: vi.fn(),
    ...overrides,
  };
}

describe('CommunicationWorkspacePane actions', () => {
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

  function renderPane(props: Partial<ComponentProps<typeof CommunicationWorkspacePane>> = {}) {
    act(() => {
      root.render(
        createElement(
          LanguageProvider,
          null,
          createElement(CommunicationWorkspacePane, {
            selectedConversationId: 'conv-1',
            activeChannel: 'whatsapp',
            conversationState: baseConversationState(),
            conversationActions: baseActions(),
            canWrite: true,
            currentUserId: 'user-a',
            ...props,
          }),
        ),
      );
    });
  }

  it('hides actions for read-only users', () => {
    renderPane({ canWrite: false });
    expect(container.querySelector('[data-testid="communication-header-actions"]')).toBeNull();
    expect(container.querySelector('[data-testid="communication-ownership-takeover"]')).toBeNull();
  });

  it('shows take over for HUMAN_REQUIRED unassigned', () => {
    renderPane();
    expect(container.querySelector('[data-testid="communication-ownership-takeover"]')?.textContent).toContain(
      'Take over',
    );
  });

  it('shows resolve for HUMAN_ACTIVE', () => {
    renderPane({
      conversationState: baseConversationState({
        conversation: {
          ...baseConversationState().conversation!,
          status: 'HUMAN_ACTIVE',
          assignedUser: { id: 'user-a', displayName: 'Me' },
        },
      }),
    });
    expect(container.textContent).toContain('Resolve');
  });

  it('renders already-claimed error message', () => {
    renderPane({
      conversationActions: baseActions({ actionError: 'already_claimed' }),
    });
    expect(container.querySelector('[data-testid="communication-action-error"]')?.textContent).toContain(
      'already taken',
    );
  });

  it('renders stale-state error message', () => {
    renderPane({
      conversationActions: baseActions({ actionError: 'stale_state' }),
    });
    expect(container.querySelector('[data-testid="communication-action-error"]')?.textContent).toContain(
      'changed',
    );
  });
});
