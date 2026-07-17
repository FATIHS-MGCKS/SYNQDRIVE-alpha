import { VoiceConnectionStatus } from '@prisma/client';
import {
  buildAdminWarnings,
  readinessPercent,
  resolveProviderWarning,
} from './voice-assistant-admin.util';
import type { ReadinessResult } from './voice-assistant.service';

describe('voice-assistant-admin.util', () => {
  it('computes readiness percent from required checks', () => {
    const readiness: ReadinessResult = {
      ready: false,
      missing: ['Voice'],
      checks: [
        { key: 'voice', label: 'Voice', ok: true, required: true },
        { key: 'prompt', label: 'Prompt', ok: false, required: true },
      ],
    };
    expect(readinessPercent(readiness)).toBe(50);
  });

  it('warns when provider is not configured', () => {
    expect(resolveProviderWarning(false, null, null)).toContain('telephony provider');
  });

  it('builds admin warnings for incomplete readiness', () => {
    const assistant = {
      status: 'ACTIVE',
      telephonyEnabled: true,
      inboundEnabled: true,
      connectionStatus: VoiceConnectionStatus.CONNECTED,
    } as never;
    const readiness: ReadinessResult = {
      ready: false,
      missing: ['Phone number assigned'],
      checks: [],
    };
    const telephony = {
      status: 'no_phone_number' as const,
      label: 'No phone number',
      detail: 'Assign a phone number.',
      providerConfigured: true,
      pstnProvider: 'elevenlabs' as const,
      agentProvisioned: true,
      phoneAssigned: false,
      inboundReady: false,
      outboundEnabled: false,
    };
    const warnings = buildAdminWarnings(assistant, readiness, telephony, true);
    expect(warnings.some((w) => w.includes('Readiness incomplete'))).toBe(true);
  });
});
