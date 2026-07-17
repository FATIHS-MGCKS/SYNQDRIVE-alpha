import { describe, expect, it } from 'vitest';
import {
  groupModesFromPermissions,
  permissionsPatchFromGroupModes,
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
  it('exposes four business groups', () => {
    expect(VOICE_PERMISSION_GROUPS.map(g => g.id)).toEqual([
      'information',
      'bookings',
      'customers',
      'operations',
    ]);
  });

  it('maps not_allowed group mode to disabled capabilities', () => {
    const patch = permissionsPatchFromGroupModes(basePermissions, 'bookings', 'not_allowed');
    expect(patch.bookingSearch).toBe('DISABLED');
    expect(patch.createBookingDraft).toBe('DISABLED');
  });

  it('round-trips group modes from stored permissions', () => {
    const modes = groupModesFromPermissions(basePermissions);
    expect(modes.information).toBeDefined();
    expect(modes.bookings).toBeDefined();
  });
});
