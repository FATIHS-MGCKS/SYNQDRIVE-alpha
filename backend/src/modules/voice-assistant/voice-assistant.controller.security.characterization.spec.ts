import { GUARDS_METADATA } from '@nestjs/common/constants';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { PERMISSION_KEY } from '@shared/decorators/require-permission.decorator';
import { ROLES_KEY } from '@shared/decorators/roles.decorator';
import {
  COMMUNICATION_COMPAT_CONTEXT_KEY,
} from '@shared/decorators/require-communication-permission.decorator';
import {
  VoiceAssistantAdminController,
  VoiceAssistantController,
} from './voice-assistant.controller';

function permissionOf(target: object, method: string) {
  const handler = (target as Record<string, (...args: unknown[]) => unknown>)[method];
  return Reflect.getMetadata(PERMISSION_KEY, handler);
}

function communicationCompatOf(target: object, method: string) {
  const handler = (target as Record<string, (...args: unknown[]) => unknown>)[method];
  return Reflect.getMetadata(COMMUNICATION_COMPAT_CONTEXT_KEY, handler);
}

describe('VoiceAssistantController security characterization', () => {
  it('applies OrgScopingGuard, PermissionsGuard, and RolesGuard on tenant controller', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, VoiceAssistantController) ?? [];
    expect(guards).toEqual(
      expect.arrayContaining([OrgScopingGuard, PermissionsGuard, RolesGuard]),
    );
  });

  const operationalHandlers = [
    'conversations',
    'analytics',
    'syncConversations',
    'outboundCall',
  ] as const;

  it.each(operationalHandlers)(
    'operational %s requires communication permission with voice legacy bridge',
    (method) => {
      expect(permissionOf(VoiceAssistantController.prototype, method)?.module).toBe('communication');
      expect(communicationCompatOf(VoiceAssistantController.prototype, method)).toEqual(
        expect.objectContaining({ voiceOperationalLegacy: true }),
      );
    },
  );

  const adminHandlers = [
    'get',
    'update',
    'phoneNumbers',
    'assignPhoneNumber',
    'telephonySettings',
    'twilioOutboundCall',
  ] as const;

  it.each(adminHandlers)('admin %s requires voice-assistant permission', (method) => {
    expect(permissionOf(VoiceAssistantController.prototype, method)?.module).toBe('voice-assistant');
  });

  describe('admin controller', () => {
    it('applies RolesGuard on admin controller class', () => {
      const guards = Reflect.getMetadata(GUARDS_METADATA, VoiceAssistantAdminController) ?? [];
      expect(guards).toEqual(expect.arrayContaining([RolesGuard]));
    });

    it('requires MASTER_ADMIN at controller class level (not per handler)', () => {
      expect(Reflect.getMetadata(ROLES_KEY, VoiceAssistantAdminController)).toEqual(['MASTER_ADMIN']);
    });

    it('does not apply OrgScopingGuard on admin controller (platform routes)', () => {
      const guards = Reflect.getMetadata(GUARDS_METADATA, VoiceAssistantAdminController) ?? [];
      const guardNames = guards.map((g: { name?: string }) => g?.name ?? String(g));
      expect(guardNames.some((name: string) => name.includes('OrgScopingGuard'))).toBe(false);
    });
  });
});
