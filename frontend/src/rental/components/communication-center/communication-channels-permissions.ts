import type { CommunicationChannelsSection } from './communication-center.types';
import {
  hasCommunicationPermission,
} from '../../lib/communication-permissions';
import {
  canAccessCommunicationSettings,
  canManageVoiceSettings,
  canManageWhatsAppSettings,
  canViewSmsSettingsInSettings,
  type HasPermissionFn,
} from './communication-settings-permissions';

export {
  canManageVoiceSettings,
  canManageWhatsAppSettings,
  canViewSmsSettingsInSettings,
} from './communication-settings-permissions';

export function canAccessCommunicationChannels(
  hasPermission: HasPermissionFn,
  membershipRole?: string | null,
): boolean {
  return hasCommunicationPermission(hasPermission, 'read', membershipRole);
}

export function canAccessEmailChannelSettings(
  membershipRole?: string | null,
): boolean {
  return membershipRole === 'ORG_ADMIN' || membershipRole === 'MASTER_ADMIN';
}

export function canAccessWorkflowAutomations(
  hasPermission: HasPermissionFn,
): boolean {
  return hasPermission('workflow-automation', 'read');
}

export function canAccessCommunicationChannelsSection(
  section: CommunicationChannelsSection,
  hasPermission: HasPermissionFn,
  membershipRole?: string | null,
): boolean {
  if (!canAccessCommunicationChannels(hasPermission, membershipRole)) {
    return false;
  }

  switch (section) {
    case 'overview':
      return true;
    case 'whatsapp':
      return canManageWhatsAppSettings(hasPermission, membershipRole);
    case 'voice':
      return canManageVoiceSettings(hasPermission, membershipRole);
    case 'sms':
      return canViewSmsSettingsInSettings(hasPermission, membershipRole);
    case 'email':
      return canAccessEmailChannelSettings(membershipRole);
    default:
      return false;
  }
}

export function canViewCommunicationChannelsOverview(
  hasPermission: HasPermissionFn,
  membershipRole?: string | null,
): boolean {
  return (
    canAccessCommunicationChannels(hasPermission, membershipRole) &&
    (canManageWhatsAppSettings(hasPermission, membershipRole) ||
      canManageVoiceSettings(hasPermission, membershipRole) ||
      canViewSmsSettingsInSettings(hasPermission, membershipRole) ||
      canAccessEmailChannelSettings(membershipRole) ||
      canAccessCommunicationSettings(hasPermission, membershipRole))
  );
}
