import { DEFAULT_POLICY, InsightSeverity } from '../insight.types';
import { PickupOverdueDetector } from './pickup-overdue.detector';

describe('PickupOverdueDetector — 30 minute overdue threshold', () => {
  const orgId = 'org-pickup-overdue';
  const now = new Date('2026-07-25T12:00:00.000Z');
  const detectorCtx = { organizationId: orgId, now, policy: DEFAULT_POLICY };

  const prisma = {
    booking: { findMany: jest.fn() },
  };

  const detector = new PickupOverdueDetector(prisma as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('surfaces INFO severity when pickup is 30+ minutes overdue', async () => {
    prisma.booking.findMany.mockResolvedValue([
      {
        id: 'bk-1',
        startDate: new Date('2026-07-25T11:25:00.000Z'),
        vehicleId: 'veh-1',
        customerId: 'cust-1',
        pickupStationId: 'st-1',
        vehicle: { id: 'veh-1', make: 'VW', model: 'Golf', licensePlate: 'M-AB 123', homeStationId: 'st-1' },
        customer: { firstName: 'Max', lastName: 'Mustermann' },
      },
    ]);

    const candidates = await detector.detect(detectorCtx);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].severity).toBe(InsightSeverity.INFO);
    expect(candidates[0].metrics?.minutesOverdue).toBeGreaterThanOrEqual(30);
    expect(candidates[0].dedupeKey).toBe('pickup_overdue:bk-1');
  });

  it('escalates to WARNING after 2 hours overdue', async () => {
    prisma.booking.findMany.mockResolvedValue([
      {
        id: 'bk-2',
        startDate: new Date('2026-07-25T09:30:00.000Z'),
        vehicleId: 'veh-2',
        customerId: 'cust-2',
        pickupStationId: null,
        vehicle: { id: 'veh-2', make: 'BMW', model: 'X1', licensePlate: 'M-CD 456', homeStationId: null },
        customer: { firstName: 'Erika', lastName: 'Test' },
      },
    ]);

    const candidates = await detector.detect(detectorCtx);

    expect(candidates[0].severity).toBe(InsightSeverity.WARNING);
    expect(candidates[0].metrics?.minutesOverdue).toBeGreaterThanOrEqual(120);
  });

  it('scopes query to tenant organizationId', async () => {
    prisma.booking.findMany.mockResolvedValue([]);

    await detector.detect(detectorCtx);

    expect(prisma.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: orgId }),
      }),
    );
  });

  it('excludes bookings with existing pickup handover protocol', async () => {
    prisma.booking.findMany.mockResolvedValue([]);

    await detector.detect(detectorCtx);

    expect(prisma.booking.findMany.mock.calls[0][0].where.handoverProtocols).toEqual({
      none: { kind: 'PICKUP' },
    });
  });
});
