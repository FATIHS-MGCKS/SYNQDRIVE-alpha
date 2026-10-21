import { isVehicleInActiveTripAtMs } from './apd-shadow-trip-reconciliation.util';

describe('isVehicleInActiveTripAtMs (frozen interval contract)', () => {
  const vehicleId = 'arteon-veh';
  const atMs = Date.parse('2026-10-09T21:41:14.085Z');

  it('treats CANCELLED + NULL end_time as active interval (reconciliation=false)', async () => {
    const prisma = {
      vehicleTrip: {
        findFirst: jest.fn().mockResolvedValue({ id: 'open-cancelled-trip' }),
      },
    };
    const inTrip = await isVehicleInActiveTripAtMs(prisma as never, vehicleId, atMs);
    expect(inTrip).toBe(true);
    expect(prisma.vehicleTrip.findFirst).toHaveBeenCalledWith({
      where: {
        vehicleId,
        startTime: { lte: new Date(atMs) },
        OR: [{ endTime: null }, { endTime: { gte: new Date(atMs) } }],
      },
      select: { id: true },
    });
  });

  it('returns false when no interval covers decision time', async () => {
    const prisma = {
      vehicleTrip: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    expect(await isVehicleInActiveTripAtMs(prisma as never, vehicleId, atMs)).toBe(false);
  });
});
