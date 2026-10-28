/**
 * VSI LV standby transmission evidence loader (disposable PostgreSQL).
 */
import {
  BatteryEvidenceScope,
  BatteryMeasurementQuality,
  BatteryMeasurementType,
  PrismaClient,
  TripStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { assertVsi03DisposablePostgresTarget } from './vsi-readonly-composer.postgres-guard';
import {
  createLegacyDimoLinkFixture,
  createLegacyReconcileOrg,
} from '../../vehicle-onboarding/connection-identity/legacy-reconciliation/legacy-reconciliation-postgres.fixture';
import { VO_PG_DIMO_SOFTWARE_RAW_JSON } from '../../vehicle-onboarding/testing/dimo-mirror-postgres.fixture';
import { loadLvStandbyTransmissionEvidenceFromDb } from './vsi-lv-standby-transmission-evidence.loader';
import { resolveLvStandbyTransmissionProfileV1 } from './vsi-lv-standby-transmission-profile-resolver.util';

const LIVE = process.env.VSI03_READONLY_COMPOSER_PG === '1';

async function seedLvRow(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    vehicleId: string;
    providerTimestamp: Date;
    observedAt: Date;
    outcome?: string;
    idempotencyKey: string;
  },
) {
  await prisma.batteryMeasurement.create({
    data: {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      type: BatteryMeasurementType.LIVE_VOLTAGE,
      scope: BatteryEvidenceScope.LV,
      quality: BatteryMeasurementQuality.VALID,
      numericValue: 12.5,
      unit: 'V',
      providerTimestamp: input.providerTimestamp,
      observedAt: input.observedAt,
      provenance: {
        providerObservationOutcome: input.outcome ?? 'NEW_OBSERVATION',
      },
      idempotencyKey: input.idempotencyKey,
    },
  });
}

