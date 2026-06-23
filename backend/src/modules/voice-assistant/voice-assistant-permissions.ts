import { BadRequestException } from '@nestjs/common';
import { VoiceAssistant } from '@prisma/client';

export const VoicePermissionMode = {
  DISABLED: 'DISABLED',
  SUGGEST_ONLY: 'SUGGEST_ONLY',
  AUTONOMOUS: 'AUTONOMOUS',
} as const;

export type VoicePermissionMode =
  (typeof VoicePermissionMode)[keyof typeof VoicePermissionMode];

export const VOICE_PERMISSION_MODES: VoicePermissionMode[] = [
  VoicePermissionMode.DISABLED,
  VoicePermissionMode.SUGGEST_ONLY,
  VoicePermissionMode.AUTONOMOUS,
];

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

export type VoiceRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type VoiceToolPermissionsMap = Record<VoiceToolCapabilityKey, VoicePermissionMode>;

export interface VoiceToolCapabilityDefinition {
  key: VoiceToolCapabilityKey;
  label: string;
  description: string;
  riskLevel: VoiceRiskLevel;
  defaultMode: VoicePermissionMode;
  notes?: string;
  /** AUTONOMOUS is never allowed regardless of outbound settings. */
  blockAutonomous?: boolean;
  /** AUTONOMOUS requires outboundEnabled on the assistant. */
  requiresOutboundForAutonomous?: boolean;
}

export const VOICE_TOOL_CAPABILITIES: VoiceToolCapabilityDefinition[] = [
  {
    key: 'answerGeneralQuestions',
    label: 'Answer general questions',
    description: 'Respond to FAQs about the business, hours, and services.',
    riskLevel: 'low',
    defaultMode: VoicePermissionMode.AUTONOMOUS,
  },
  {
    key: 'customerLookup',
    label: 'Customer lookup',
    description: 'Search customer records to personalize the conversation.',
    riskLevel: 'medium',
    defaultMode: VoicePermissionMode.SUGGEST_ONLY,
    notes: 'Read-only lookup; no record changes.',
  },
  {
    key: 'bookingSearch',
    label: 'Booking search',
    description: 'Find existing reservations by reference or customer.',
    riskLevel: 'low',
    defaultMode: VoicePermissionMode.SUGGEST_ONLY,
  },
  {
    key: 'createBookingDraft',
    label: 'Create booking draft',
    description: 'Prepare a draft reservation for staff review.',
    riskLevel: 'medium',
    defaultMode: VoicePermissionMode.SUGGEST_ONLY,
  },
  {
    key: 'modifyBooking',
    label: 'Modify booking',
    description: 'Change dates, vehicle, or station on an existing booking.',
    riskLevel: 'high',
    defaultMode: VoicePermissionMode.SUGGEST_ONLY,
  },
  {
    key: 'cancelBooking',
    label: 'Cancel booking',
    description: 'Cancel or refund a reservation.',
    riskLevel: 'critical',
    defaultMode: VoicePermissionMode.DISABLED,
    blockAutonomous: true,
    notes: 'Autonomous cancellation is never permitted.',
  },
  {
    key: 'quotePrices',
    label: 'Quote prices',
    description: 'Provide rental price estimates from tariff data.',
    riskLevel: 'high',
    defaultMode: VoicePermissionMode.SUGGEST_ONLY,
    blockAutonomous: true,
    notes: 'Autonomous quotes blocked until live tariff integration is verified.',
  },
  {
    key: 'createTask',
    label: 'Create task',
    description: 'Create follow-up tasks for the operations team.',
    riskLevel: 'medium',
    defaultMode: VoicePermissionMode.SUGGEST_ONLY,
  },
  {
    key: 'createDamageCase',
    label: 'Create damage / breakdown case',
    description: 'Open damage or roadside assistance cases.',
    riskLevel: 'high',
    defaultMode: VoicePermissionMode.SUGGEST_ONLY,
  },
  {
    key: 'contactCustomer',
    label: 'Contact customer',
    description: 'Initiate outbound contact with a customer.',
    riskLevel: 'high',
    defaultMode: VoicePermissionMode.SUGGEST_ONLY,
    requiresOutboundForAutonomous: true,
  },
  {
    key: 'contactVendor',
    label: 'Contact vendor / workshop',
    description: 'Reach out to workshops or partners.',
    riskLevel: 'medium',
    defaultMode: VoicePermissionMode.SUGGEST_ONLY,
    requiresOutboundForAutonomous: true,
  },
  {
    key: 'modifyRecords',
    label: 'Modify customer / vehicle records',
    description: 'Update master data for customers or vehicles.',
    riskLevel: 'critical',
    defaultMode: VoicePermissionMode.DISABLED,
    blockAutonomous: true,
    notes: 'Record changes require human approval.',
  },
  {
    key: 'emergencyEscalation',
    label: 'Emergency escalation',
    description: 'Immediately escalate accidents, breakdowns, or safety issues.',
    riskLevel: 'low',
    defaultMode: VoicePermissionMode.AUTONOMOUS,
  },
];

