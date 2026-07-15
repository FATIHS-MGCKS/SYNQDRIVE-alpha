import { BadRequestException } from '@nestjs/common';
import { TaskCompletionMode, TaskStatus } from '@prisma/client';
import {
  MAX_SIMULATION_PERIOD_DAYS,
  TaskAutomationSimulationService,
} from './task-automation-simulation.service';
import { getAutomationRuleByCatalogKey } from './task-automation-rule.util';

describe('TaskAutomationSimulationService', () => {
  const orgId = 'org-1';
  const bookingPrepRule = getAutomationRuleByCatalogKey('BOOKING_PREPARATION');

  const prisma = {
    booking: { count: jest.fn(), findMany: jest.fn() },
    orgTask: { findMany: jest.fn(), count: jest.fn() },
    orgInvoice: { count: jest.fn() },
    vehicle: { count: jest.fn() },
    dashboardInsight: { count: jest.fn() },
    orgTaskAutomationRuleOverride: { findUnique: jest.fn() },
    $transaction: jest.fn(),
    $executeRaw: jest.fn(),
    $executeRawUnsafe: jest.fn(),
    $queryRaw: jest.fn(),
    activityLog: { create: jest.fn() },
    orgTaskAutomationRuleOverrideRevision: { create: jest.fn() },
  };

  const resolver = {
    resolveTaskAutomationRule: jest.fn(),
  };

  const service = new TaskAutomationSimulationService(prisma as any, resolver as any);

  const baseResolved = {
    ruleId: bookingPrepRule.ruleId,
    effectivelyEnabled: true,
    effective: {
      enabled: true,
      activationOffsetMinutes: 0,
      dueOffsetMinutes: 0,
      priority: 'NORMAL',
      assignmentStrategy: 'STATION_FROM_BOOKING',
      assignedUserId: null,
      assignedRoleKey: null,
      stationScope: null,
      escalationConfig: null,
      notificationConfig: null,
      checklistOverrides: null,
      ruleConfig: {},
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    resolver.resolveTaskAutomationRule.mockResolvedValue(baseResolved);
    prisma.booking.count.mockResolvedValue(4);
    prisma.orgTask.findMany.mockResolvedValue([
      {
        id: 't1',
        dedupKey: 'booking:prep:b1',
        status: TaskStatus.DONE,
        completionMode: TaskCompletionMode.AUTO_RESOLVED,
        createdAt: new Date('2026-07-01T10:00:00.000Z'),
        completedAt: new Date('2026-07-02T10:00:00.000Z'),
        title: 'Buchung vorbereiten',
        bookingId: 'b1',
        vehicleId: null,
        invoiceId: null,
      },
      {
        id: 't2',
        dedupKey: 'booking:prep:b2',
        status: TaskStatus.OPEN,
        completionMode: null,
        createdAt: new Date('2026-07-03T10:00:00.000Z'),
        completedAt: null,
        title: 'Buchung vorbereiten',
        bookingId: 'b2',
        vehicleId: null,
        invoiceId: null,
      },
      {
        id: 't3',
        dedupKey: 'booking:prep:b2',
        status: TaskStatus.DONE,
        completionMode: null,
        createdAt: new Date('2026-07-04T10:00:00.000Z'),
        completedAt: new Date('2026-07-04T12:00:00.000Z'),
        title: 'Buchung vorbereiten',
        bookingId: 'b2',
        vehicleId: null,
        invoiceId: null,
      },
    ]);
    prisma.booking.findMany.mockResolvedValue([
      { id: 'b1', status: 'COMPLETED', startDate: new Date('2026-07-01T08:00:00.000Z') },
      { id: 'b2', status: 'CONFIRMED', startDate: new Date('2026-07-03T08:00:00.000Z') },
    ]);
  });

  it('is read-only and does not write tasks, events, or audit entries', async () => {
    await service.simulate(orgId, bookingPrepRule.ruleId, { periodDays: 30 });

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
    expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
    expect(prisma.activityLog.create).not.toHaveBeenCalled();
    expect(prisma.orgTaskAutomationRuleOverrideRevision.create).not.toHaveBeenCalled();
  });

  it('scopes all reads to the tenant organization', async () => {
    await service.simulate(orgId, bookingPrepRule.ruleId, { periodDays: 30 });

    expect(prisma.booking.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: orgId }),
      }),
    );
    expect(prisma.orgTask.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: orgId }),
      }),
    );
  });

  it('estimates deduplicated merges from trigger events and unique dedup keys', async () => {
    const result = await service.simulate(orgId, bookingPrepRule.ruleId, { periodDays: 30 });

    expect(result.estimates.triggerEvents).toBeGreaterThanOrEqual(3);
    expect(result.estimates.tasksWouldBeCreated).toBe(2);
    expect(result.estimates.deduplicatedMerges).toBeGreaterThanOrEqual(1);
    expect(result.estimates.autoResolved).toBe(1);
    expect(result.estimates.currentlyActive).toBe(1);
    expect(result.summaryDe).toContain('voraussichtlich');
  });

  it('rejects periods beyond the configured maximum', async () => {
    await expect(
      service.simulate(orgId, bookingPrepRule.ruleId, {
        periodDays: MAX_SIMULATION_PERIOD_DAYS + 1,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns zero task estimates for disabled proposed configuration', async () => {
    resolver.resolveTaskAutomationRule.mockResolvedValue({
      ...baseResolved,
      effectivelyEnabled: false,
      effective: { ...baseResolved.effective, enabled: false },
    });

    const result = await service.simulate(orgId, bookingPrepRule.ruleId, {
      proposedConfig: { enabled: false },
      periodDays: 30,
    });

    expect(result.proposedEffectivelyEnabled).toBe(false);
    expect(result.estimates.tasksWouldBeCreated).toBe(0);
    expect(result.summaryDe).toContain('keine neuen Aufgaben');
  });

  it('marks incomplete data when no historical evidence exists', async () => {
    prisma.booking.count.mockResolvedValue(0);
    prisma.orgTask.findMany.mockResolvedValue([]);

    const result = await service.simulate(orgId, bookingPrepRule.ruleId, { periodDays: 30 });

    expect(result.dataQuality.complete).toBe(false);
    expect(result.dataQuality.warningsDe.length).toBeGreaterThan(0);
    expect(result.disclaimerDe).toContain('keine exakte Prognose');
  });
});
