export type VoicePermissionMode = 'DISABLED' | 'SUGGEST_ONLY' | 'AUTONOMOUS';

export type VoiceRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type VoiceToolCapabilityKey =
  | 'answerGeneralQuestions'
  | 'customerLookup'
  | 'bookingSearch'
  | 'createBookingDraft'
  | 'modifyBooking'
  | 'cancelBooking'
  | 'quotePrices'
  | 'createTask'
  | 'createDamageCase'
  | 'contactCustomer'
  | 'contactVendor'
  | 'modifyRecords'
  | 'emergencyEscalation';

export type VoiceToolPermissionsMap = Record<VoiceToolCapabilityKey, VoicePermissionMode>;

export interface VoiceToolCapabilityRow {
  key: VoiceToolCapabilityKey;
  label: string;
  description: string;
  riskLevel: VoiceRiskLevel;
  notes?: string;
  blockAutonomous?: boolean;
  requiresOutboundForAutonomous?: boolean;
}

export const VOICE_PERMISSION_MODE_OPTIONS: { value: VoicePermissionMode; label: string }[] = [
  { value: 'DISABLED', label: 'Disabled' },
  { value: 'SUGGEST_ONLY', label: 'Suggest only' },
  { value: 'AUTONOMOUS', label: 'Autonomous' },
];

export const VOICE_TOOL_CAPABILITY_ROWS: VoiceToolCapabilityRow[] = [
  {
    key: 'answerGeneralQuestions',
    label: 'Answer general questions',
    description: 'Respond to FAQs about the business, hours, and services.',
    riskLevel: 'low',
  },
  {
    key: 'customerLookup',
    label: 'Customer lookup',
    description: 'Search customer records to personalize the conversation.',
    riskLevel: 'medium',
    notes: 'Read-only lookup',
  },
  {
    key: 'bookingSearch',
    label: 'Booking search',
    description: 'Find existing reservations by reference or customer.',
    riskLevel: 'low',
  },
  {
    key: 'createBookingDraft',
    label: 'Create booking draft',
    description: 'Prepare a draft reservation for staff review.',
    riskLevel: 'medium',
  },
  {
    key: 'modifyBooking',
    label: 'Modify booking',
    description: 'Change dates, vehicle, or station on an existing booking.',
    riskLevel: 'high',
  },
  {
    key: 'cancelBooking',
    label: 'Cancel booking',
    description: 'Cancel or refund a reservation.',
    riskLevel: 'critical',
    blockAutonomous: true,
    notes: 'Autonomous cancellation is never permitted',
  },
  {
    key: 'quotePrices',
    label: 'Quote prices',
    description: 'Provide rental price estimates from tariff data.',
    riskLevel: 'high',
    blockAutonomous: true,
    notes: 'Autonomous quotes blocked until tariff integration is verified',
  },
  {
    key: 'createTask',
    label: 'Create task',
    description: 'Create follow-up tasks for the operations team.',
    riskLevel: 'medium',
  },
  {
    key: 'createDamageCase',
    label: 'Create damage / breakdown case',
    description: 'Open damage or roadside assistance cases.',
    riskLevel: 'high',
  },
  {
    key: 'contactCustomer',
    label: 'Contact customer',
    description: 'Initiate outbound contact with a customer.',
    riskLevel: 'high',
    requiresOutboundForAutonomous: true,
  },
  {
    key: 'contactVendor',
    label: 'Contact vendor / workshop',
    description: 'Reach out to workshops or partners.',
    riskLevel: 'medium',
    requiresOutboundForAutonomous: true,
  },
  {
    key: 'modifyRecords',
    label: 'Modify customer / vehicle records',
    description: 'Update master data for customers or vehicles.',
    riskLevel: 'critical',
    blockAutonomous: true,
    notes: 'Record changes require human approval',
  },
  {
    key: 'emergencyEscalation',
    label: 'Emergency escalation',
    description: 'Immediately escalate accidents, breakdowns, or safety issues.',
    riskLevel: 'low',
  },
];

export function riskTone(level: VoiceRiskLevel): 'success' | 'info' | 'watch' | 'critical' {
  switch (level) {
    case 'low':
      return 'success';
    case 'medium':
      return 'info';
    case 'high':
      return 'watch';
    default:
      return 'critical';
  }
}

export function requiresHumanConfirmation(mode: VoicePermissionMode): boolean {
  return mode === 'SUGGEST_ONLY';
}

export function isAutonomousBlocked(
  row: VoiceToolCapabilityRow,
  outboundEnabled: boolean,
): boolean {
  if (row.blockAutonomous) return true;
  if (row.requiresOutboundForAutonomous && !outboundEnabled) return true;
  return false;
}

export function needsDangerousAutonomousConfirm(
  row: VoiceToolCapabilityRow,
  mode: VoicePermissionMode,
): boolean {
  if (mode !== 'AUTONOMOUS') return false;
  if (row.blockAutonomous) return false;
  return row.riskLevel === 'high' || row.riskLevel === 'critical';
}

export function mergeToolPermissions(
  base: VoiceToolPermissionsMap,
  patch: Partial<VoiceToolPermissionsMap>,
): VoiceToolPermissionsMap {
  return { ...base, ...patch };
}
