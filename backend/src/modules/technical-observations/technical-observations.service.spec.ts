import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TechnicalObservationsService } from './technical-observations.service';

describe('TechnicalObservationsService', () => {
  const orgA = 'org-a';
  const orgB = 'org-b';
  const vehicleId = 'veh-1';

  const prisma = {
    vehicle: { findFirst: jest.fn() },
    vehicleComplaint: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    booking: { findFirst: jest.fn() },
    customer: { findFirst: jest.fn() },
    bookingHandoverProtocol: { findFirst: jest.fn() },
    station: { findFirst: jest.fn() },
    vehicleDamage: { findFirst: jest.fn() },
    vehicleServiceEvent: { findFirst: jest.fn() },
    orgTask: { findFirst: jest.fn() },
  };

  const tasks = { createManualTask: jest.fn() };
  const serviceCases = { create: jest.fn() };
  const damages = { create: jest.fn() };

  const svc = new TechnicalObservationsService(
    prisma as any,
    tasks as any,
    serviceCases as any,
    damages as any,
  );

  const baseRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'obs-1',
    organizationId: orgA,
    vehicleId,
    createdByUserId: 'user-1',
    createdByWorkerId: null,
    title: 'Wiper issue',
    description: 'Wipers worn',
    urgency: 'MEDIUM',
    region: null,
    category: null,
    affectedArea: null,
    status: 'ACTIVE',
    source: 'MANUAL',
    impact: null,
    blocksRental: false,
    bookingId: null,
    customerId: null,
    driverId: null,
    handoverProtocolId: null,
    stationId: null,
    locationContext: null,
    resolvedAt: null,
    resolvedByUserId: null,
    dismissedAt: null,
    dismissedByUserId: null,
    convertedToTaskId: null,
    linkedDamageId: null,
    linkedServiceEventId: null,
    linkedServiceTaskId: null,
    notes: null,
    createdAt: new Date('2026-06-01T10:00:00.000Z'),
    updatedAt: new Date('2026-06-01T10:00:00.000Z'),
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.vehicle.findFirst.mockResolvedValue({ id: vehicleId });
  });

  it('create observation is org-safe via vehicle scope', async () => {
    prisma.vehicleComplaint.create.mockResolvedValue(baseRow());
    const result = await svc.create(orgA, vehicleId, {
      description: 'Light defect',
    });
    expect(prisma.vehicle.findFirst).toHaveBeenCalledWith({
      where: { id: vehicleId, organizationId: orgA },
      select: { id: true },
    });
    expect(result.orgId).toBe(orgA);
    expect(result.severity).toBe('medium');
    expect(result.blocksRental).toBe(false);
  });

  it('create rejects vehicle from another org', async () => {
    prisma.vehicle.findFirst.mockResolvedValue(null);
    await expect(
      svc.create(orgB, vehicleId, { description: 'Test' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('list scopes organization and vehicle', async () => {
    prisma.vehicleComplaint.findMany.mockResolvedValue([
      baseRow(),
      baseRow({ id: 'obs-2', status: 'RESOLVED', resolvedAt: new Date() }),
    ]);
    const result = await svc.list(orgA, vehicleId);
    expect(prisma.vehicleComplaint.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: orgA, vehicleId }),
      }),
    );
    expect(result.active).toHaveLength(1);
    expect(result.history).toHaveLength(1);
  });

  it('resolve moves observation to history (resolved status)', async () => {
    prisma.vehicleComplaint.findFirst.mockResolvedValue(baseRow());
    prisma.vehicleComplaint.update.mockResolvedValue(
      baseRow({ status: 'RESOLVED', resolvedAt: new Date(), blocksRental: false }),
    );
    const result = await svc.resolve(orgA, vehicleId, 'obs-1', 'user-1');
    expect(result.status).toBe('resolved');
    expect(prisma.vehicleComplaint.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'RESOLVED', blocksRental: false }),
      }),
    );
  });

  it('dismiss clears rental block flag', async () => {
    prisma.vehicleComplaint.findFirst.mockResolvedValue(baseRow({ blocksRental: true }));
    prisma.vehicleComplaint.update.mockResolvedValue(
      baseRow({ status: 'DISMISSED', dismissedAt: new Date(), blocksRental: false }),
    );
    const result = await svc.dismiss(orgA, vehicleId, 'obs-1');
    expect(result.status).toBe('dismissed');
  });

  it('convert-to-task links task and sets converted status', async () => {
    prisma.vehicleComplaint.findFirst.mockResolvedValue(baseRow());
    tasks.createManualTask.mockResolvedValue({ id: 'task-1' });
    prisma.vehicleComplaint.update.mockResolvedValue(
      baseRow({ status: 'CONVERTED', convertedToTaskId: 'task-1', linkedServiceTaskId: 'task-1' }),
    );
    const result = await svc.convertToTask(orgA, vehicleId, 'obs-1', {}, 'user-1');
    expect(result.taskId).toBe('task-1');
    expect(result.observation.status).toBe('converted');
    expect(tasks.createManualTask).toHaveBeenCalledWith(
      orgA,
      expect.objectContaining({
        metadata: { technicalObservationId: 'obs-1' },
        dedupKey: 'health:observation:obs-1',
        vehicleId,
      }),
      'user-1',
    );
  });

  it('booking context must match org and vehicle', async () => {
    prisma.booking.findFirst.mockResolvedValue(null);
    await expect(
      svc.create(orgA, vehicleId, {
        description: 'Noise',
        bookingId: 'booking-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('getScopedRow rejects cross-org access', async () => {
    prisma.vehicleComplaint.findFirst.mockResolvedValue(null);
    await expect(svc.update(orgB, vehicleId, 'obs-1', { notes: 'x' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('link-damage validates damage belongs to vehicle/org', async () => {
    prisma.vehicleComplaint.findFirst.mockResolvedValue(baseRow());
    prisma.vehicleDamage.findFirst.mockResolvedValue(null);
    await expect(
      svc.linkDamage(orgA, vehicleId, 'obs-1', { damageId: 'dmg-1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('RentalHealth complaints aggregation (canonical observations)', () => {
  const { RentalHealthService } = require('../rental-health/rental-health.service');

  const svc = new RentalHealthService(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  const evaluateComplaints = (complaints: any[], loaded: boolean) =>
    (svc as any).evaluateComplaints(complaints, loaded);

  const collectBlockingReasons = (complaints: any[]) =>
    (svc as any).collectBlockingReasons(
      {
        service_compliance: { state: 'good', reason: 'ok' },
        brakes: { state: 'good', reason: 'ok' },
        tires: { state: 'good', reason: 'ok' },
        error_codes: { state: 'good', reason: 'ok' },
      },
      complaints,
      null,
      { tuvBokraft: { tuvOverdue: false, bokraftOverdue: false } },
      null,
      null,
    );

  it('critical severity without blocksRental => critical module but no rental block', () => {
    const module = evaluateComplaints(
      [
        {
          id: '1',
          description: 'Noise',
          urgency: 'CRITICAL',
          status: 'ACTIVE',
          impact: null,
          blocksRental: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      true,
    );
    expect(module.state).toBe('critical');
    const reasons = collectBlockingReasons([
      { impact: null, blocksRental: false },
    ]);
    expect(reasons).toHaveLength(0);
  });

  it('blocksRental true => critical module and rental blocking reason', () => {
    const module = evaluateComplaints(
      [
        {
          id: '1',
          description: 'Broken light',
          urgency: 'MEDIUM',
          status: 'ACTIVE',
          impact: null,
          blocksRental: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      true,
    );
    expect(module.state).toBe('critical');
    const reasons = collectBlockingReasons([{ blocksRental: true }]);
    expect(reasons).toContain('Technische Beobachtung blockiert Vermietung');
  });
});
