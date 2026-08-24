// @vitest-environment happy-dom
import { createElement, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LanguageProvider } from '../../i18n/LanguageContext';
import { VoiceAssistantView } from '../VoiceAssistantView';
import { api } from '../../../lib/api';

const mockUseRentalOrg = vi.fn();

vi.mock('../../RentalContext', () => ({
  useRentalOrg: () => mockUseRentalOrg(),
}));

const baseAssistant = {
  id: 'va-1',
  organizationId: 'org-1',
  name: 'Fleet Voice',
  role: 'assistant',
  personality: null,
  language: 'de',
  voiceId: 'voice-1',
  voiceName: 'Test Voice',
  greetingMessage: 'Hello',
  systemPrompt: 'Be helpful',
  companyContext: null,
  businessRules: null,
  forbiddenActions: null,
  knowledgeSnippets: null,
  provider: 'elevenlabs',
  elevenLabsAgentId: 'agent-1',
  elevenLabsPhoneNumberId: null,
  phoneNumberId: null,
  phoneNumber: '+491234',
  connectionStatus: 'CONNECTED' as const,
  lastProvisionedAt: null,
  lastSyncedAt: '2026-08-24T10:00:00.000Z',
  telephonyEnabled: true,
  inboundEnabled: true,
  outboundEnabled: false,
  permAnswerQuestions: true,
  permManageBookings: false,
  permCreateBookingDrafts: false,
  permCancelBookings: false,
  permCreateTasks: false,
  permWorkshopHandling: false,
  permBreakdownSupport: false,
  permContactCustomers: false,
  permContactVendors: false,
  permModifyRecords: false,
  permCreateActions: false,
  permEmergencyHandling: false,
  toolPermissions: {},
  escalationPhone: '+49999',
  escalationUserId: null,
  escalationDepartment: null,
  escalateOnLowConf: true,
  escalateOnSensitive: true,
  escalateOnRequest: true,
  fallbackMessage: 'Please hold',
  escalationTriggers: null,
  businessHoursStart: '09:00',
  businessHoursEnd: '17:00',
  businessHoursTimezone: 'Europe/Berlin',
  afterHoursMessage: null,
  businessHours: null,
  status: 'ACTIVE' as const,
  totalCalls: 12,
  answeredCalls: 10,
  missedCalls: 2,
  escalatedCalls: 1,
  totalTalkTimeSeconds: 600,
  totalTalkMinutes: 10,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-08-24T10:00:00.000Z',
  activatedAt: '2026-02-01T00:00:00.000Z',
  deactivatedAt: null,
};

describe('VoiceAssistantView control-plane hardening', () => {
  let container: HTMLDivElement;
  let root: Root;
  const onOpenConversations = vi.fn();

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    localStorage.setItem('synqdrive.locale', 'en');
    onOpenConversations.mockReset();

    mockUseRentalOrg.mockReturnValue({
      orgId: 'org-1',
      hasPermission: () => true,
      userRole: 'ORG_ADMIN',
      loading: false,
    });

    vi.spyOn(api.voiceAssistant, 'get').mockResolvedValue(baseAssistant as never);
    vi.spyOn(api.voiceAssistant, 'readiness').mockResolvedValue({
      ready: true,
      checks: [],
      missing: [],
    } as never);
    vi.spyOn(api.voiceAssistant, 'syncConversations').mockResolvedValue({
      synced: 2,
      message: 'Synced 2 conversations',
    } as never);
    vi.spyOn(api.voiceAssistant.billing, 'remainingMinutes').mockResolvedValue({
      includedMinutes: 100,
      consumedMinutes: 20,
      remainingIncludedMinutes: 80,
      overageMinutes: 0,
      planCode: 'STARTER',
    } as never);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  function renderView(
    props: Partial<ComponentProps<typeof VoiceAssistantView>> = {},
  ) {
    act(() => {
      root.render(
        createElement(
          LanguageProvider,
          null,
          createElement(VoiceAssistantView, {
            isDarkMode: false,
            suppressLegacyUrlSync: true,
            initialVoiceState: { opsTab: 'overview' },
            onOpenConversations,
            ...props,
          }),
        ),
      );
    });
  }

  it('invokes canonical inbox callback when overview CTA is clicked', async () => {
    renderView();

    await act(async () => {
      await Promise.resolve();
    });

    const button = container.querySelector('[data-testid="voice-ops-open-conversations"]');
    expect(button).not.toBeNull();

    act(() => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onOpenConversations).toHaveBeenCalledTimes(1);
  });

  it('hands off legacy conversations tab to canonical inbox exactly once', async () => {
    renderView({ initialVoiceState: { opsTab: 'conversations' } });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onOpenConversations).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toContain('VoiceConversationsPanel');
  });

  it('sync performs troubleshooting refresh without loading conversation rows', async () => {
    renderView();

    await act(async () => {
      await Promise.resolve();
    });

    const syncButton = Array.from(container.querySelectorAll('button')).find(button =>
      button.textContent?.includes('Sync'),
    );
    expect(syncButton).toBeTruthy();

    await act(async () => {
      syncButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(api.voiceAssistant.syncConversations).toHaveBeenCalledWith('org-1');
    expect(api.voiceAssistant.get).toHaveBeenCalled();
  });
});
