import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const apiPath = resolve(import.meta.dirname, '../../../lib/api.ts');

describe('voice assistant API contract characterization', () => {
  const apiSource = readFileSync(apiPath, 'utf8');

  it('scopes tenant voice routes under /organizations/:orgId/voice-assistant', () => {
    expect(apiSource).toContain('voiceAssistant: {');
    expect(apiSource).toContain('get: (orgId: string) => get<VoiceAssistantData>(`/organizations/${orgId}/voice-assistant`)');
    expect(apiSource).toContain('`/organizations/${orgId}/voice-assistant/readiness`');
    expect(apiSource).toContain('`/organizations/${orgId}/voice-assistant/conversations');
    expect(apiSource).toContain('`/organizations/${orgId}/voice-assistant/phone-numbers`');
    expect(apiSource).toContain('`/organizations/${orgId}/voice-assistant/telephony-settings`');
  });

  it('exposes activation lifecycle endpoints on the tenant namespace', () => {
    expect(apiSource).toContain('`/organizations/${orgId}/voice-assistant/activate`');
    expect(apiSource).toContain('`/organizations/${orgId}/voice-assistant/deactivate`');
    expect(apiSource).toContain('`/organizations/${orgId}/voice-assistant/test-session`');
    expect(apiSource).toContain('`/organizations/${orgId}/voice-assistant/conversations/sync`');
  });

  it('keeps master admin routes on /admin/voice-assistant without tenant path injection', () => {
    expect(apiSource).toContain("overview: () => get<VoiceAssistantAdminOverview>('/admin/voice-assistant/overview')");
    expect(apiSource).toContain('`/admin/voice-assistant/organizations/${orgId}`');
    expect(apiSource).toContain('`/admin/voice-assistant/organizations/${orgId}/sync`');
  });

  it('types masked caller numbers on conversation entries', () => {
    expect(apiSource).toMatch(/export interface VoiceConversationEntry[\s\S]*callerNumber: string \| null/);
  });

  it('types readiness checks used by operator UI', () => {
    expect(apiSource).toMatch(/export interface VoiceAssistantReadiness[\s\S]*checks:/);
    expect(apiSource).toMatch(/key: string[\s\S]*ok: boolean[\s\S]*required\?: boolean/);
  });

  describe('pending ADR targets', () => {
    it.todo('ADR target: tenant voice routes should enforce billing plan feature flags client-side');
  });
});
