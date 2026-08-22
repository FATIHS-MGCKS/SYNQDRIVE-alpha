import { describe, expect, it } from 'vitest';
import {
  canAccessCommunicationSettings,
  canAccessCommunicationSettingsSection,
  canManageVoiceSettings,
  canManageWhatsAppSettings,
  canViewSmsSettings,
  canViewSmsSettingsInSettings,
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

const whatsAppAdmin = (module: string, action: string) =>
  module === 'communication' && action === 'manage';

describe('communication-settings-permissions', () => {
  it('allows settings access when user can manage any channel', () => {
    expect(canAccessCommunicationSettings(fullAccess)).toBe(true);
    expect(canManageWhatsAppSettings(fullAccess)).toBe(true);
    expect(canManageVoiceSettings(fullAccess)).toBe(true);
    expect(canViewSmsSettings(fullAccess)).toBe(true);
    expect(canViewSmsSettingsInSettings(fullAccess)).toBe(true);
  });

  it('denies settings primary tab for communication.read only', () => {
    expect(canAccessCommunicationSettings(readOnlyCommunication)).toBe(false);
    expect(canManageWhatsAppSettings(readOnlyCommunication)).toBe(false);
    expect(canManageVoiceSettings(readOnlyCommunication)).toBe(false);
    expect(canViewSmsSettings(readOnlyCommunication)).toBe(true);
    expect(canViewSmsSettingsInSettings(readOnlyCommunication)).toBe(false);
  });

  it('allows SMS section inside settings when user has manage + read', () => {
    expect(canAccessCommunicationSettings(whatsAppAdmin)).toBe(true);
    expect(canViewSmsSettingsInSettings(whatsAppAdmin)).toBe(false);
    expect(canViewSmsSettingsInSettings(fullAccess)).toBe(true);
  });

  it('gates settings sections by channel management permission', () => {
    expect(canAccessCommunicationSettingsSection('overview', whatsAppAdmin)).toBe(true);
    expect(canAccessCommunicationSettingsSection('whatsapp', whatsAppAdmin)).toBe(true);
    expect(canAccessCommunicationSettingsSection('voice', whatsAppAdmin)).toBe(false);
    expect(canAccessCommunicationSettingsSection('sms', fullAccess)).toBe(true);
  });
});
