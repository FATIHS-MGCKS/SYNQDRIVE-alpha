import { EnergyEventsService } from '../energy-events.service';
import { ERD_RECHARGE_LEGACY_FRAGMENT_PRODUCT_READ_ENV_FLAG } from './erd-recharge-legacy-fragment-product-read.constants';
import {
  buildTesla20261012HvPhysicalAnchor,
  buildTesla20261012LegacyRechargeFragmentFixture,
  TESLA_FRAGMENT_FIXTURE_VEHICLE_ID,
} from './tesla-2026-10-12-legacy-recharge-fragment.fixture';

describe('EnergyEventsService legacy RECHARGE fragment product-read (query path)', () => {
  const teslaRows = buildTesla20261012LegacyRechargeFragmentFixture();
  const teslaHv = buildTesla20261012HvPhysicalAnchor();
  const findMany = jest.fn();
  const hvFindMany = jest.fn();
  const prisma = {
    vehicleEnergyEvent: { findMany },
    hvChargeSession: { findMany: hvFindMany },
  };
  const service = new EnergyEventsService(prisma as never, {} as never);

  const envOn = {
    ...process.env,
    [ERD_RECHARGE_LEGACY_FRAGMENT_PRODUCT_READ_ENV_FLAG]: '1',
  };

  beforeEach(() => {
    findMany.mockReset();
    hvFindMany.mockReset();
    hvFindMany.mockResolvedValue([teslaHv]);
  });

  it('Tesla full day — gate OFF returns 8 product RECHARGE rows', async () => {
    findMany.mockResolvedValue(teslaRows);
    const envOff = { ...process.env, [ERD_RECHARGE_LEGACY_FRAGMENT_PRODUCT_READ_ENV_FLAG]: '0' };
    const canonical = await service.listCanonicalEnergyEvents(
      TESLA_FRAGMENT_FIXTURE_VEHICLE_ID,
      {},
      envOff,
    );
    expect(canonical.filter((row) => row.kind === 'RECHARGE')).toHaveLength(8);
    expect(hvFindMany).not.toHaveBeenCalled();
  });

  it('Tesla full day — gate ON returns 1 product RECHARGE row', async () => {
    findMany.mockResolvedValue(teslaRows);
    const canonical = await service.listCanonicalEnergyEvents(
      TESLA_FRAGMENT_FIXTURE_VEHICLE_ID,
      {},
      envOn,
    );
    expect(canonical.filter((row) => row.kind === 'RECHARGE')).toHaveLength(1);
    expect(canonical[0]!.id).toBe('420c253b-676a-4ab6-8e89-7528d538a7d8');
  });

  it('Tesla window 16:00–17:00 Berlin — collapse then anchor filter yields zero RECHARGE cards', async () => {
    const from = new Date('2026-10-12T14:00:00.000Z');
    const to = new Date('2026-10-12T15:00:00.000Z');
    const parent = teslaRows[0]!;
    const overlappingWithoutParent = teslaRows.filter(
      (row) =>
        row.id !== parent.id && row.startTime <= to && row.endTime >= from,
    );
    expect(overlappingWithoutParent.length).toBeGreaterThan(0);
    findMany
      .mockResolvedValueOnce(overlappingWithoutParent)
      .mockResolvedValueOnce([parent]);
    const canonical = await service.listCanonicalEnergyEvents(
      TESLA_FRAGMENT_FIXTURE_VEHICLE_ID,
      { from, to },
      envOn,
    );
    expect(canonical.filter((row) => row.kind === 'RECHARGE')).toHaveLength(0);
    expect(findMany).toHaveBeenCalledTimes(2);
  });

  it('Tesla window including 15:06 Berlin — exactly one RECHARGE card', async () => {
    const from = new Date('2026-10-12T13:06:55.314Z');
    const to = new Date('2026-10-12T15:10:30.313Z');
    findMany.mockResolvedValue(teslaRows);
    const canonical = await service.listCanonicalEnergyEvents(
      TESLA_FRAGMENT_FIXTURE_VEHICLE_ID,
      { from, to },
      envOn,
    );
    expect(canonical.filter((row) => row.kind === 'RECHARGE')).toHaveLength(1);
  });

  it('raw forensic API still returns all rows in window without collapse', async () => {
    findMany.mockResolvedValue(teslaRows);
    const raw = await service.listEnergyEventsRaw(TESLA_FRAGMENT_FIXTURE_VEHICLE_ID, {});
    expect(raw.filter((row) => row.kind === 'RECHARGE')).toHaveLength(8);
  });
});
