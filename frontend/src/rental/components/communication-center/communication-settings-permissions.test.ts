import { describe, expect, it } from 'vitest';
import {
  canAccessCommunicationSettings,
  canManageVoiceSettings,
  canManageWhatsAppSettings,
  canViewSmsSettings,
} from './communication-settings-permissions';

const fullAccess = (module: string, action: string) => {
  if (module === 'communication') {
    return action === 'read' || action === 'manage';
  }
  if (module === 'voice-assistant') {
    return action === 'write';
  }
  return false;
};

const readOnlyCommunication = (module: string, action: string) =>
  module === 'communication' && action === 'read';

describe('communication-settings-permissions', () => {
  it('allows settings access when user can manage any channel', () => {
    expect(canAccessCommunicationSettings(fullAccess)).toBe(true);
    expect(canManageWhatsAppSettings(fullAccess)).toBe(true);
    expect(canManageVoiceSettings(fullAccess)).toBe(true);
    expect(canViewSmsSettings(fullAccess)).toBe(true);
  });

  it('allows SMS view with communication.read only', () => {
    expect(canAccessCommunicationSettings(readOnlyCommunication)).toBe(true);
    expect(canManageWhatsAppSettings(readOnlyCommunication)).toBe(false);
    expect(canManageVoiceSettings(readOnlyCommunication)).toBe(false);
    expect(canViewSmsSettings(readOnlyCommunication)).toBe(true);
  });
});