const CAPABILITY_BY_KEY = new Map(
  VOICE_TOOL_CAPABILITIES.map((c) => [c.key, c]),
);

export const VOICE_TOOL_CAPABILITY_KEYS = VOICE_TOOL_CAPABILITIES.map((c) => c.key);

export function defaultToolPermissions(): VoiceToolPermissionsMap {
  return Object.fromEntries(
    VOICE_TOOL_CAPABILITIES.map((c) => [c.key, c.defaultMode]),
  ) as VoiceToolPermissionsMap;
}

export function isValidToolPermissionsInput(
  value: unknown,
): value is Partial<VoiceToolPermissionsMap> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.entries(value as Record<string, unknown>).every(
    ([key, mode]) =>
      VOICE_TOOL_CAPABILITY_KEYS.includes(key as VoiceToolCapabilityKey) &&
      VOICE_PERMISSION_MODES.includes(mode as VoicePermissionMode),
  );
}

export function resolveToolPermissions(assistant: VoiceAssistant): VoiceToolPermissionsMap {
  const stored = assistant.toolPermissions;
  if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
    const merged = { ...defaultToolPermissions() };
    for (const key of VOICE_TOOL_CAPABILITY_KEYS) {
      const mode = (stored as Record<string, unknown>)[key];
      if (VOICE_PERMISSION_MODES.includes(mode as VoicePermissionMode)) {
        merged[key] = mode as VoicePermissionMode;
      }
    }
    return merged;
  }
  return legacyBooleansToToolPermissions(assistant);
}

function legacyBooleansToToolPermissions(
  assistant: Pick<VoiceAssistant, 'permAnswerQuestions' | 'permManageBookings' | 'permCreateBookingDrafts' | 'permCancelBookings' | 'permCreateTasks' | 'permWorkshopHandling' | 'permBreakdownSupport' | 'permContactCustomers' | 'permContactVendors' | 'permModifyRecords' | 'permCreateActions' | 'permEmergencyHandling'>,
): VoiceToolPermissionsMap {
  const mode = (enabled: boolean, autonomous = false): VoicePermissionMode =>
    !enabled
      ? VoicePermissionMode.DISABLED
      : autonomous
        ? VoicePermissionMode.AUTONOMOUS
        : VoicePermissionMode.SUGGEST_ONLY;

  return {
    answerGeneralQuestions: mode(assistant.permAnswerQuestions, true),
    customerLookup: mode(assistant.permManageBookings),
    bookingSearch: mode(assistant.permManageBookings),
    createBookingDraft: mode(assistant.permCreateBookingDrafts),
    modifyBooking: mode(assistant.permManageBookings),
    cancelBooking: assistant.permCancelBookings
      ? VoicePermissionMode.SUGGEST_ONLY
      : VoicePermissionMode.DISABLED,
    quotePrices: VoicePermissionMode.DISABLED,
    createTask: mode(assistant.permCreateTasks),
    createDamageCase: mode(
      assistant.permBreakdownSupport || assistant.permWorkshopHandling,
    ),
    contactCustomer: mode(assistant.permContactCustomers),
    contactVendor: mode(assistant.permContactVendors),
    modifyRecords:
      assistant.permModifyRecords || assistant.permCreateActions
        ? VoicePermissionMode.SUGGEST_ONLY
        : VoicePermissionMode.DISABLED,
    emergencyEscalation: mode(assistant.permEmergencyHandling, true),
  };
}

export function syncLegacyBooleansFromToolPermissions(
  permissions: VoiceToolPermissionsMap,
): Pick<
  VoiceAssistant,
  | 'permAnswerQuestions'
  | 'permManageBookings'
  | 'permCreateBookingDrafts'
  | 'permCancelBookings'
  | 'permCreateTasks'
  | 'permWorkshopHandling'
  | 'permBreakdownSupport'
  | 'permContactCustomers'
  | 'permContactVendors'
  | 'permModifyRecords'
  | 'permCreateActions'
  | 'permEmergencyHandling'
