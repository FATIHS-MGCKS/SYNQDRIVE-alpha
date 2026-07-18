import { describe, expect, it } from 'vitest';
import {
  defaultOnboardingGroupModes,
  groupModesFromPermissions,
  permissionsFromGroupModes,
  permissionsPatchFromGroupModes,
  summarizeEnabledMcpTools,
  VOICE_PERMISSION_GROUPS,
} from './voice-permission-groups.ops';
import type { VoiceToolPermissionsMap } from './voice-assistant-permissions.ops';

const basePermissions: VoiceToolPermissionsMap = {
  answerGeneralQuestions: 'AUTONOMOUS',
  customerLookup: 'SUGGEST_ONLY',
  bookingSearch: 'SUGGEST_ONLY',
  createBookingDraft: 'DISABLED',
  modifyBooking: 'DISABLED',
  cancelBooking: 'DISABLED',
  quotePrices: 'DISABLED',
  createTask: 'DISABLED',
  createDamageCase: 'SUGGEST_ONLY',
  contactCustomer: 'DISABLED',
  contactVendor: 'DISABLED',
  modifyRecords: 'DISABLED',
  emergencyEscalation: 'AUTONOMOUS',
};

describe('voice-permission-groups.ops', () => {
  it('exposes seven business permission groups', () => {
    expect(VOICE_PERMISSION_GROUPS.map(g => g.id)).toEqual([
      'answer_information',
      'find_customers_bookings',
      'inspect_vehicles_invoices',
      'create_follow_ups',
      'request_changes',
      'resend_documents',
      'involve_staff',
    ]);
  });

  it('maps not_allowed group mode to disabled capabilities', () => {
    const patch = permissionsPatchFromGroupModes(
      basePermissions,
      'find_customers_bookings',
      'not_allowed',
    );
    expect(patch.customerLookup).toBe('DISABLED');
    expect(patch.bookingSearch).toBe('DISABLED');
  });

  it('round-trips group modes from stored permissions', () => {
    const modes = groupModesFromPermissions(basePermissions);
    expect(modes.answer_information).toBeDefined();
    expect(modes.find_customers_bookings).toBeDefined();
  });

  it('applies safe onboarding defaults', () => {
    const defaults = defaultOnboardingGroupModes();
    expect(defaults.request_changes).toBe('customer_confirm');
    expect(defaults.involve_staff).toBe('staff_approval');
    const permissions = permissionsFromGroupModes(defaults);
    expect(permissions.cancelBooking).toBe('DISABLED');
    expect(permissions.modifyRecords).toBe('DISABLED');
  });

  it('summarizes enabled MCP tools for impact summary', () => {
    const permissions = permissionsFromGroupModes(defaultOnboardingGroupModes());
    const tools = summarizeEnabledMcpTools(permissions);
    expect(tools).toContain('get_branch_information');
    expect(tools).toContain('identify_customer');
    expect(tools).not.toContain('create_customer_note');
    expect(permissions.cancelBooking).toBe('DISABLED');
    expect(permissions.modifyRecords).toBe('DISABLED');
  });
});
