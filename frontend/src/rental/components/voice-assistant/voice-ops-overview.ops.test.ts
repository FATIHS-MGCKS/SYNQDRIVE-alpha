import { describe, expect, it } from 'vitest';
import type { VoiceAssistantData, VoiceConversationEntry, VoiceWorkspaceView } from '../../../lib/api';
import {
  computeTodayKpis,
  isCallbackConversation,
  lastSuccessfulCallAt,
  resolveHeroOperationalStatus,
  resolveReachability,
} from './voice-ops-overview.ops';

const baseWorkspace = (overrides: Partial<VoiceWorkspaceView> = {}): VoiceWorkspaceView => ({
  organizationId: 'org-1',
  primaryState: 'ACTIVE',
  issues: [],
  navigation: {
    phase: 'operations',
    wizardStep: null,
    opsTab: 'overview',
    settingsSection: null,
    allowedWizardSteps: [],
    allowedOpsTabs: ['overview'],
    allowedSettingsSections: [],
  },
  onboardingStep: 'activation',
  completedSteps: [],
  rolloutStatus: 'ENABLED',
  subscriptionStatus: 'ACTIVE',
  assistantStatus: 'ACTIVE',
  readinessReady: true,
  testPassed: true,
  canActivate: true,
  updatedAt: new Date().toISOString(),
  ...overrides,
});

const baseAssistant = (overrides: Partial<VoiceAssistantData> = {}): VoiceAssistantData =>
  ({
    id: 'va-1',
    organizationId: 'org-1',
    name: 'Synq',
    status: 'ACTIVE',
    connectionStatus: 'CONNECTED',
    inboundEnabled: true,
    telephonyEnabled: true,
    businessHoursStart: '08:00',
    businessHoursEnd: '18:00',
    businessHoursTimezone: 'Europe/Berlin',
    phoneNumber: '+491701234567',
    toolPermissions: {},
    totalCalls: 0,
    answeredCalls: 0,
    missedCalls: 0,
    escalatedCalls: 0,
    totalTalkTimeSeconds: 0,
    totalTalkMinutes: 0,
    ...overrides,
  }) as VoiceAssistantData;

const conversation = (overrides: Partial<VoiceConversationEntry> = {}): VoiceConversationEntry => ({
  id: 'c-1',
  startedAt: new Date().toISOString(),
  direction: 'inbound',
  callerNumber: '+49 *** *** 1234',
  durationSeconds: 120,
  status: 'completed',
  outcome: 'RESOLVED',
  summary: 'Booking status question',
  transcript: 'Hello',
  hasTranscript: true,
  escalated: false,
  escalationReason: null,
  linkedBookingId: null,
  linkedCustomerId: null,
  linkedVehicleId: null,
  taskId: null,
  metadata: null,
  actionsPerformed: [],
  errorMessage: null,
  ...overrides,
});

describe('voice-ops-overview.ops', () => {
  it('resolves suspended hero status from workspace', () => {
    expect(
      resolveHeroOperationalStatus(
        baseWorkspace({ primaryState: 'SUSPENDED', rolloutStatus: 'SUSPENDED' }),
        baseAssistant(),
        null,
      ),
    ).toBe('suspended');
  });

  it('computes today KPIs from finalized conversations only', () => {
    const today = new Date().toISOString();
    const kpis = computeTodayKpis(
      [
        conversation({ startedAt: today, outcome: 'RESOLVED', durationSeconds: 60 }),
        conversation({
          id: 'c-2',
          startedAt: today,
          outcome: 'ESCALATED',
          escalated: true,
          escalationReason: 'callback requested',
          durationSeconds: 30,
        }),
        conversation({
          id: 'c-3',
          startedAt: today,
          status: 'active',
          outcome: 'PENDING',
        }),
      ],
      true,
    );

    expect(kpis.callsToday).toBe(2);
    expect(kpis.aiResolved).toBe(1);
    expect(kpis.forwarded).toBe(1);
    expect(kpis.callbacks).toBe(1);
    expect(kpis.avgDurationSeconds).toBe(45);
    expect(kpis.minutesConsumed).toBe(1.5);
  });

  it('returns null KPIs when conversations are not loaded', () => {
    const kpis = computeTodayKpis([], false);
    expect(kpis.callsToday).toBeNull();
    expect(kpis.aiResolved).toBeNull();
  });

  it('finds last successful finalized call', () => {
    const older = conversation({
      id: 'old',
      startedAt: '2026-07-17T10:00:00.000Z',
      outcome: 'RESOLVED',
    });
    const newer = conversation({
      id: 'new',
      startedAt: '2026-07-18T10:00:00.000Z',
      outcome: 'RESOLVED',
    });
    expect(lastSuccessfulCallAt([older, newer], true)).toBe(newer.startedAt);
  });

  it('detects callback conversations from escalation reason', () => {
    expect(
      isCallbackConversation(
        conversation({ escalationReason: 'Customer requested a callback tomorrow' }),
      ),
    ).toBe(true);
  });

  it('evaluates reachability from business hours', () => {
    const assistant = baseAssistant({
      businessHoursStart: '00:00',
      businessHoursEnd: '23:59',
      businessHoursTimezone: 'UTC',
    });
    expect(resolveReachability(assistant, new Date('2026-07-18T12:00:00.000Z'))).toBe('reachable');
  });
});
