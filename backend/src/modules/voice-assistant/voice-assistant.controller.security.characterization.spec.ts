import { GUARDS_METADATA } from '@nestjs/common/constants';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { ROLES_KEY } from '@shared/decorators/roles.decorator';
import {
  VoiceAssistantAdminController,
  VoiceAssistantController,
} from './voice-assistant.controller';

function rolesOf(target: object, method?: string) {
  if (method) {
    const handler = (target as Record<string, (...args: unknown[]) => unknown>)[method];
    return Reflect.getMetadata(ROLES_KEY, handler);
  }
  return Reflect.getMetadata(ROLES_KEY, target);
}

describe('VoiceAssistantController security characterization', () => {
  it('applies OrgScopingGuard and RolesGuard on tenant controller', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, VoiceAssistantController) ?? [];
    expect(guards).toEqual(expect.arrayContaining([OrgScopingGuard, RolesGuard]));
  });

  it('does not apply PermissionsGuard on tenant controller (current behavior)', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, VoiceAssistantController) ?? [];
    const guardNames = guards.map((g: { name?: string }) => g?.name ?? String(g));
    expect(guardNames.some((name: string) => name.includes('PermissionsGuard'))).toBe(false);
  });

  const tenantHandlers = [
    'get',
    'update',
    'activate',
    'deactivate',
    'readiness',
    'voices',
    'testSession',
    'conversations',
    'analytics',
    'syncConversations',
    'phoneNumbers',
    'assignPhoneNumber',
    'unassignPhoneNumber',
    'refreshTelephony',
    'telephonySettings',
    'twilioOutboundCall',
  ] as const;

  it.each(tenantHandlers)('tenant %s has no @Roles decorator (membership not restricted today)', (method) => {
    expect(rolesOf(VoiceAssistantController.prototype, method)).toBeUndefined();
  });

  describe('admin controller', () => {
    it('applies RolesGuard on admin controller class', () => {
      const guards = Reflect.getMetadata(GUARDS_METADATA, VoiceAssistantAdminController) ?? [];
      expect(guards).toEqual(expect.arrayContaining([RolesGuard]));
    });

    it('requires MASTER_ADMIN at controller class level (not per handler)', () => {
      expect(rolesOf(VoiceAssistantAdminController)).toEqual(['MASTER_ADMIN']);
    });

    it('does not apply OrgScopingGuard on admin controller (platform routes)', () => {
      const guards = Reflect.getMetadata(GUARDS_METADATA, VoiceAssistantAdminController) ?? [];
      const guardNames = guards.map((g: { name?: string }) => g?.name ?? String(g));
      expect(guardNames.some((name: string) => name.includes('OrgScopingGuard'))).toBe(false);
    });

    const adminHandlers = ['overview', 'orgDetail', 'syncOrganization'] as const;

    it.each(adminHandlers)('admin %s has no per-method @Roles decorator (inherits class role)', (method) => {
      expect(rolesOf(VoiceAssistantAdminController.prototype, method)).toBeUndefined();
    });
  });

  describe('pending ADR targets', () => {
    it.todo('ADR target: tenant voice routes should require org-admin or voice-specific permission');
    it.todo('ADR target: WORKER and DRIVER roles should not manage voice assistant configuration');
  });
});
