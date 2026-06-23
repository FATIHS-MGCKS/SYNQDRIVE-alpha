import { BadRequestException } from '@nestjs/common';
import {
  buildToolPolicyForAssistant,
  defaultToolPermissions,
  resolveToolPermissions,
  validateToolPermissionsUpdate,
  VoicePermissionMode,
} from './voice-assistant-permissions';

describe('voice-assistant-permissions', () => {
  const baseAssistant = {
    toolPermissions: null,
    permAnswerQuestions: true,
    permManageBookings: false,
    permCreateBookingDrafts: false,
    permCancelBookings: false,
    permCreateTasks: false,
    permWorkshopHandling: false,
    permBreakdownSupport: false,
    permContactCustomers: false,
    permContactVendors: false,
    permModifyRecords: false,
    permCreateActions: false,
    permEmergencyHandling: true,
    outboundEnabled: false,
  };

  it('resolves defaults from legacy booleans when toolPermissions is null', () => {
    const perms = resolveToolPermissions(baseAssistant as any);
    expect(perms.answerGeneralQuestions).toBe(VoicePermissionMode.AUTONOMOUS);
    expect(perms.cancelBooking).toBe(VoicePermissionMode.DISABLED);
    expect(perms.emergencyEscalation).toBe(VoicePermissionMode.AUTONOMOUS);
  });

  it('builds structured tool policy', () => {
    const policy = buildToolPolicyForAssistant({
      ...baseAssistant,
      toolPermissions: defaultToolPermissions(),
    } as any);
    expect(policy.version).toBe(1);
    expect(policy.capabilities.length).toBeGreaterThan(10);
    expect(policy.summary.autonomous).toContain('answerGeneralQuestions');
  });

  it('rejects autonomous cancel booking', () => {
    const current = defaultToolPermissions();
    expect(() =>
      validateToolPermissionsUpdate(
        { cancelBooking: VoicePermissionMode.AUTONOMOUS },
        current,
        baseAssistant as any,
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects autonomous modify records', () => {
    const current = defaultToolPermissions();
    expect(() =>
      validateToolPermissionsUpdate(
        { modifyRecords: VoicePermissionMode.AUTONOMOUS },
        current,
        baseAssistant as any,
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects outbound contact autonomous without outboundEnabled', () => {
    const current = defaultToolPermissions();
    expect(() =>
      validateToolPermissionsUpdate(
        { contactCustomer: VoicePermissionMode.AUTONOMOUS },
        current,
        { ...baseAssistant, outboundEnabled: false } as any,
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects unknown permission modes', () => {
    const current = defaultToolPermissions();
    expect(() =>
      validateToolPermissionsUpdate(
        { createTask: 'INVALID' as VoicePermissionMode },
        current,
        baseAssistant as any,
      ),
    ).toThrow(BadRequestException);
  });
});
