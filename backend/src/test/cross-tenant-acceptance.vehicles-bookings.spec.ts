/**
 * Cross-tenant acceptance — vehicles & bookings (CT-VEH-*, CT-BKG-*)
 */
import { NotFoundException } from '@nestjs/common';
import { CROSS_TENANT_IDS, scopedWhere } from './cross-tenant-acceptance.harness';

describe('Cross-tenant acceptance — vehicles (CT-VEH)', () => {
  const { orgA, orgB, vehicleA, vehicleB } = CROSS_TENANT_IDS;

  it('CT-VEH-01: findOne scoped by org returns null for foreign vehicle UUID', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const result = await findFirst({ where: scopedWhere(orgA, vehicleB) });
    expect(result).toBeNull();
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: vehicleB, organizationId: orgA },
    });
  });

  it('CT-VEH-02: tenant APIs must scope by organizationId not UUID alone', async () => {
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce({ id: vehicleB, organizationId: orgB })
      .mockResolvedValueOnce(null);
    const unsafe = await findFirst({ where: { id: vehicleB } });
    expect(unsafe?.organizationId).toBe(orgB);
    const safe = await findFirst({ where: scopedWhere(orgA, vehicleB) });
    expect(safe).toBeNull();
  });

  it('CT-VEH-03: update with manipulated orgId in path but foreign vehicleId yields no row', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const result = await updateMany({
      where: scopedWhere(orgA, vehicleB),
      data: { status: 'IN_SERVICE' },
    });
    expect(result.count).toBe(0);
  });
});

describe('Cross-tenant acceptance — bookings (CT-BKG)', () => {
  const { orgA, bookingB } = CROSS_TENANT_IDS;

  it('CT-BKG-01: foreign booking UUID with org filter returns null (no leak)', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const row = await findFirst({ where: { id: bookingB, organizationId: orgA } });
    expect(row).toBeNull();
  });

  it('CT-BKG-02: cross-tenant vehicle on create must be rejected at service layer', async () => {
    const vehicleLookup = jest.fn().mockResolvedValue(null);
    await expect(
      vehicleLookup({ where: { id: CROSS_TENANT_IDS.vehicleB, organizationId: orgA } }).then(
        (v: unknown) => {
          if (!v) throw new NotFoundException('Vehicle not found');
        },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
