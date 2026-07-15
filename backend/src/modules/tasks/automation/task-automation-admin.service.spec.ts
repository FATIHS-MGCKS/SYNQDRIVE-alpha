import { NotFoundException } from '@nestjs/common';
import { TaskAutomationAdminService } from './task-automation-admin.service';
import { getAutomationRuleByCatalogKey } from './task-automation-rule.util';

describe('TaskAutomationAdminService', () => {
  const orgId = 'org-1';
  const bookingPrepRule = getAutomationRuleByCatalogKey('BOOKING_PREPARATION');

  const prisma = {
    orgTaskAutomationRuleOverride: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
  };

  const resolver = {
    resolveTaskAutomationRule: jest.fn(),
  };

  const overrideService = {
    upsertOverride: jest.fn(),
    resetOverride: jest.fn(),
  };

  const simulation = { simulate: jest.fn() };

  const service = new TaskAutomationAdminService(
    prisma as any,
    resolver as any,
    overrideService as any,
    simulation as any,
  );

  const baseResolved = {
    ruleId: bookingPrepRule.ruleId,
    catalogVersion: 1,
    catalogKey: 'BOOKING_PREPARATION' as const,
    materializesTask: true,
    default: {
      enabled: true,
      activationOffsetMinutes: 0,
      dueOffsetMinutes: 0,
      priority: 'NORMAL' as const,
      assignmentStrategy: 'STATION_FROM_BOOKING' as const,
      assignedUserId: null,
      assignedRoleKey: null,
      stationScope: null,
      escalationConfig: null,
      notificationConfig: null,
      checklistOverrides: null,
      ruleConfig: {},
    },
    override: null,
    effective: {
      enabled: true,
      activationOffsetMinutes: 0,
      dueOffsetMinutes: 0,
      priority: 'NORMAL' as const,
      assignmentStrategy: 'STATION_FROM_BOOKING' as const,
      assignedUserId: null,
      assignedRoleKey: null,
      stationScope: null,
      escalationConfig: null,
      notificationConfig: null,
      checklistOverrides: null,
      ruleConfig: {},
    },
    fieldProvenance: {},
    effectivelyEnabled: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.orgTaskAutomationRuleOverride.findMany.mockResolvedValue([]);
    prisma.orgTaskAutomationRuleOverride.findUnique.mockResolvedValue(null);
    resolver.resolveTaskAutomationRule.mockResolvedValue(baseResolved);
  });

  it('lists standard rules with German labels and no override', async () => {
    const result = await service.listRules(orgId);

    expect(result.summary.total).toBeGreaterThan(0);
    const prep = result.rules.find((rule) => rule.catalogKey === 'BOOKING_PREPARATION');
    expect(prep?.nameDe).toBe('Buchung vorbereiten');
    expect(prep?.hasOrgOverride).toBe(false);
    expect(prep?.effectivelyEnabled).toBe(true);
    expect(prep?.checklist.usesSynqDriveStandard).toBe(true);
    expect(prep?.isCritical).toBe(true);
  });

  it('returns override state and audit metadata', async () => {
    resolver.resolveTaskAutomationRule.mockResolvedValue({
      ...baseResolved,
      override: {
        id: 'ov-1',
        organizationId: orgId,
        ruleId: bookingPrepRule.ruleId,
        enabled: null,
        activationOffsetMinutes: null,
        dueOffsetMinutes: 60,
        priority: 'HIGH',
        assignmentStrategy: null,
        assignedUserId: null,
        assignedRoleKey: null,
        stationScope: null,
        escalationConfig: null,
        notificationConfig: null,
        checklistOverrides: null,
        version: 2,
        createdAt: '2026-07-15T10:00:00.000Z',
        updatedAt: '2026-07-15T11:00:00.000Z',
      },
      effective: {
        ...baseResolved.effective,
        dueOffsetMinutes: 60,
        priority: 'HIGH',
      },
      fieldProvenance: {
        priority: { value: 'HIGH', source: 'ORG_OVERRIDE' },
      },
    });
    prisma.orgTaskAutomationRuleOverride.findUnique.mockResolvedValue({
      version: 2,
      updatedAt: new Date('2026-07-15T11:00:00.000Z'),
      updatedByUserId: 'user-1',
      updatedBy: { id: 'user-1', firstName: 'Anna', lastName: 'Admin', email: 'anna@example.com' },
    });

    const result = await service.getRule(orgId, bookingPrepRule.ruleId);

    expect(result.hasOrgOverride).toBe(true);
    expect(result.effective.priority).toBe('HIGH');
    expect(result.audit.version).toBe(2);
    expect(result.audit.updatedByName).toBe('Anna Admin');
  });

  it('marks disabled rules as inactive for future materializations', async () => {
    resolver.resolveTaskAutomationRule.mockResolvedValue({
      ...baseResolved,
      effectivelyEnabled: false,
      effective: { ...baseResolved.effective, enabled: false },
    });

    const result = await service.getRule(orgId, bookingPrepRule.ruleId);
    expect(result.effectivelyEnabled).toBe(false);
  });

  it('upserts override and reloads effective configuration', async () => {
    overrideService.upsertOverride.mockResolvedValue({ id: 'ov-1' });

    await service.upsertOverride(orgId, bookingPrepRule.ruleId, { priority: 'HIGH' }, 'user-1');

    expect(overrideService.upsertOverride).toHaveBeenCalledWith(
      orgId,
      bookingPrepRule.ruleId,
      { priority: 'HIGH' },
      'user-1',
    );
    expect(resolver.resolveTaskAutomationRule).toHaveBeenCalled();
  });

  it('rejects checklist override that removes required items', async () => {
    await expect(
      service.upsertOverride(orgId, bookingPrepRule.ruleId, {
        checklistOverrides: {
          hiddenOptionalTitles: ['Pflichtdokumente vollständig'],
        },
      }),
    ).rejects.toThrow('Pflichtpunkt');
    expect(overrideService.upsertOverride).not.toHaveBeenCalled();
  });

  it('resets override and reloads platform defaults', async () => {
    overrideService.resetOverride.mockResolvedValue({ reset: true });

    await service.resetOverride(orgId, bookingPrepRule.ruleId, 'user-1', 4);

    expect(overrideService.resetOverride).toHaveBeenCalledWith(
      orgId,
      bookingPrepRule.ruleId,
      'user-1',
      4,
      undefined,
    );
    expect(resolver.resolveTaskAutomationRule).toHaveBeenCalled();
  });

  it('throws when rule id is unknown', async () => {
    await expect(service.getRule(orgId, 'unknown.rule.id')).rejects.toBeInstanceOf(NotFoundException);
  });
});
