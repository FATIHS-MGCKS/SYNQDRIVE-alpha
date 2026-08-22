// @vitest-environment happy-dom
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LanguageProvider } from '../../i18n/LanguageContext';
import { CommunicationCenterShell } from './CommunicationCenterShell';
import { COMMUNICATION_CHANNEL_PARAM } from './communication-center-navigation';

vi.mock('../../RentalContext', () => ({
  useRentalOrg: () => ({
    orgId: 'org-communication-test',
    loading: false,
    hasPermission: () => true,
    userRole: 'ADMIN',
  }),
}));

vi.mock('../../../lib/communication/hooks/useCommunicationInbox', () => ({
  useCommunicationInbox: () => ({
    conversations: [],
    summary: null,
    loading: false,
    loadingMore: false,
    loadingSummary: false,
    hasMore: false,
    error: null,
    paginationError: null,
    isStale: false,
    reload: vi.fn(),
    loadMore: vi.fn(),
    retryLoadMore: vi.fn(),
  }),
  COMMUNICATION_INBOX_PAGE_SIZE: 25,
}));

vi.mock('../../../lib/communication/hooks/useCommunicationConversation', () => ({
  useCommunicationConversation: () => ({
    conversation: null,
    events: [],
    detailLoading: false,
    timelineLoading: false,
    loadingOlder: false,
    hasMore: false,
    detailError: null,
    detailNotFound: false,
    timelineError: null,
    paginationError: null,
    conversationSignature: 'mock-signature',
    reloadDetail: vi.fn(),
    reloadTimeline: vi.fn(),
    loadOlder: vi.fn(),
    retryLoadOlder: vi.fn(),
  }),
}));

function mockMatchMedia(width: number) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches:
      (query.includes('max-width: 1023px') && width <= 1023) ||
      (query.includes('min-width: 1024px') &&
        query.includes('max-width: 1279px') &&
        width >= 1024 &&
        width <= 1279) ||
      (query.includes('min-width: 1280px') && width >= 1280),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

describe('CommunicationCenterShell', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    window.history.replaceState({}, '', '/rental?view=communication-center');
    localStorage.setItem('synqdrive.locale', 'en');
    mockMatchMedia(1440);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function renderShell() {
    act(() => {
      root.render(createElement(LanguageProvider, null, createElement(CommunicationCenterShell)));
    });
  }

  it('renders inbox workspace with search and filter controls', () => {
    renderShell();
    expect(container.querySelector('[data-testid="communication-center-view"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="communication-inbox-search"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="communication-inbox-filters"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="communication-settings-shell"]')).toBeNull();
    expect(container.querySelector('[role="tablist"]')).toBeNull();
  });

  it('renders German copy', () => {
    localStorage.setItem('synqdrive.locale', 'de');
    renderShell();
    expect(container.textContent).toContain('Konversation auswählen');
    expect(container.textContent).toContain('Posteingang');
  });

  it('shows three-region desktop layout when conversation id is provided', () => {
    window.history.replaceState(
      {},
      '',
      '/rental?view=communication-center&conversationId=conv-shell-test',
    );
    renderShell();
    expect(container.querySelector('[data-testid="communication-context-pane"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="communication-workspace-pane"]')).not.toBeNull();
  });

  it('normalizes settings tab URL to inbox shell', () => {
    window.history.replaceState({}, '', '/rental?communicationTab=settings');
    renderShell();
    expect(container.querySelector('[data-testid="communication-settings-shell"]')).toBeNull();
    expect(container.querySelector('[data-testid="communication-inbox-pane"]')).not.toBeNull();
  });

  it('uses aria-pressed channel filter buttons', () => {
    renderShell();
    const allFilter = container.querySelector('[data-channel="all"]');
    expect(allFilter?.getAttribute('aria-pressed')).toBe('true');
    expect(allFilter?.getAttribute('role')).toBeNull();
  });

  it('clears conversation when channel filter changes', () => {
    window.history.replaceState(
      {},
      '',
      '/rental?view=communication-center&conversationId=conv-1&communicationChannel=whatsapp',
    );
    renderShell();
    const smsFilter = container.querySelector('[data-channel="sms"]') as HTMLButtonElement;
    act(() => {
      smsFilter.click();
    });
    expect(window.location.search).not.toContain('conversationId');
    expect(window.location.search).toContain(`${COMMUNICATION_CHANNEL_PARAM}=sms`);
    expect(container.querySelector('[data-testid="communication-context-pane"]')).toBeNull();
  });

  it('restores channel on browser back', () => {
    renderShell();
    const whatsapp = container.querySelector('[data-channel="whatsapp"]') as HTMLButtonElement;
    const voice = container.querySelector('[data-channel="voice"]') as HTMLButtonElement;
    act(() => {
      whatsapp.click();
    });
    act(() => {
      voice.click();
    });
    act(() => {
      window.history.back();
    });
    expect(window.location.search).toContain(`${COMMUNICATION_CHANNEL_PARAM}=whatsapp`);
    expect(
      container.querySelector('[data-channel="whatsapp"]')?.getAttribute('aria-pressed'),
    ).toBe('true');
  });
});
