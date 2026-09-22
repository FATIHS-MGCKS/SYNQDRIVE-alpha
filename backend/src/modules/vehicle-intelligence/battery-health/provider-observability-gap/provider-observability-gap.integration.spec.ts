import { randomUUID } from 'crypto';
import {
  BatteryEvidenceScope,
  BatteryMeasurementQuality,
  BatteryMeasurementType,
  BatteryProviderObservabilityGapStatus,
  PrismaClient,
} from '@prisma/client';
import { ProviderObservabilityGapRepository } from './provider-observability-gap.repository';
import {
  buildProviderGapOpenIdempotencyKey,
  buildProviderGapResolutionIdempotencyKey,
} from './provider-observability-gap-idempotency.policy';
import { PROVIDER_GAP_CONTRACT_VERSION } from './provider-observability-gap.constants';

const LIVE = process.env.BATTERY_V2_PROVIDER_GAP_INTEGRATION === '1';

async function probeDatabase(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

(LIVE ? describe : describe.skip)(
  'provider observability gap (PostgreSQL integration)',
  () => {
    let prisma: PrismaClient;
    let repository: ProviderObservabilityGapRepository;
    let organizationId = '';
    let vehicleId = '';

    beforeAll(async () => {
      if (!(await probeDatabase())) {
        throw new Error(
          'BATTERY_V2_PROVIDER_GAP_INTEGRATION=1 requires reachable DATABASE_URL',
        );
      }
      prisma = new PrismaClient();
      repository = new ProviderObservabilityGapRepository(prisma as never);
    }, 120_000);

    afterAll(async () => {
      await prisma?.$disconnect().catch(() => undefined);
    });

    beforeEach(async () => {
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const org = await prisma.organization.create({
        data: {
          companyName: `Gap Org ${suffix}`,
          businessType: 'FLEET',
          status: 'ACTIVE',
        },
      });
      organizationId = org.id;
      const vehicle = await prisma.vehicle.create({
        data: {
          organizationId,
          licensePlate: `GAP-${suffix}`,
          vin: `VIN${suffix}`.slice(0, 17).padEnd(17, '0'),
          make: 'Test',
          model: 'ICE',
          year: 2024,
          fuelType: 'GASOLINE',
          hardwareType: 'LTE_R1',
          status: 'AVAILABLE',
        },
      });
      vehicleId = vehicle.id;
    });

    afterEach(async () => {
      if (!organizationId) return;
      await prisma.batteryProviderObservabilityGap.deleteMany({ where: { organizationId } });
      await prisma.batteryMeasurement.deleteMany({ where: { organizationId } });
      await prisma.vehicle.deleteMany({ where: { organizationId } });
      await prisma.organization.deleteMany({ where: { id: organizationId } });
    });

    it('C: concurrent open creates one logical OPEN gap', async () => {
      const anchor = new Date('2026-09-21T18:47:56.000Z');
      const idempotencyKey = buildProviderGapOpenIdempotencyKey({
        organizationId,
        vehicleId,
        lastFreshProviderAt: anchor,
      });

      const base = {
        organization: { connect: { id: organizationId } },
        vehicle: { connect: { id: vehicleId } },
        contractVersion: PROVIDER_GAP_CONTRACT_VERSION,
        signalFamily: 'LIVE_VOLTAGE_ENGINE_STATE_BUNDLE',
        status: BatteryProviderObservabilityGapStatus.OPEN,
        gapDetectedAt: new Date(),
        lastFreshProviderAt: anchor,
        idempotencyKey,
      };

      const [a, b] = await Promise.all([
        repository.openOrExtendGap(base),
        repository.openOrExtendGap(base),
      ]);

      expect(a.gapId).toBe(b.gapId);
      const rows = await prisma.batteryProviderObservabilityGap.findMany({
        where: { vehicleId, status: 'OPEN' },
      });
      expect(rows).toHaveLength(1);
    });

    it('I: concurrent resolve is idempotent', async () => {
      const anchor = new Date('2026-09-21T18:47:56.000Z');
      const openKey = buildProviderGapOpenIdempotencyKey({
        organizationId,
        vehicleId,
        lastFreshProviderAt: anchor,
      });
      const open = await repository.openOrExtendGap({
        organization: { connect: { id: organizationId } },
        vehicle: { connect: { id: vehicleId } },
        contractVersion: PROVIDER_GAP_CONTRACT_VERSION,
        gapDetectedAt: new Date(),
        lastFreshProviderAt: anchor,
        idempotencyKey: openKey,
      });

      const measurement = await prisma.batteryMeasurement.create({
        data: {
          organizationId,
          vehicleId,
          type: BatteryMeasurementType.LIVE_VOLTAGE,
          scope: BatteryEvidenceScope.LV,
          quality: BatteryMeasurementQuality.VALID,
          numericValue: 12.2,
          unit: 'V',
          observedAt: new Date('2026-09-22T08:00:00.000Z'),
          idempotencyKey: `meas:${randomUUID()}`,
        },
      });

      const resolutionKey = buildProviderGapResolutionIdempotencyKey({
        gapId: open.gapId,
        resolutionStatus: BatteryProviderObservabilityGapStatus.RESOLVED_OFF,
        firstFreshProviderAt: measurement.observedAt,
      });

      const [r1, r2] = await Promise.all([
        repository.resolveGapIdempotent({
          gapId: open.gapId,
          resolutionStatus: BatteryProviderObservabilityGapStatus.RESOLVED_OFF,
          resolutionAt: new Date(),
          resolutionIdempotencyKey: resolutionKey,
          firstFreshObservationAfterGapId: measurement.id,
        }),
        repository.resolveGapIdempotent({
          gapId: open.gapId,
          resolutionStatus: BatteryProviderObservabilityGapStatus.RESOLVED_OFF,
          resolutionAt: new Date(),
          resolutionIdempotencyKey: resolutionKey,
          firstFreshObservationAfterGapId: measurement.id,
        }),
      ]);

      expect([r1.outcome, r2.outcome].sort()).toEqual(['duplicate', 'resolved']);
    });
  },
);
