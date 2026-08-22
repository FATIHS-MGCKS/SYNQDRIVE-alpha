import type { HasPermissionFn } from '../../lib/communication-permissions';
import {
  hasCommunicationPermission,
  hasVoiceAssistantAdminPermission,
} from '../../lib/communication-permissions';

export type { HasPermissionFn };

export function canManageWhatsAppSettings(
  hasPermission: HasPermissionFn,
  membershipRole?: string | null,
): boolean {
  return hasCommunicationPermission(hasPermission, 'manage', membershipRole);
}

export function canManageVoiceSettings(
  hasPermission: HasPermissionFn,
  membershipRole?: string | null,
): boolean {
  return hasVoiceAssistantAdminPermission(hasPermission, 'write', membershipRole);
}

export function canViewSmsSettings(
  hasPermission: HasPermissionFn,
  membershipRole?: string | null,
): boolean {
  return hasCommunicationPermission(hasPermission, 'read', membershipRole);
}

export function canManageSmsSettings(
  hasPermission: HasPermissionFn,
  membershipRole?: string | null,
): boolean {
  return hasCommunicationPermission(hasPermission, 'manage', membershipRole);
}

export function canAccessCommunicationSettings(
  hasPermission: HasPermissionFn,
  membershipRole?: string | null,
): boolean {
  return (
    canManageWhatsAppSettings(hasPermission, membershipRole) ||
    canManageVoiceSettings(hasPermission, membershipRole) ||
    canViewSmsSettings(hasPermission, membershipRole)
  );
}

export function canAccessCommunicationSettingsSection(
  section: 'overview' | 'whatsapp' | 'voice' | 'sms',
  hasPermission: HasPermissionFn,
  membershipRole?: string | null,
): boolean {
  switch (section) {
    case 'overview':
      return canAccessCommunicationSettings(hasPermission, membershipRole);
    case 'whatsapp':
      return canManageWhatsAppSettings(hasPermission, membershipRole);
    case 'voice':
      return canManageVoiceSettings(hasPermission, membershipRole);
    case 'sms':
      return canViewSmsSettings(hasPermission, membershipRole);
    default:
      return false;
  }
}
