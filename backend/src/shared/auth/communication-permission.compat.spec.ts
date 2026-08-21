import { MembershipRole } from '@prisma/client';
import { computeEffectiveAccess } from '@modules/users/policies/effective-access-engine';
import {
  isCommunicationPermissionGranted,
  isInternalAiAssistantPermissionGranted,
  isVoiceAssistantPermissionGranted,
} from './communication-permission.compat';

function accessFor(
  role: MembershipRole,
  permissions: Record<string, { read: boolean; write: boolean; manage?: boolean }> | null,
) {
  return computeEffectiveAccess({
    platformRole: 'USER',
    membership: {
      organizationId: 'org-1',
      role,
      status: 'ACTIVE',
      permissions,
    },
    resourceContext: { organizationId: 'org-1' },
  });
}

describe('communication-permission.compat', () => {
  describe('isCommunicationPermissionGranted', () => {
    it('denies org member without communication or legacy ai-assistant', () => {
      const access = accessFor(MembershipRole.WORKER, {
        dashboard: { read: true, write: false },
      });
      expect(isCommunicationPermissionGranted(access, 'read')).toBe(false);
    });

    it('allows communication.read directly', () => {
      const access = accessFor(MembershipRole.WORKER, {
        communication: { read: true, write: false },
      });
      expect(isCommunicationPermissionGranted(access, 'read')).toBe(true);
      expect(isCommunicationPermissionGranted(access, 'write')).toBe(false);
    });

    it('allows write via communication.write and manage via communication.manage', () => {
      const writeAccess = accessFor(MembershipRole.WORKER, {
        communication: { read: false, write: true },
      });
      expect(isCommunicationPermissionGranted(writeAccess, 'write')).toBe(true);
      expect(isCommunicationPermissionGranted(writeAccess, 'read')).toBe(true);

      const manageAccess = accessFor(MembershipRole.WORKER, {
        communication: { read: false, write: false, manage: true },
      });
      expect(isCommunicationPermissionGranted(manageAccess, 'manage')).toBe(true);
      expect(isCommunicationPermissionGranted(manageAccess, 'write')).toBe(true);
    });

    it('bridges legacy ai-assistant read/write/manage for WhatsApp compatibility', () => {
      const readAccess = accessFor(MembershipRole.WORKER, {
        'ai-assistant': { read: true, write: false },
      });
      expect(isCommunicationPermissionGranted(readAccess, 'read')).toBe(true);
      expect(isCommunicationPermissionGranted(readAccess, 'manage')).toBe(false);

      const manageAccess = accessFor(MembershipRole.WORKER, {
        'ai-assistant': { read: false, write: false, manage: true },
      });
      expect(isCommunicationPermissionGranted(manageAccess, 'manage')).toBe(true);
    });

    it('applies voice operational legacy for staff roles when flagged', () => {
      const workerAccess = accessFor(MembershipRole.WORKER, null);
      expect(
        isCommunicationPermissionGranted(workerAccess, 'read', { voiceOperationalLegacy: true }),
      ).toBe(true);
      expect(
        isCommunicationPermissionGranted(workerAccess, 'write', { voiceOperationalLegacy: true }),
      ).toBe(true);
      expect(
        isCommunicationPermissionGranted(workerAccess, 'manage', { voiceOperationalLegacy: true }),
      ).toBe(false);
    });

    it('denies DRIVER for voice operational legacy', () => {
      const driverAccess = accessFor(MembershipRole.DRIVER, null);
      expect(
        isCommunicationPermissionGranted(driverAccess, 'read', { voiceOperationalLegacy: true }),
      ).toBe(false);
    });

    it('read cannot mutate without write permission', () => {
      const access = accessFor(MembershipRole.WORKER, {
        communication: { read: true, write: false },
      });
      expect(isCommunicationPermissionGranted(access, 'write')).toBe(false);
      expect(isCommunicationPermissionGranted(access, 'manage')).toBe(false);
    });

    it('write cannot manage configuration', () => {
      const access = accessFor(MembershipRole.WORKER, {
        communication: { read: false, write: true },
      });
      expect(isCommunicationPermissionGranted(access, 'manage')).toBe(false);
    });
  });

  describe('isVoiceAssistantPermissionGranted', () => {
    it('requires voice-assistant.manage for telephony admin', () => {
      const access = accessFor(MembershipRole.WORKER, {
        communication: { read: true, write: true },
      });
      expect(isVoiceAssistantPermissionGranted(access, 'manage')).toBe(false);
    });

    it('allows voice-assistant.read via communication.read legacy path', () => {
      const access = accessFor(MembershipRole.WORKER, {
        'ai-assistant': { read: true, write: false },
      });
      expect(isVoiceAssistantPermissionGranted(access, 'read')).toBe(true);
      expect(isVoiceAssistantPermissionGranted(access, 'write')).toBe(false);
    });

    it('bridges SUB_ADMIN deep admin during legacy window when voiceAdminLegacy enabled', () => {
      const access = accessFor(MembershipRole.SUB_ADMIN, null);
      expect(
        isVoiceAssistantPermissionGranted(access, 'manage', { voiceAdminLegacy: true }),
      ).toBe(true);
    });

    it('does not bridge SUB_ADMIN when voiceAdminLegacy disabled', () => {
      const access = accessFor(MembershipRole.SUB_ADMIN, null);
      expect(
        isVoiceAssistantPermissionGranted(access, 'manage', { voiceAdminLegacy: false }),
      ).toBe(false);
    });
  });

  describe('least-privilege legacy bridges', () => {
    it('WORKER voice operational legacy cannot reach voice-assistant write or manage', () => {
      const access = accessFor(MembershipRole.WORKER, null);
      expect(
        isVoiceAssistantPermissionGranted(access, 'write', { voiceAdminLegacy: true }),
      ).toBe(false);
      expect(
        isVoiceAssistantPermissionGranted(access, 'manage', { voiceAdminLegacy: true }),
      ).toBe(false);
    });

    it('WORKER voice operational legacy cannot reach communication.manage', () => {
      const access = accessFor(MembershipRole.WORKER, null);
      expect(
        isCommunicationPermissionGranted(access, 'manage', { voiceOperationalLegacy: true }),
      ).toBe(false);
    });

    it('communication.write does not grant voice-assistant.manage', () => {
      const access = accessFor(MembershipRole.WORKER, {
        communication: { read: false, write: true, manage: false },
      });
      expect(isVoiceAssistantPermissionGranted(access, 'manage')).toBe(false);
      expect(isVoiceAssistantPermissionGranted(access, 'write')).toBe(false);
    });

    it('communication.manage does not grant voice-assistant.manage', () => {
      const access = accessFor(MembershipRole.WORKER, {
        communication: { read: false, write: false, manage: true },
      });
      expect(isVoiceAssistantPermissionGranted(access, 'manage')).toBe(false);
      expect(isVoiceAssistantPermissionGranted(access, 'write')).toBe(false);
    });

    it('DRIVER cannot enter via voice operational legacy bridge', () => {
      const access = accessFor(MembershipRole.DRIVER, null);
      expect(
        isCommunicationPermissionGranted(access, 'read', { voiceOperationalLegacy: true }),
      ).toBe(false);
      expect(
        isCommunicationPermissionGranted(access, 'write', { voiceOperationalLegacy: true }),
      ).toBe(false);
      expect(
        isVoiceAssistantPermissionGranted(access, 'read', { voiceAdminLegacy: true }),
      ).toBe(false);
    });

    it('WORKER cannot use SUB_ADMIN voiceAdminLegacy bridge', () => {
      const access = accessFor(MembershipRole.WORKER, null);
      expect(
        isVoiceAssistantPermissionGranted(access, 'manage', { voiceAdminLegacy: true }),
      ).toBe(false);
    });

    it('SUB_ADMIN voiceAdminLegacy matches pre-C0.2 org-staff deep admin access only for SUB_ADMIN', () => {
      const subAdmin = accessFor(MembershipRole.SUB_ADMIN, null);
      const worker = accessFor(MembershipRole.WORKER, null);
      expect(
        isVoiceAssistantPermissionGranted(subAdmin, 'manage', { voiceAdminLegacy: true }),
      ).toBe(true);
      expect(
        isVoiceAssistantPermissionGranted(worker, 'manage', { voiceAdminLegacy: true }),
      ).toBe(false);
    });

    it('internal ai-assistant bridge is one-way and isolated from communication grants', () => {
      const commOnly = accessFor(MembershipRole.WORKER, {
        communication: { read: true, write: true, manage: true },
      });
      expect(isInternalAiAssistantPermissionGranted(commOnly, 'read')).toBe(false);

      const aiOnly = accessFor(MembershipRole.WORKER, {
        'ai-assistant': { read: true, write: false },
      });
      expect(isCommunicationPermissionGranted(aiOnly, 'read')).toBe(true);
      expect(isInternalAiAssistantPermissionGranted(aiOnly, 'read')).toBe(true);
    });
  });

  describe('isInternalAiAssistantPermissionGranted', () => {
    it('does not grant internal AI from communication permission alone', () => {
      const access = accessFor(MembershipRole.WORKER, {
        communication: { read: true, write: true, manage: true },
      });
      expect(isInternalAiAssistantPermissionGranted(access, 'read')).toBe(false);
      expect(isInternalAiAssistantPermissionGranted(access, 'write')).toBe(false);
    });

    it('grants internal AI only from ai-assistant module', () => {
      const access = accessFor(MembershipRole.WORKER, {
        'ai-assistant': { read: true, write: false },
      });
      expect(isInternalAiAssistantPermissionGranted(access, 'read')).toBe(true);
      expect(isInternalAiAssistantPermissionGranted(access, 'write')).toBe(false);
    });
  });
});
