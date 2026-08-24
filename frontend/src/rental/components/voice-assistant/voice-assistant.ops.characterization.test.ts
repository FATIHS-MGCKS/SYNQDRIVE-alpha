import { describe, expect, it } from 'vitest';
import type {
  VoiceAssistantData,
  VoiceAssistantReadiness,
} from '../../../lib/api';
import {
  NAV_GROUPS,
  TAB_DISPLAY_NAMES,
  answerRatePercent,
  buildLaunchChecklist,
  operatorStatusLabel,
  providerStatusLabel,
  readinessPercent,
  resolveOperatorStatus,
  telephonyStatusLabel,
  type VoiceTab,
} from './voice-assistant.ops';

function buildAssistant(
  partial: Partial<VoiceAssistantData> = {},
): VoiceAssistantData {
  return {
    id: 'asst-1',
    organizationId: 'org-1',
    name: 'Fleet Assistant',
    status: 'DRAFT',
    connectionStatus: 'NOT_CONFIGURED',
    language: 'en',
    voiceId: null,
    voiceName: null,
    greetingMessage: null,
    systemPrompt: null,
    telephonyEnabled: false,
    inboundEnabled: false,
    outboundEnabled: false,
    phoneNumber: null,
    elevenLabsAgentId: null,
    totalCalls: 0,
    answeredCalls: 0,
    missedCalls: 0,
    escalatedCalls: 0,
    totalTalkMinutes: 0,
    toolPermissions: {},
    ...partial,
  } as VoiceAssistantData;
}

function buildReadiness(
  partial: Partial<VoiceAssistantReadiness> = {},
): VoiceAssistantReadiness {
  return {
    ready: false,
    missing: [],
    checks: [
      { key: 'elevenlabs', label: 'ElevenLabs', ok: false, required: true },
      { key: 'voice', label: 'Voice', ok: false, required: true },
    ],
    ...partial,
  };
}

describe('voice-assistant.ops characterization', () => {
  describe('operator and provider status', () => {
    it('resolves draft when assistant is missing', () => {
      expect(resolveOperatorStatus(null, null)).toBe('draft');
      expect(operatorStatusLabel('draft')).toBe('Draft');
    });

    it('marks active assistants as degraded when readiness is incomplete', () => {
      const assistant = buildAssistant({ status: 'ACTIVE', connectionStatus: 'CONNECTED' });
      const readiness = buildReadiness({ ready: false });
      expect(resolveOperatorStatus(assistant, readiness)).toBe('degraded');
      expect(operatorStatusLabel('degraded')).toBe('Degraded');
    });

    it('marks ready draft assistants when readiness passes', () => {
      const assistant = buildAssistant({ status: 'DRAFT', connectionStatus: 'CONNECTED' });
      const readiness = buildReadiness({ ready: true, checks: [{ key: 'voice', label: 'Voice', ok: true, required: true }] });
      expect(resolveOperatorStatus(assistant, readiness)).toBe('ready');
    });

    it('reports provider status as not configured when ElevenLabs check fails', () => {
      expect(providerStatusLabel('NOT_CONFIGURED', false)).toBe('Not configured');
      expect(providerStatusLabel('CONNECTED', true)).toBe('Connected');
      expect(providerStatusLabel('DEGRADED', true)).toBe('Degraded');
    });

    it('reports provider status as diagnostic PSTN for Twilio path', () => {
      expect(providerStatusLabel('CONNECTED', true, true, 'twilio')).toBe(
        'Diagnostic PSTN only',
      );
    });

    it('derives telephony label from assistant telephony snapshot', () => {
      expect(telephonyStatusLabel(buildAssistant())).toBe('Disabled');
      expect(
        telephonyStatusLabel(
          buildAssistant({
            telephonyEnabled: true,
            phoneNumber: '+49123456789',
            telephonyStatus: {
              status: 'legacy_diagnostic_only',
              label: 'Diagnostic PSTN only',
              detail: 'Twilio Say diagnostic path',
              providerConfigured: true,
              pstnProvider: 'twilio',
              agentProvisioned: true,
              phoneAssigned: true,
              inboundReady: false,
              outboundEnabled: false,
            },
          }),
        ),
      ).toBe('Diagnostic PSTN only');
    });
  });

  describe('readiness and activation checklist', () => {
    it('computes readiness percent from required checks only', () => {
      const pct = readinessPercent(
        buildReadiness({
          checks: [
            { key: 'a', label: 'A', ok: true, required: true },
            { key: 'b', label: 'B', ok: false, required: true },
            { key: 'c', label: 'C', ok: false, required: false },
          ],
        }),
      );
      expect(pct).toBe(50);
    });

    it('builds launch checklist items linked to configuration tabs', () => {
      const items = buildLaunchChecklist(
        buildAssistant({ name: 'Fleet' }),
        buildReadiness({
          checks: [
            { key: 'voice', label: 'Voice', ok: false, required: true },
            { key: 'elevenlabs', label: 'EL', ok: false, required: true },
          ],
        }),
        false,
      );

      expect(items.some((item) => item.id === 'voice' && item.tab === 'config')).toBe(true);
      expect(items.some((item) => item.id === 'elevenlabs' && item.tab === 'overview')).toBe(true);
      expect(items.find((item) => item.id === 'testCall')?.optional).toBe(true);
    });
  });

  describe('assistant aggregate KPIs', () => {
    it('computes answer rate only when calls exist', () => {
      expect(answerRatePercent(buildAssistant())).toBeNull();
      expect(
        answerRatePercent(
          buildAssistant({ totalCalls: 10, answeredCalls: 7 }),
        ),
      ).toBe(70);
    });
  });

  describe('navigation tabs', () => {
    const allTabs = NAV_GROUPS.flatMap((group) => group.items.map((item) => item.key));

    it('defines stable tab display names for every nav item', () => {
      for (const tab of allTabs) {
        expect(TAB_DISPLAY_NAMES[tab as VoiceTab]).toBeTruthy();
      }
    });

    it('groups setup, operate, and improve sections without duplicate tab keys', () => {
      expect(NAV_GROUPS.map((g) => g.id)).toEqual(['setup', 'operate', 'improve']);
      expect(new Set(allTabs).size).toBe(allTabs.length);
    });
  });
});
