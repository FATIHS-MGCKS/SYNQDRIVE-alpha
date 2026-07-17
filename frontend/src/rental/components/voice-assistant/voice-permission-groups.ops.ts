import type { VoiceToolCapabilityKey, VoiceToolPermissionsMap } from './voice-assistant-permissions.ops';

export type VoicePermissionGroupId =
  | 'information'
  | 'bookings'
  | 'customers'
  | 'operations';

export type VoicePermissionGroupMode =
  | 'not_allowed'
  | 'read_only'
  | 'customer_confirm'
  | 'staff_approval';

export interface VoicePermissionGroupDefinition {
  id: VoicePermissionGroupId;
  titleKey: string;
  descriptionKey: string;
  capabilities: VoiceToolCapabilityKey[];
}

export const VOICE_PERMISSION_GROUPS: VoicePermissionGroupDefinition[] = [
  {
    id: 'information',
    titleKey: 'voice.permissions.group.information',
    descriptionKey: 'voice.permissions.group.informationDesc',
    capabilities: ['answerGeneralQuestions', 'quotePrices'],
  },
  {
    id: 'bookings',
    titleKey: 'voice.permissions.group.bookings',
    descriptionKey: 'voice.permissions.group.bookingsDesc',
    capabilities: ['bookingSearch', 'createBookingDraft', 'modifyBooking', 'cancelBooking'],
  },
  {
    id: 'customers',
    titleKey: 'voice.permissions.group.customers',
    descriptionKey: 'voice.permissions.group.customersDesc',
    capabilities: ['customerLookup', 'contactCustomer', 'modifyRecords'],
  },
  {
    id: 'operations',
    titleKey: 'voice.permissions.group.operations',
    descriptionKey: 'voice.permissions.group.operationsDesc',
    capabilities: ['createTask', 'createDamageCase', 'contactVendor', 'emergencyEscalation'],
  },
];

export const VOICE_PERMISSION_GROUP_MODE_OPTIONS: {
  value: VoicePermissionGroupMode;
  labelKey: string;
}[] = [
  { value: 'not_allowed', labelKey: 'voice.permissions.mode.notAllowed' },
  { value: 'read_only', labelKey: 'voice.permissions.mode.readOnly' },
  { value: 'customer_confirm', labelKey: 'voice.permissions.mode.customerConfirm' },
  { value: 'staff_approval', labelKey: 'voice.permissions.mode.staffApproval' },
];

const READ_ONLY_CAPABILITIES = new Set<VoiceToolCapabilityKey>([
  'answerGeneralQuestions',
  'customerLookup',
  'bookingSearch',
  'quotePrices',
]);

function capabilityModeForGroup(
  capability: VoiceToolCapabilityKey,
  groupMode: VoicePermissionGroupMode,
): VoiceToolPermissionsMap[VoiceToolCapabilityKey] {
  switch (groupMode) {
    case 'not_allowed':
      return 'DISABLED';
    case 'read_only':
      return READ_ONLY_CAPABILITIES.has(capability) ? 'SUGGEST_ONLY' : 'DISABLED';
    case 'customer_confirm':
      if (capability === 'cancelBooking' || capability === 'modifyRecords') return 'DISABLED';
      return 'SUGGEST_ONLY';
    case 'staff_approval':
      if (capability === 'cancelBooking' || capability === 'modifyRecords') return 'DISABLED';
      if (capability === 'answerGeneralQuestions' || capability === 'emergencyEscalation') {
        return 'AUTONOMOUS';
      }
      return 'SUGGEST_ONLY';
    default:
      return 'DISABLED';
  }
}

export function groupModesFromPermissions(
  permissions: VoiceToolPermissionsMap,
): Record<VoicePermissionGroupId, VoicePermissionGroupMode> {
  const result = {} as Record<VoicePermissionGroupId, VoicePermissionGroupMode>;
  for (const group of VOICE_PERMISSION_GROUPS) {
    const modes = group.capabilities.map(key => permissions[key]);
    if (modes.every(mode => mode === 'DISABLED')) {
      result[group.id] = 'not_allowed';
      continue;
    }
    if (modes.every(mode => mode === 'SUGGEST_ONLY' || mode === 'DISABLED')) {
      const active = group.capabilities.filter(key => permissions[key] !== 'DISABLED');
      const allReadSuggest = active.every(
        key => READ_ONLY_CAPABILITIES.has(key) && permissions[key] === 'SUGGEST_ONLY',
      );
      result[group.id] = allReadSuggest && active.length > 0 ? 'read_only' : 'staff_approval';
      continue;
    }
    if (modes.some(mode => mode === 'AUTONOMOUS')) {
      result[group.id] = 'staff_approval';
      continue;
    }
    result[group.id] = 'customer_confirm';
  }
  return result;
}

export function permissionsPatchFromGroupModes(
  current: VoiceToolPermissionsMap,
  groupId: VoicePermissionGroupId,
  mode: VoicePermissionGroupMode,
): Partial<VoiceToolPermissionsMap> {
  const group = VOICE_PERMISSION_GROUPS.find(g => g.id === groupId);
  if (!group) return {};
  const patch: Partial<VoiceToolPermissionsMap> = {};
  for (const capability of group.capabilities) {
    patch[capability] = capabilityModeForGroup(capability, mode);
  }
  return { ...current, ...patch };
}
