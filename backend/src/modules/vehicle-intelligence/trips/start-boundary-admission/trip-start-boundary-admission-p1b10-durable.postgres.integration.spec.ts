import { PrismaClient, TripStatus } from '@prisma/client';
import { mergeFinalizeRawDetectionMeta } from '../trip-fsm-forensics.util';
import {
  atomicMergeVehicleTripRawDetectionMetaPatch,
  buildMidGapSplitFirstTripRawDetectionMetaPatch,
  persistStartBoundaryAdmissionShadowDurable,
  readStartBoundaryAdmissionShadowDurable,
  START_BOUNDARY_ADMISSION_SHADOW_DURABLE_META_KEY,
} from './trip-start-boundary-admission-durable.persistence';
import { boundaryResolution } from './trip-start-boundary-admission-p1b-orchestration.harness';
import {
  P1B_ORCH_CANDIDATE,
  P1B_ORCH_LEGACY_START,
  P1B_ORCH_NOW,
} from './trip-start-boundary-admission-p1b-orchestration.harness';
import type { ShadowStartBoundaryAdmissionSummary } from './trip-start-boundary-admission-shadow.runtime';

const LIVE = process.env.TRIP_P1B10_DURABLE_POSTGRES_INTEGRATION === '1';
const REQUIRED = process.env.TRIP_P1B10_DURABLE_POSTGRES_REQUIRED === '1';

if (REQUIRED) {
  if (!LIVE) {
    throw new Error(
      'TRIP_P1B10_DURABLE_POSTGRES_REQUIRED=1 but TRIP_P1B10_DURABLE_POSTGRES_INTEGRATION is not 1',
    );
  }
  const url = process.env.DATABASE_URL ?? '';
  if (!url.includes('127.0.0.1') && !url.includes('localhost')) {
    throw new Error(
      'TRIP_P1B10_DURABLE_POSTGRES_REQUIRED=1 but DATABASE_URL is not CI-local',
    );
  }
}

