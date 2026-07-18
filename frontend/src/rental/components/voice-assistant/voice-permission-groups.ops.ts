import type { VoiceToolCapabilityKey, VoiceToolPermissionsMap } from './voice-assistant-permissions.ops';

export type VoicePermissionGroupId =
  | 'answer_information'
  | 'find_customers_bookings'
  | 'inspect_vehicles_invoices'
  | 'create_follow_ups'
  | 'request_changes'
  | 'resend_documents'
  | 'involve_staff';

export type VoicePermissionGroupMode =
  | 'not_allowed'
  | 'read_only'
  | 'customer_confirm'
  | 'staff_approval';

export interface VoicePermissionGroupDefinition {
  id: VoicePermissionGroupId;
  titleKey: string;
  descriptionKey: string;
  exampleKey: string;
  riskKey: string;
  capabilities: VoiceToolCapabilityKey[];
}

/** Mirrors backend MCP registry — UI impact summary only. */
export const VOICE_MCP_TOOLS_BY_CAPABILITY: Partial<Record<VoiceToolCapabilityKey, string[]>> = {
  answerGeneralQuestions: ['get_branch_information', 'get_business_hours'],
  customerLookup: ['identify_customer', 'get_customer_summary', 'get_invoice_status'],
  bookingSearch: ['find_booking', 'get_booking_status', 'get_vehicle_status'],
  createTask: ['create_callback_request', 'create_support_case', 'create_task'],
  modifyBooking: ['request_booking_change'],
  contactCustomer: ['request_document_resend'],
  modifyRecords: ['create_customer_note'],
};

export const VOICE_PERMISSION_GROUPS: VoicePermissionGroupDefinition[] = [
  {
    id: 'answer_information',
    titleKey: 'voice.permissions.group.answerInformation',
    descriptionKey: 'voice.permissions.group.answerInformationDesc',
    exampleKey: 'voice.permissions.group.answerInformationExample',
    riskKey: 'voice.permissions.group.answerInformationRisk',
    capabilities: ['answerGeneralQuestions', 'quotePrices'],
  },
  {
    id: 'find_customers_bookings',
    titleKey: 'voice.permissions.group.findCustomersBookings',
    descriptionKey: 'voice.permissions.group.findCustomersBookingsDesc',
    exampleKey: 'voice.permissions.group.findCustomersBookingsExample',
    riskKey: 'voice.permissions.group.findCustomersBookingsRisk',
    capabilities: ['customerLookup', 'bookingSearch'],
  },
  {
    id: 'inspect_vehicles_invoices',
    titleKey: 'voice.permissions.group.inspectVehiclesInvoices',
    descriptionKey: 'voice.permissions.group.inspectVehiclesInvoicesDesc',
    exampleKey: 'voice.permissions.group.inspectVehiclesInvoicesExample',
    riskKey: 'voice.permissions.group.inspectVehiclesInvoicesRisk',
    capabilities: ['customerLookup', 'bookingSearch'],
  },
  {
    id: 'create_follow_ups',
    titleKey: 'voice.permissions.group.createFollowUps',
    descriptionKey: 'voice.permissions.group.createFollowUpsDesc',
    exampleKey: 'voice.permissions.group.createFollowUpsExample',
    riskKey: 'voice.permissions.group.createFollowUpsRisk',
    capabilities: ['createTask', 'createDamageCase'],
  },
  {
    id: 'request_changes',
    titleKey: 'voice.permissions.group.requestChanges',
    descriptionKey: 'voice.permissions.group.requestChangesDesc',
    exampleKey: 'voice.permissions.group.requestChangesExample',
    riskKey: 'voice.permissions.group.requestChangesRisk',
    capabilities: ['createBookingDraft', 'modifyBooking', 'cancelBooking'],
  },
  {
    id: 'resend_documents',
    titleKey: 'voice.permissions.group.resendDocuments',
    descriptionKey: 'voice.permissions.group.resendDocumentsDesc',
    exampleKey: 'voice.permissions.group.resendDocumentsExample',
    riskKey: 'voice.permissions.group.resendDocumentsRisk',
    capabilities: ['contactCustomer'],
  },
  {
    id: 'involve_staff',
    titleKey: 'voice.permissions.group.involveStaff',
    descriptionKey: 'voice.permissions.group.involveStaffDesc',
    exampleKey: 'voice.permissions.group.involveStaffExample',
    riskKey: 'voice.permissions.group.involveStaffRisk',
    capabilities: ['emergencyEscalation', 'contactVendor', 'modifyRecords'],
  },
];

export const VOICE_PERMISSION_GROUP_MODE_OPTIONS: {
  value: VoicePermissionGroupMode;
  labelKey: string;
  descriptionKey: string;
}[] = [
  {
    value: 'not_allowed',
    labelKey: 'voice.permissions.mode.notAllowed',
    descriptionKey: 'voice.permissions.mode.notAllowedDesc',
  },
  {
    value: 'read_only',
    labelKey: 'voice.permissions.mode.readOnly',
    descriptionKey: 'voice.permissions.mode.readOnlyDesc',
  },
  {
    value: 'customer_confirm',
    labelKey: 'voice.permissions.mode.customerConfirm',
    descriptionKey: 'voice.permissions.mode.customerConfirmDesc',
  },
  {
    value: 'staff_approval',
    labelKey: 'voice.permissions.mode.staffApproval',
    descriptionKey: 'voice.permissions.mode.staffApprovalDesc',
  },
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

export function defaultOnboardingGroupModes(): Record<VoicePermissionGroupId, VoicePermissionGroupMode> {
  return {
    answer_information: 'read_only',
    find_customers_bookings: 'read_only',
    inspect_vehicles_invoices: 'read_only',
    create_follow_ups: 'staff_approval',
    request_changes: 'customer_confirm',
    resend_documents: 'customer_confirm',
    involve_staff: 'staff_approval',
  };
}

export function permissionsFromGroupModes(
  modes: Record<VoicePermissionGroupId, VoicePermissionGroupMode>,
  base?: VoiceToolPermissionsMap,
): VoiceToolPermissionsMap {
  const result = { ...base } as VoiceToolPermissionsMap;
  for (const group of VOICE_PERMISSION_GROUPS) {
    const patch = permissionsPatchFromGroupModes(
      result as VoiceToolPermissionsMap,
      group.id,
      modes[group.id] ?? 'not_allowed',
    );
    Object.assign(result, patch);
  }
  return result as VoiceToolPermissionsMap;
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
      result[group.id] = allReadSuggest && active.length > 0 ? 'read_only' : 'customer_confirm';
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

export function summarizeEnabledMcpTools(permissions: VoiceToolPermissionsMap): string[] {
  const enabled = new Set<string>();
  for (const [capability, tools] of Object.entries(VOICE_MCP_TOOLS_BY_CAPABILITY)) {
    const mode = permissions[capability as VoiceToolCapabilityKey];
    if (mode && mode !== 'DISABLED') {
      for (const tool of tools ?? []) enabled.add(tool);
    }
  }
  return Array.from(enabled).sort();
}
