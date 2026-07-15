import { GUARDS_METADATA } from '@nestjs/common/constants';
import { BadRequestException } from '@nestjs/common';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { PERMISSION_KEY } from '@shared/decorators/require-permission.decorator';
import { TaskAutomationAdminController } from './task-automation-admin.controller';

function permissionOf(target: object, method: string) {
  const handler = (target as Record<string, (...args: unknown[]) => unknown>)[method];
  return Reflect.getMetadata(PERMISSION_KEY, handler);
}

describe('TaskAutomationAdminController security', () => {
  it('uses org-scoped task automation route', () => {
    const path = Reflect.getMetadata('path', TaskAutomationAdminController);
    expect(path).toBe('organizations/:orgId/task-automation');
  });

  it('applies OrgScopingGuard and PermissionsGuard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, TaskAutomationAdminController);
    expect(guards).toEqual(expect.arrayContaining([OrgScopingGuard, PermissionsGuard]));
  });

  it('requires workflow-automation read for list/get/simulate', () => {
    expect(permissionOf(TaskAutomationAdminController.prototype, 'listRules')).toEqual({
      module: 'workflow-automation',
      level: 'read',
    });
    expect(permissionOf(TaskAutomationAdminController.prototype, 'getRule')).toEqual({
      module: 'workflow-automation',
      level: 'read',
    });
    expect(permissionOf(TaskAutomationAdminController.prototype, 'simulateRule')).toEqual({
      module: 'workflow-automation',
      level: 'read',
    });
  });

  it('requires workflow-automation write for override mutations', () => {
    expect(permissionOf(TaskAutomationAdminController.prototype, 'upsertOverride')).toEqual({
      module: 'workflow-automation',
      level: 'write',
    });
    expect(permissionOf(TaskAutomationAdminController.prototype, 'resetOverride')).toEqual({
      module: 'workflow-automation',
      level: 'write',
    });
  });
});

describe('TaskAutomationAdminController', () => {
  const orgId = 'org-1';
  const actor = { id: 'user-admin' };
  const ruleId = 'booking.lifecycle.confirmed.prep';

  const admin = {
    listRules: jest.fn(),
    getRule: jest.fn(),
    upsertOverride: jest.fn(),
    resetOverride: jest.fn(),
    simulateRule: jest.fn(),
  };

  const controller = new TaskAutomationAdminController(admin as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists rules for organization', async () => {
    const payload = { rules: [], summary: { total: 0, active: 0, customized: 0, disabled: 0 } };
    admin.listRules.mockResolvedValue(payload);

    await expect(controller.listRules(orgId)).resolves.toEqual(payload);
    expect(admin.listRules).toHaveBeenCalledWith(orgId);
  });

  it('returns single rule detail', async () => {
    const payload = { ruleId, nameDe: 'Buchung vorbereiten' };
    admin.getRule.mockResolvedValue(payload);

    await expect(controller.getRule(orgId, ruleId)).resolves.toEqual(payload);
    expect(admin.getRule).toHaveBeenCalledWith(orgId, ruleId);
  });

  it('upserts override with actor user id', async () => {
    const body = { priority: 'HIGH', expectedVersion: 2 };
    const payload = { ruleId, effective: { priority: 'HIGH' } };
    admin.upsertOverride.mockResolvedValue(payload);

    await expect(controller.upsertOverride(orgId, ruleId, body as any, { user: actor })).resolves.toEqual(
      payload,
    );
    expect(admin.upsertOverride).toHaveBeenCalledWith(orgId, ruleId, body, actor.id);
  });

  it('runs read-only simulation without persisting overrides', async () => {
    const payload = { summaryDe: 'Schätzung' };
    admin.simulateRule.mockResolvedValue(payload);

    await expect(
      controller.simulateRule(orgId, ruleId, { proposedConfig: { priority: 'HIGH' }, periodDays: 30 }),
    ).resolves.toEqual(payload);

    expect(admin.simulateRule).toHaveBeenCalledWith(orgId, ruleId, {
      proposedConfig: { priority: 'HIGH' },
      periodDays: 30,
    });
    expect(admin.upsertOverride).not.toHaveBeenCalled();
  });

  it('resets override with actor user id', async () => {
    const body = { expectedVersion: 3 };
    const payload = { ruleId, hasOrgOverride: false };
    admin.resetOverride.mockResolvedValue(payload);

    await expect(controller.resetOverride(orgId, ruleId, body, { user: actor })).resolves.toEqual(
      payload,
    );
    expect(admin.resetOverride).toHaveBeenCalledWith(orgId, ruleId, actor.id, 3, undefined);
  });
});