> {
  const enabled = (key: VoiceToolCapabilityKey) =>
    permissions[key] !== VoicePermissionMode.DISABLED;

  return {
    permAnswerQuestions: enabled('answerGeneralQuestions'),
    permManageBookings:
      enabled('bookingSearch') ||
      enabled('modifyBooking') ||
      enabled('customerLookup'),
    permCreateBookingDrafts: enabled('createBookingDraft'),
    permCancelBookings: enabled('cancelBooking'),
    permCreateTasks: enabled('createTask'),
    permWorkshopHandling: enabled('createDamageCase'),
    permBreakdownSupport: enabled('createDamageCase'),
    permContactCustomers: enabled('contactCustomer'),
    permContactVendors: enabled('contactVendor'),
    permModifyRecords: enabled('modifyRecords'),
    permCreateActions: enabled('modifyRecords'),
    permEmergencyHandling: enabled('emergencyEscalation'),
  };
}

export function validateToolPermissionsUpdate(
  patch: Partial<VoiceToolPermissionsMap>,
  current: VoiceToolPermissionsMap,
  assistant: Pick<VoiceAssistant, 'outboundEnabled'>,
): VoiceToolPermissionsMap {
  if (!isValidToolPermissionsInput(patch)) {
    throw new BadRequestException('Invalid tool permission modes or unknown capability keys');
  }

  const merged: VoiceToolPermissionsMap = { ...current, ...patch };

  for (const def of VOICE_TOOL_CAPABILITIES) {
    const mode = merged[def.key];

    if (def.blockAutonomous && mode === VoicePermissionMode.AUTONOMOUS) {
      throw new BadRequestException(
        `${def.label} cannot be set to AUTONOMOUS. Use SUGGEST_ONLY or DISABLED.`,
      );
    }

    if (
      def.requiresOutboundForAutonomous &&
      mode === VoicePermissionMode.AUTONOMOUS &&
      !assistant.outboundEnabled
    ) {
      throw new BadRequestException(
        `${def.label} requires outbound telephony to be enabled for AUTONOMOUS mode.`,
      );
    }
  }

  return merged;
}

export interface VoiceToolPolicyCapability {
  key: VoiceToolCapabilityKey;
  label: string;
  mode: VoicePermissionMode;
  riskLevel: VoiceRiskLevel;
  allowed: boolean;
  requiresHumanConfirmation: boolean;
  notes?: string;
}

export interface VoiceToolPolicy {
  version: 1;
  generatedAt: string;
  capabilities: VoiceToolPolicyCapability[];
  summary: {
    autonomous: VoiceToolCapabilityKey[];
    suggestOnly: VoiceToolCapabilityKey[];
    disabled: VoiceToolCapabilityKey[];
  };
}

export function buildToolPolicyForAssistant(assistant: VoiceAssistant): VoiceToolPolicy {
  const permissions = resolveToolPermissions(assistant);

  const capabilities: VoiceToolPolicyCapability[] = VOICE_TOOL_CAPABILITIES.map((def) => {
    const mode = permissions[def.key];
    const allowed = mode !== VoicePermissionMode.DISABLED;
    return {
      key: def.key,
      label: def.label,
      mode,
      riskLevel: def.riskLevel,
      allowed,
      requiresHumanConfirmation: mode === VoicePermissionMode.SUGGEST_ONLY,
      notes: def.notes,
    };
  });

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    capabilities,
    summary: {
      autonomous: VOICE_TOOL_CAPABILITY_KEYS.filter(
        (k) => permissions[k] === VoicePermissionMode.AUTONOMOUS,
      ),
      suggestOnly: VOICE_TOOL_CAPABILITY_KEYS.filter(
        (k) => permissions[k] === VoicePermissionMode.SUGGEST_ONLY,
      ),
      disabled: VOICE_TOOL_CAPABILITY_KEYS.filter(
        (k) => permissions[k] === VoicePermissionMode.DISABLED,
      ),
    },
  };
}

export function buildPermissionsPromptSection(assistant: VoiceAssistant): string {
  const policy = buildToolPolicyForAssistant(assistant);
  const lines: string[] = ['Tool & action policy:'];

  for (const cap of policy.capabilities) {
    if (!cap.allowed) continue;
    const modeLabel =
      cap.mode === VoicePermissionMode.AUTONOMOUS
        ? 'may execute autonomously'
        : 'may suggest only — human must confirm before execution';
    lines.push(`- ${cap.label}: ${modeLabel}`);
  }

  if (lines.length === 1) {
    lines.push('- No operational tools enabled. Answer questions only.');
  }

  return `\n\n${lines.join('\n')}`;
}
