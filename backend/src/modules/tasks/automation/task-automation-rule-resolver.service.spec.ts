import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { TaskAutomationRuleOverrideService } from './task-automation-rule-override.service';
import { TaskAutomationRuleResolverService } from './task-automation-rule-resolver.service';
import { getAutomationRuleByCatalogKey } from './task-automation-rule.util';

describe('TaskAutomationRuleResolverService', () => {
  const bookingPrepRule = getAutomationRuleByCatalogKey('BOOKING_PREPARATION');

  const prisma = {
    orgTaskAutomationRuleOverride: {
      findUnique: jest.fn(),
    },
  };

  const resolver = new TaskAutomationRuleResolverService(prisma as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns platform defaults when no overrides exist', async () => {
    prisma.orgTaskAutomationRuleOverride.findUnique.mockResolvedValue(null);

    const resolved = await resolver.resolveTaskAutomationRule('org-1', bookingPrepRule.ruleId);

    expect(resolved.override).toBeNull();
    expect(resolved.effective.enabled).toBe(true);
    expect(resolved.effective.priority).toBe('NORMAL');
    expect(resolved.effectivelyEnabled).toBe(true);
    expect(resolved.fieldProvenance.enabled).toEqual({
      value: true,
      source: 'PLATFORM_DEFAULT',
    });
    expect(resolved.fieldProvenance.priority).toEqual({
      value: 'NORMAL',
      source: 'PLATFORM_DEFAULT',
    });
  });

  it('merges partial org overrides with provenance', async () => {
    prisma.orgTaskAutomationRuleOverride.findUnique.mockResolvedValue({
      id: 'ov-1',
      organizationId: 'org-1',
      ruleId: bookingPrepRule.ruleId,
      enabled: null,
      activationOffsetMinutes: null,
      dueOffsetMinutes: 120,
      priority: 'HIGH',
      assignmentStrategy: null,
      assignedUserId: null,
      assignedRoleKey: null,
      stationScope: null,
      escalationConfig: null,
      notificationConfig: null,
      checklistOverrides: null,
      version: 2,
      createdAt: new Date('2026-07-15T10:00:00.000Z'),
      updatedAt: new Date('2026-07-15T11:00:00.000Z'),
    });

    const resolved = await resolver.resolveTaskAutomationRule('org-1', bookingPrepRule.ruleId);

    expect(resolved.override?.version).toBe(2);
    expect(resolved.effective.priority).toBe('HIGH');
    expect(resolved.effective.dueOffsetMinutes).toBe(120);
    expect(resolved.effective.activationOffsetMinutes).toBe(0);
    expect(resolved.fieldProvenance.priority).toEqual({
      value: 'HIGH',
      source: 'ORG_OVERRIDE',
    });
    expect(resolved.fieldProvenance.dueOffsetMinutes).toEqual({
      value: 120,
      source: 'ORG_OVERRIDE',
    });
    expect(resolved.fieldProvenance.activationOffsetMinutes).toEqual({
      value: 0,
      source: 'PLATFORM_DEFAULT',
    });
  });

  it('treats disabled org override as effectively disabled for future runs', async () => {
    prisma.orgTaskAutomationRuleOverride.findUnique.mockResolvedValue({
      id: 'ov-2',
      organizationId: 'org-1',
      ruleId: bookingPrepRule.ruleId,
      enabled: false,
      activationOffsetMinutes: null,
      dueOffsetMinutes: null,
      priority: null,
      assignmentStrategy: null,
      assignedUserId: null,
      assignedRoleKey: null,
      stationScope: null,
      escalationConfig: null,
      notificationConfig: null,
      checklistOverrides: null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const resolved = await resolver.resolveTaskAutomationRule('org-1', bookingPrepRule.ruleId);

    expect(resolved.effectivelyEnabled).toBe(false);
    expect(resolved.fieldProvenance.enabled).toEqual({
      value: false,
      source: 'ORG_OVERRIDE',
    });
  });

  it('keeps tenant overrides isolated per organization lookup', async () => {
    prisma.orgTaskAutomationRuleOverride.findUnique.mockResolvedValue(null);

    await resolver.resolveTaskAutomationRule('org-a', bookingPrepRule.ruleId);

    expect(prisma.orgTaskAutomationRuleOverride.findUnique).toHaveBeenCalledWith({
      where: {
        organizationId_ruleId: {
          organizationId: 'org-a',
          ruleId: bookingPrepRule.ruleId,
        },
      },
    });
  });

  it('exposes catalog rule version separately from override version', async () => {
    prisma.orgTaskAutomationRuleOverride.findUnique.mockResolvedValue({
      id: 'ov-3',
      organizationId: 'org-1',
      ruleId: bookingPrepRule.ruleId,
      enabled: null,
      activationOffsetMinutes: null,
      dueOffsetMinutes: null,
      priority: null,
      assignmentStrategy: null,
      assignedUserId: null,
      assignedRoleKey: null,
      stationScope: null,
      escalationConfig: null,
      notificationConfig: null,
      checklistOverrides: null,
      version: 4,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const resolved = await resolver.resolveTaskAutomationRule('org-1', bookingPrepRule.ruleId);

    expect(resolved.catalogVersion).toBe(bookingPrepRule.version);
    expect(resolved.override?.version).toBe(4);
  });
});

describe('TaskAutomationRuleOverrideService', () => {
  const bookingPrepRule = getAutomationRuleByCatalogKey('BOOKING_PREPARATION');
  const audit = { record: jest.fn().mockResolvedValue('audit-1') };

  const prisma = {
    orgTaskAutomationRuleOverride: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    orgTaskAutomationRuleOverrideRevision: {
      create: jest.fn(),
    },
    organizationMembership: {
      findFirst: jest.fn(),
    },
    organizationRole: {
      findFirst: jest.fn(),
    },
    station: {
      findFirst: jest.fn(),
    },
  };

  const service = new TaskAutomationRuleOverrideService(prisma as any, audit as any);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.orgTaskAutomationRuleOverrideRevision.create.mockResolvedValue({ id: 'rev-1' });
  });

  it('rejects protected fields for a rule', async () => {
    const invoiceRule = getAutomationRuleByCatalogKey('INVOICE_PAYMENT_CHECK');

    await expect(
      service.upsertOverride('org-1', invoiceRule.ruleId, {
        activationOffsetMinutes: 30,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects invalid offset values', async () => {
    await expect(
      service.upsertOverride('org-1', bookingPrepRule.ruleId, {
        activationOffsetMinutes: 999_999,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('validates assignedUserId tenant membership', async () => {
    prisma.orgTaskAutomationRuleOverride.findUnique.mockResolvedValue(null);
    prisma.organizationMembership.findFirst.mockResolvedValue(null);

    await expect(
      service.upsertOverride('org-1', bookingPrepRule.ruleId, {
        assignedUserId: 'user-x',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates an override and revision with incremented version on update', async () => {
    prisma.orgTaskAutomationRuleOverride.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'ov-1',
        organizationId: 'org-1',
        ruleId: bookingPrepRule.ruleId,
        enabled: null,
        activationOffsetMinutes: null,
        dueOffsetMinutes: null,
        priority: 'HIGH',
        assignmentStrategy: null,
        assignedUserId: null,
        assignedRoleKey: null,
        stationScope: null,
        escalationConfig: null,
        notificationConfig: null,
        checklistOverrides: null,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

    prisma.orgTaskAutomationRuleOverride.create.mockResolvedValue({
      id: 'ov-1',
      organizationId: 'org-1',
      ruleId: bookingPrepRule.ruleId,
      enabled: null,
      activationOffsetMinutes: null,
      dueOffsetMinutes: null,
      priority: 'HIGH',
      assignmentStrategy: null,
      assignedUserId: null,
      assignedRoleKey: null,
      stationScope: null,
      escalationConfig: null,
      notificationConfig: null,
      checklistOverrides: null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await service.upsertOverride('org-1', bookingPrepRule.ruleId, {
      priority: 'HIGH',
    });

    prisma.orgTaskAutomationRuleOverride.update.mockResolvedValue({
      id: 'ov-1',
      organizationId: 'org-1',
      ruleId: bookingPrepRule.ruleId,
      enabled: null,
      activationOffsetMinutes: null,
      dueOffsetMinutes: null,
      priority: 'CRITICAL',
      assignmentStrategy: null,
      assignedUserId: null,
      assignedRoleKey: null,
      stationScope: null,
      escalationConfig: null,
      notificationConfig: null,
      checklistOverrides: null,
      version: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await service.upsertOverride(
      'org-1',
      bookingPrepRule.ruleId,
      { priority: 'CRITICAL', expectedVersion: 1 },
      'actor-1',
    );

    expect(prisma.orgTaskAutomationRuleOverrideRevision.create).toHaveBeenCalled();
    expect(prisma.orgTaskAutomationRuleOverride.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          priority: 'CRITICAL',
          version: { increment: 1 },
        }),
      }),
    );
  });

  it('rejects stale expectedVersion updates', async () => {
    prisma.orgTaskAutomationRuleOverride.findUnique.mockResolvedValue({
      id: 'ov-1',
      organizationId: 'org-1',
      ruleId: bookingPrepRule.ruleId,
      version: 3,
    });

    await expect(
      service.upsertOverride('org-1', bookingPrepRule.ruleId, {
        priority: 'HIGH',
        expectedVersion: 2,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('resets an override back to platform defaults', async () => {
    prisma.orgTaskAutomationRuleOverride.findUnique.mockResolvedValue({
      id: 'ov-1',
      organizationId: 'org-1',
      ruleId: bookingPrepRule.ruleId,
      version: 2,
    });
    prisma.orgTaskAutomationRuleOverride.delete.mockResolvedValue({ id: 'ov-1' });

    const result = await service.resetOverride('org-1', bookingPrepRule.ruleId, 'actor-1', 2);

    expect(result).toEqual({
      ruleId: bookingPrepRule.ruleId,
      reset: true,
      previousVersion: 2,
    });
    expect(prisma.orgTaskAutomationRuleOverride.delete).toHaveBeenCalledWith({ where: { id: 'ov-1' } });
  });

  it('throws when resetting a missing override', async () => {
    prisma.orgTaskAutomationRuleOverride.findUnique.mockResolvedValue(null);

    await expect(
      service.resetOverride('org-1', bookingPrepRule.ruleId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
