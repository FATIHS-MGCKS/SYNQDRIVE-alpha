// @vitest-environment happy-dom
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../i18n/LanguageContext';
import { CommunicationDashboardWidget } from './communication/CommunicationDashboardWidget';

const mockUseRentalOrg = vi.fn();
const mockUseCommunicationDashboard = vi.fn();

vi.mock('../../RentalContext', () => ({
  useRentalOrg: () => mockUseRentalOrg(),
}));

vi.mock('./useCommunicationDashboard', () => ({
  useCommunicationDashboard: (...args: unknown[]) => mockUseCommunicationDashboard(...args),
}));

const SECRET_PREVIEW = 'SECRET_PREVIEW_VALUE';

const baseVm = {
  t: (key: string) => key,
  locale: 'en' as const,
};

describe('CommunicationDashboardWidget', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    localStorage.setItem('synqdrive.locale', 'en');
    mockUseRentalOrg.mockReturnValue({
      orgId: 'org-dashboard',
      hasPermission: () => true,
    });
    mockUseCommunicationDashboard.mockReturnValue({
      summary: {
        totalUnreadMessages: 2,
        unreadConversations: 1,
        unassigned: 1,
        requiresAttention: 1,
        byChannel: {},
      },
      rows: [
        {
          id: 'conv-1',
          channel: 'WHATSAPP',
          status: 'HUMAN_REQUIRED',
          unreadCount: 2,
          lastActivityAt: '2026-08-22T10:00:00.000Z',
          displayLabel: 'Max Mustermann',
          lastMessagePreview: 'Need help',
        },
      ],
      loading: false,
      summaryLoading: false,
      listLoading: false,
      summaryError: null,
      listError: null,
      needsAttention: true,
      reload: vi.fn(),
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  function renderWidget(onOpenCommunicationCenter = vi.fn()) {
    act(() => {
      root.render(
        createElement(
          LanguageProvider,
          null,
          createElement(CommunicationDashboardWidget, {
            vm: baseVm as never,
            onOpenCommunicationCenter,
          }),
        ),
      );
    });
    return onOpenCommunicationCenter;
  }

  it('is absent without communication.read permission', () => {
    mockUseRentalOrg.mockReturnValue({
      orgId: 'org-dashboard',
      hasPermission: () => false,
    });
    renderWidget();
    expect(mockUseCommunicationDashboard).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false }),
    );
    expect(container.querySelector('[data-testid="dashboard-communication-widget"]')).toBeNull();
  });

  it('renders metrics and row without leaking unexpected preview secrets in DOM', () => {
    mockUseCommunicationDashboard.mockReturnValue({
      summary: {
        totalUnreadMessages: 1,
        unreadConversations: 1,
        unassigned: 0,
        requiresAttention: 1,
        byChannel: {},
      },
      rows: [
        {
          id: 'conv-secret',
          channel: 'SMS',
          status: 'HUMAN_REQUIRED',
          unreadCount: 1,
          lastActivityAt: '2026-08-22T10:00:00.000Z',
          displayLabel: 'SMS Customer',
          lastMessagePreview: SECRET_PREVIEW,
          apiKey: 'SECRET_API_KEY',
        },
      ],
      loading: false,
      summaryLoading: false,
      listLoading: false,
      summaryError: null,
      listError: null,
      needsAttention: true,
      reload: vi.fn(),
    });

    renderWidget();
    expect(container.querySelector('[data-testid="dashboard-communication-widget"]')).not.toBeNull();
    expect(container.textContent).toContain('SMS Customer');
    expect(container.textContent).toContain(SECRET_PREVIEW);
    expect(container.textContent).not.toContain('SECRET_API_KEY');
  });

  it('opens communication center with conversation deep link on row click', () => {
    const onOpen = renderWidget();
    const row = container.querySelector('[data-testid="dashboard-communication-row"]') as HTMLButtonElement;
    act(() => {
      row.click();
    });
    expect(onOpen).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-1',
        channel: 'whatsapp',
        mobilePane: 'conversation',
      }),
    );
  });

  it('renders rows with unavailable metrics when summary fails but preview succeeds', () => {
    mockUseCommunicationDashboard.mockReturnValue({
      summary: null,
      rows: [
        {
          id: 'conv-human',
          channel: 'WHATSAPP',
          status: 'HUMAN_REQUIRED',
          unreadCount: 1,
          lastActivityAt: '2026-08-22T10:00:00.000Z',
          displayLabel: 'Human Required',
        },
      ],
      loading: false,
      summaryLoading: false,
      listLoading: false,
      summaryError: 'summary failed',
      listError: null,
      needsAttention: false,
      reload: vi.fn(),
    });

    renderWidget();
    expect(container.querySelector('[data-testid="dashboard-communication-row"]')).not.toBeNull();
    expect(container.textContent).toContain('Human Required');
    expect(container.textContent).not.toContain('communication.dashboard.emptyTitle');
    expect(container.textContent).not.toContain('communication.dashboard.error');
    expect(container.querySelector('[data-testid="dashboard-communication-summary"]')?.textContent).toContain('—');
  });

  it('opens unread filter from metric click', () => {
    const onOpen = renderWidget();
    const buttons = container.querySelectorAll('button');
    const unreadButton = Array.from(buttons).find((button) =>
      button.textContent?.includes('communication.dashboard.unread'),
    ) as HTMLButtonElement;
    act(() => {
      unreadButton.click();
    });
    expect(onOpen).toHaveBeenCalledWith(
      expect.objectContaining({
        inboxFilters: { unreadOnly: true },
      }),
    );
  });
});