function sampleShadow(vehicleId: string): ShadowStartBoundaryAdmissionSummary {
  return {
    vehicleId,
    dimoTokenId: 1,
    integrationModality: 'SOFTWARE_INTEGRATION',
    providerSegmentId: 'seg-pg',
    providerSegmentDetectionMechanism: 'changePointDetection',
    candidateStartAt: P1B_ORCH_CANDIDATE.toISOString(),
    legacyCanonicalStartAt: P1B_ORCH_LEGACY_START.toISOString(),
    proposedCanonicalStartAt: P1B_ORCH_CANDIDATE.toISOString(),
    shadowProposedStartAt: P1B_ORCH_CANDIDATE.toISOString(),
    shadowDeltaMs: 7000,
    shadowDecision: 'MOVEMENT_BOUNDARY_SELECTED',
    deltaMs: 7000,
    decision: 'MOVEMENT_BOUNDARY_SELECTED',
    movementEvidenceSources: ['CORE_SPEED'],
    movementEvidenceCoverage: 'TRUSTED_MOVEMENT_PRESENT',
    routeEvidenceAvailable: false,
    additionalShadowRouteFetchPerformed: false,
    legacyRouteFetchPerformed: false,
    uncorroboratedPrefixFromAt: null,
    uncorroboratedPrefixToAt: null,
    shadowExecutionFailure: null,
    observedAt: P1B_ORCH_NOW.toISOString(),
  };
}

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
  'P1B.10 durable start shadow (PostgreSQL integration)',
  () => {
    let prisma: PrismaClient;
    let dbOk = false;
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let orgId = '';
    let vehicleId = '';
    let tripId = '';

    beforeAll(async () => {
      dbOk = await probeDatabase();
      if (REQUIRED && !dbOk) {
        throw new Error('P1B.10 durable postgres probe failed in required mode');
      }
      if (!dbOk) return;
      prisma = new PrismaClient();
    }, 60_000);

    beforeEach(async () => {
      if (!dbOk) return;
      const org = await prisma.organization.create({
        data: {
          companyName: `P1B10 ${suffix}`,
          businessType: 'RENTAL',
          status: 'ACTIVE',
        },
        select: { id: true },
      });
      orgId = org.id;
      const vehicle = await prisma.vehicle.create({
        data: {
          organizationId: org.id,
          vin: `VIN${suffix}`.slice(0, 17).padEnd(17, '0'),
          licensePlate: `P1B-${suffix}`.slice(0, 12),
          make: 'Test',
          model: 'P1B10',
          year: 2024,
          fuelType: 'GASOLINE',
          status: 'AVAILABLE',
        },
        select: { id: true },
      });
      vehicleId = vehicle.id;
      const trip = await prisma.vehicleTrip.create({
        data: {
          vehicleId: vehicle.id,
          tripStatus: TripStatus.ONGOING,
          startTime: P1B_ORCH_LEGACY_START,
          rawDetectionMeta: {
            lifecycleRecovery: { startEpisode: { type: 'start_episode' } },
            pilotMarker: 'keep-me',
          },
        },
        select: { id: true },
      });
      tripId = trip.id;
    });

    afterEach(async () => {
      if (!dbOk) return;
      await prisma.vehicleTrip.deleteMany({ where: { vehicleId } }).catch(() => undefined);
      await prisma.vehicle.deleteMany({ where: { id: vehicleId } }).catch(() => undefined);
      await prisma.organization.deleteMany({ where: { id: orgId } }).catch(() => undefined);
    });

    afterAll(async () => {
      await prisma?.$disconnect().catch(() => undefined);
    });

    const evidence = boundaryResolution().evidence;
    const basePersist = () => ({
      tripId,
      vehicleId,
      organizationId: orgId,
      candidateStartAt: P1B_ORCH_CANDIDATE,
      confirmedAt: P1B_ORCH_NOW,
      shadowSummary: sampleShadow(vehicleId),
      shadowEnabled: true,
      evidence,
      corePointCount: 7,
      prisma,
    });

    it('concurrent persist attempts — exactly one WRITTEN, first-write-wins', async () => {
      const [a, b] = await Promise.all([
        persistStartBoundaryAdmissionShadowDurable({
          ...basePersist(),
          corePointCount: 3,
        }),
        persistStartBoundaryAdmissionShadowDurable({
          ...basePersist(),
          corePointCount: 99,
        }),
      ]);

      const outcomes = [a, b].sort();
      expect(outcomes).toEqual(['SKIPPED_ALREADY_PRESENT', 'WRITTEN']);

      const row = await prisma.vehicleTrip.findUnique({
        where: { id: tripId },
        select: { rawDetectionMeta: true },
      });
      const durable = readStartBoundaryAdmissionShadowDurable(row?.rawDetectionMeta);
      const winnerCount = durable?.dataSourcesAtDecision.corePointCount;
      expect(winnerCount === 3 || winnerCount === 99).toBe(true);
      expect((row?.rawDetectionMeta as any)?.pilotMarker).toBe('keep-me');
      expect((row?.rawDetectionMeta as any)?.lifecycleRecovery).toBeDefined();
    });

    it('concurrent shadow persist + other JSON key merge preserves both', async () => {
      await Promise.all([
        persistStartBoundaryAdmissionShadowDurable(basePersist()),
        prisma.$executeRaw`
          UPDATE vehicle_trips
          SET raw_detection_meta = COALESCE(raw_detection_meta, '{}'::jsonb)
            || jsonb_build_object('concurrentMetaKey', 'yes')
          WHERE id = ${tripId}::uuid
        `,
      ]);

      const row = await prisma.vehicleTrip.findUnique({
        where: { id: tripId },
        select: { rawDetectionMeta: true },
      });
      const meta = row?.rawDetectionMeta as Record<string, unknown>;
      expect(readStartBoundaryAdmissionShadowDurable(meta)?.executionStatus).toBe(
        'EXECUTED',
      );
      expect(meta.concurrentMetaKey).toBe('yes');
      expect(meta.pilotMarker).toBe('keep-me');
      expect(meta[START_BOUNDARY_ADMISSION_SHADOW_DURABLE_META_KEY]).toBeDefined();
    });

    it('split first-trip meta merge does not erase concurrently persisted shadow', async () => {
      await persistStartBoundaryAdmissionShadowDurable(basePersist());
      await atomicMergeVehicleTripRawDetectionMetaPatch(prisma, {
        tripId,
        vehicleId,
        patch: buildMidGapSplitFirstTripRawDetectionMetaPatch({
          reason: 'mid_gap_stationary',
          triggeredBy: 'LIVE',
          gapMs: 600_000,
          firstEndAt: new Date('2026-10-16T04:00:00.000Z'),
          secondStartAt: new Date('2026-10-16T04:15:00.000Z'),
        }),
      });

      const row = await prisma.vehicleTrip.findUnique({
        where: { id: tripId },
        select: { rawDetectionMeta: true },
      });
      const meta = row?.rawDetectionMeta as Record<string, unknown>;
      expect(meta.pilotMarker).toBe('keep-me');
      expect(meta.splitReason).toBe('mid_gap_stationary');
      expect(readStartBoundaryAdmissionShadowDurable(meta)?.executionStatus).toBe(
        'EXECUTED',
      );
    });

    it('worker retry — second persist SKIPPED, evidence unchanged', async () => {
      const first = await persistStartBoundaryAdmissionShadowDurable(basePersist());
      expect(first).toBe('WRITTEN');
      const afterFirst = await prisma.vehicleTrip.findUnique({
        where: { id: tripId },
        select: { rawDetectionMeta: true },
      });
      const second = await persistStartBoundaryAdmissionShadowDurable({
        ...basePersist(),
        corePointCount: 500,
      });
      expect(second).toBe('SKIPPED_ALREADY_PRESENT');
      const afterSecond = await prisma.vehicleTrip.findUnique({
        where: { id: tripId },
        select: { rawDetectionMeta: true },
      });
      expect(afterSecond?.rawDetectionMeta).toEqual(afterFirst?.rawDetectionMeta);
    });

    it('finalize merge preserves durable shadow key', async () => {
      await persistStartBoundaryAdmissionShadowDurable(basePersist());
      const trip = await prisma.vehicleTrip.findUnique({
        where: { id: tripId },
        select: { rawDetectionMeta: true },
      });
      const merged = mergeFinalizeRawDetectionMeta({
        priorRaw: trip?.rawDetectionMeta,
        finalizeLayer: {
          endRecognizedAt: P1B_ORCH_NOW.toISOString(),
          tripFsmForensics: { version: 'r8-v1' },
        },
      });
      expect(merged[START_BOUNDARY_ADMISSION_SHADOW_DURABLE_META_KEY]).toBeDefined();
      expect(merged.pilotMarker).toBe('keep-me');
    });
  },
);