(LIVE ? describe : describe.skip)(
  'VSI LV standby transmission evidence loader (PostgreSQL)',
  () => {
    const prisma = new PrismaClient();
    let organizationId: string;

    beforeAll(() => {
      assertVsi03DisposablePostgresTarget();
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    afterEach(async () => {
      if (!organizationId) {
        return;
      }
      const vehicles = await prisma.vehicle.findMany({
        where: { organizationId },
        select: { id: true },
      });
      const vehicleIds = vehicles.map((v) => v.id);
      if (vehicleIds.length > 0) {
        await prisma.batteryMeasurement.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
        await prisma.vehicleTrip.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
        await prisma.vehicleDataSourceLink.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
        await prisma.vehicleProviderConsent.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
        await prisma.vehicle.deleteMany({ where: { id: { in: vehicleIds } } });
      }
      await prisma.organization.deleteMany({ where: { id: organizationId } });
      organizationId = '';
    });

    it('loads link-scoped provider-time LV rows with idempotent timestamp dedupe', async () => {
      organizationId = await createLegacyReconcileOrg(prisma);
      const { vehicleId } = await createLegacyDimoLinkFixture(prisma, {
        organizationId,
        externalId: `lv-standby-${randomUUID().slice(0, 8)}`,
        rawJson: VO_PG_DIMO_SOFTWARE_RAW_JSON,
      });

      const linkActivatedAt = new Date('2026-09-01T00:00:00.000Z');
      const projectionAsOf = new Date('2026-10-15T12:00:00.000Z');
      const baseMs = Date.parse('2026-10-01T00:00:00.000Z');

      for (let cluster = 0; cluster < 3; cluster += 1) {
        for (let i = 0; i < 5; i += 1) {
          const offsetHours = cluster * 90 + i * 8;
          const providerTimestamp = new Date(baseMs + offsetHours * 3600 * 1000);
          await seedLvRow(prisma, {
            organizationId,
            vehicleId,
            providerTimestamp,
            observedAt: providerTimestamp,
            idempotencyKey: `lv-standby:${cluster}:${i}:${randomUUID()}`,
          });
        }
      }

      const dupTs = new Date(baseMs + 8 * 3600 * 1000);
      await seedLvRow(prisma, {
        organizationId,
        vehicleId,
        providerTimestamp: dupTs,
        observedAt: new Date(dupTs.getTime() + 60_000),
        idempotencyKey: `lv-standby:dup:${randomUUID()}`,
      });

      await seedLvRow(prisma, {
        organizationId,
        vehicleId,
        providerTimestamp: new Date('2026-08-15T00:00:00.000Z'),
        observedAt: new Date('2026-08-15T00:00:00.000Z'),
        idempotencyKey: `lv-standby:before-link:${randomUUID()}`,
      });

      const evidence = await loadLvStandbyTransmissionEvidenceFromDb(prisma as never, {
        organizationId,
        vehicleId,
        providerSourceLinkId: randomUUID(),
        fuelType: 'GASOLINE',
        projectionAsOf,
        linkActivatedAt,
        linkDeactivatedAt: null,
        refreshRpmCadence: false,
        refreshLvCadence: true,
      });

      expect(evidence).not.toBeNull();
      expect(evidence!.points.length).toBe(15);
      expect(
        evidence!.points.every(
          (p) =>
            p.providerTimestampMs >= linkActivatedAt.getTime() &&
            p.providerTimestampMs <= projectionAsOf.getTime(),
        ),
      ).toBe(true);

      const resolution = resolveLvStandbyTransmissionProfileV1(evidence!);
      expect(resolution.profile).toBe('LV_8H_OBSERVED');
    });

    it('returns null when refreshLvCadence is false', async () => {
      organizationId = await createLegacyReconcileOrg(prisma);
      const { vehicleId } = await createLegacyDimoLinkFixture(prisma, {
        organizationId,
        externalId: `lv-standby-off-${randomUUID().slice(0, 8)}`,
        rawJson: VO_PG_DIMO_SOFTWARE_RAW_JSON,
      });

      const result = await loadLvStandbyTransmissionEvidenceFromDb(prisma as never, {
        organizationId,
        vehicleId,
        providerSourceLinkId: randomUUID(),
        fuelType: 'GASOLINE',
        projectionAsOf: new Date(),
        linkActivatedAt: new Date('2026-01-01T00:00:00.000Z'),
        linkDeactivatedAt: null,
        refreshRpmCadence: false,
        refreshLvCadence: false,
      });
      expect(result).toBeNull();
    });

    it('loads completed trips for interval isolation', async () => {
      organizationId = await createLegacyReconcileOrg(prisma);
      const { vehicleId } = await createLegacyDimoLinkFixture(prisma, {
        organizationId,
        externalId: `lv-standby-trip-${randomUUID().slice(0, 8)}`,
        rawJson: VO_PG_DIMO_SOFTWARE_RAW_JSON,
      });

      const linkActivatedAt = new Date('2026-09-01T00:00:00.000Z');
      const projectionAsOf = new Date('2026-10-10T00:00:00.000Z');
      const tripStart = new Date('2026-10-05T04:00:00.000Z');
      const tripEnd = new Date('2026-10-05T05:00:00.000Z');
      await prisma.vehicleTrip.create({
        data: {
          vehicleId,
          startTime: tripStart,
          endTime: tripEnd,
          tripStatus: TripStatus.COMPLETED,
        },
      });

      const evidence = await loadLvStandbyTransmissionEvidenceFromDb(prisma as never, {
        organizationId,
        vehicleId,
        providerSourceLinkId: randomUUID(),
        fuelType: 'GASOLINE',
        projectionAsOf,
        linkActivatedAt,
        linkDeactivatedAt: null,
        refreshRpmCadence: false,
        refreshLvCadence: true,
      });

      expect(evidence?.tripWindows).toEqual([
        expect.objectContaining({
          startMs: tripStart.getTime(),
          endMs: tripEnd.getTime(),
        }),
      ]);
    });
  },
);
