import { describe, expect, it } from 'vitest';
import {
  hasCommunicationPermission,
  hasInternalAiAssistantPermission,
  hasVoiceNavigationAccess,
  hasVoiceOperationalLegacyAccess,
  type HasPermissionFn,
} from './communication-permissions';

const denyAll: HasPermissionFn = () => false;

describe('communication-permissions (frontend nav helpers)', () => {
  it('grants WhatsApp nav via legacy ai-assistant read', () => {
    const hasPermission: HasPermissionFn = (module, level) =>
      module === 'ai-assistant' && level === 'read';
    expect(hasCommunicationPermission(hasPermission, 'read')).toBe(true);
  });

  it('grants Voice nav for operational staff via legacy role bridge', () => {
    expect(hasVoiceOperationalLegacyAccess('WORKER')).toBe(true);
    expect(hasVoiceNavigationAccess(denyAll, 'WORKER')).toBe(true);
  });

  it('grants Communication Center entry for voice-assistant.read without communication.read', () => {
    const hasPermission: HasPermissionFn = (module, level) =>
      module === 'voice-assistant' && level === 'read';
    expect(hasCommunicationPermission(hasPermission, 'read')).toBe(false);
    expect(hasVoiceNavigationAccess(hasPermission, 'ORG_ADMIN')).toBe(true);
  });

  it('denies Voice nav for DRIVER', () => {
    expect(hasVoiceOperationalLegacyAccess('DRIVER')).toBe(false);
    expect(hasVoiceNavigationAccess(denyAll, 'DRIVER')).toBe(false);
  });

  it('does not grant internal AI from communication permission alone', () => {
    const hasPermission: HasPermissionFn = (module) => module === 'communication';
    expect(hasInternalAiAssistantPermission(hasPermission, 'read')).toBe(false);
  });

  it('grants internal AI only from ai-assistant module', () => {
    const hasPermission: HasPermissionFn = (module, level) =>
      module === 'ai-assistant' && level === 'read';
    expect(hasInternalAiAssistantPermission(hasPermission, 'read')).toBe(true);
  });
});
