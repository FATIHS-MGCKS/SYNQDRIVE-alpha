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
import type { VsiProfileCadenceLoadContext } from './vsi-profile-cadence-evidence.loader';

const LIVE = process.env.VSI03_READONLY_COMPOSER_PG === '1';

async function seedLvRow(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    vehicleId: string;
    providerSourceLinkId: string;
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
        providerSourceLinkId: input.providerSourceLinkId,
      },
      idempotencyKey: input.idempotencyKey,
    },
  });
}

function cadenceCtx(input: {
  organizationId: string;
  vehicleId: string;
  providerSourceLinkId: string;
  projectionAsOf: Date;
  linkActivatedAt: Date;
}): VsiProfileCadenceLoadContext {
  return {
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    providerSourceLinkId: input.providerSourceLinkId,
    fuelType: 'GASOLINE',
    projectionAsOf: input.projectionAsOf,
    linkActivatedAt: input.linkActivatedAt,
    linkDeactivatedAt: null,
    refreshRpmCadence: false,
    refreshLvCadence: true,
  };
}

/** Prisma create RETURNING must not assume columns absent on disposable DBs mid-migration. */
async function seedVehicleLatestStateBinding(
  prisma: PrismaClient,
  input: {
    vehicleId: string;
    providerBindingId: string;
    projectionAsOf: Date;
  },
) {
  await prisma.vehicleLatestState.create({
    data: {
      vehicleId: input.vehicleId,
      online: true,
      providerBindingId: input.providerBindingId,
      providerSource: 'DIMO',
      providerFetchedAt: input.projectionAsOf,
      sourceTimestamp: input.projectionAsOf,
      updatedAt: input.projectionAsOf,
    },
    select: {
      vehicleId: true,
      providerBindingId: true,
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
        await prisma.vehicleLatestState.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
        await prisma.vehicleDataSourceLink.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
        await prisma.vehicleProviderConsent.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
        await prisma.vehicle.deleteMany({ where: { id: { in: vehicleIds } } });
      }
      await prisma.organization.deleteMany({ where: { id: organizationId } });
      organizationId = '';
    });

    it('loads link-scoped provider-time LV rows and classifies LV_8H when integrity is complete', async () => {
      organizationId = await createLegacyReconcileOrg(prisma);
      const { vehicleId, linkId } = await createLegacyDimoLinkFixture(prisma, {
        organizationId,
        externalId: `lv-standby-${randomUUID().slice(0, 8)}`,
        rawJson: VO_PG_DIMO_SOFTWARE_RAW_JSON,
      });

      const linkActivatedAt = new Date('2026-09-01T00:00:00.000Z');
      const projectionAsOf = new Date('2026-10-15T12:00:00.000Z');
      const baseMs = Date.parse('2026-10-01T00:00:00.000Z');

      await seedVehicleLatestStateBinding(prisma, {
        vehicleId,
        providerBindingId: linkId,
        projectionAsOf,
      });

      for (let cluster = 0; cluster < 3; cluster += 1) {
        for (let i = 0; i < 5; i += 1) {
          const offsetHours = cluster * 90 + i * 8;
          const providerTimestamp = new Date(baseMs + offsetHours * 3600 * 1000);
          await seedLvRow(prisma, {
            organizationId,
            vehicleId,
            providerSourceLinkId: linkId,
            providerTimestamp,
            observedAt: providerTimestamp,
            idempotencyKey: `lv-standby:${cluster}:${i}:${randomUUID()}`,
          });
        }
      }

      const evidence = await loadLvStandbyTransmissionEvidenceFromDb(
        prisma as never,
        cadenceCtx({ organizationId, vehicleId, providerSourceLinkId: linkId, projectionAsOf, linkActivatedAt }),
      );

      expect(evidence).not.toBeNull();
      expect(evidence!.loadIntegrity.sourceLinkAttribution).toBe('VERIFIED');
      expect(evidence!.points.length).toBe(15);
      const resolution = resolveLvStandbyTransmissionProfileV1(evidence!);
      expect(resolution.profile).toBe('LV_8H_OBSERVED');
    });

    it('fail-closes UNKNOWN when providerSourceLinkId does not match active link attribution', async () => {
      organizationId = await createLegacyReconcileOrg(prisma);
      const { vehicleId, linkId } = await createLegacyDimoLinkFixture(prisma, {
        organizationId,
        externalId: `lv-standby-neg-${randomUUID().slice(0, 8)}`,
        rawJson: VO_PG_DIMO_SOFTWARE_RAW_JSON,
      });

      const linkActivatedAt = new Date('2026-09-01T00:00:00.000Z');
      const projectionAsOf = new Date('2026-10-15T12:00:00.000Z');
      const baseMs = Date.parse('2026-10-01T00:00:00.000Z');

      await seedVehicleLatestStateBinding(prisma, {
        vehicleId,
        providerBindingId: linkId,
        projectionAsOf,
      });

      for (let i = 0; i < 5; i += 1) {
        const providerTimestamp = new Date(baseMs + i * 8 * 3600 * 1000);
        await seedLvRow(prisma, {
          organizationId,
          vehicleId,
          providerSourceLinkId: linkId,
          providerTimestamp,
          observedAt: providerTimestamp,
          idempotencyKey: `lv-standby:neg:${i}:${randomUUID()}`,
        });
      }

      const evidence = await loadLvStandbyTransmissionEvidenceFromDb(
        prisma as never,
        cadenceCtx({
          organizationId,
          vehicleId,
          providerSourceLinkId: randomUUID(),
          projectionAsOf,
          linkActivatedAt,
        }),
      );

      expect(evidence!.loadIntegrity.sourceLinkAttribution).toBe('FAILED');
      expect(evidence!.points).toHaveLength(0);
      const resolution = resolveLvStandbyTransmissionProfileV1(evidence!);
      expect(resolution.profile).toBe('UNKNOWN');
      expect(resolution.classificationDecisionCode).toBe('SOURCE_LINK_ATTRIBUTION_FAILED');
    });

    it('blocks classification when an ongoing trip is open at decision time', async () => {
      organizationId = await createLegacyReconcileOrg(prisma);
      const { vehicleId, linkId } = await createLegacyDimoLinkFixture(prisma, {
        organizationId,
        externalId: `lv-standby-trip-${randomUUID().slice(0, 8)}`,
        rawJson: VO_PG_DIMO_SOFTWARE_RAW_JSON,
      });

      const linkActivatedAt = new Date('2026-09-01T00:00:00.000Z');
      const projectionAsOf = new Date('2026-10-10T00:00:00.000Z');

      await seedVehicleLatestStateBinding(prisma, {
        vehicleId,
        providerBindingId: linkId,
        projectionAsOf,
      });

      await prisma.vehicleTrip.create({
        data: {
          vehicleId,
          startTime: new Date('2026-10-09T20:00:00.000Z'),
          endTime: null,
          tripStatus: TripStatus.ONGOING,
        },
      });

      const evidence = await loadLvStandbyTransmissionEvidenceFromDb(
        prisma as never,
        cadenceCtx({ organizationId, vehicleId, providerSourceLinkId: linkId, projectionAsOf, linkActivatedAt }),
      );

      expect(evidence!.loadIntegrity.activeOrIncompleteTripBlocksClassification).toBe(true);
      const resolution = resolveLvStandbyTransmissionProfileV1(evidence!);
      expect(resolution.profile).toBe('UNKNOWN');
      expect(resolution.classificationDecisionCode).toBe('ACTIVE_OR_INCOMPLETE_TRIP_IN_WINDOW');
    });
  },
);
