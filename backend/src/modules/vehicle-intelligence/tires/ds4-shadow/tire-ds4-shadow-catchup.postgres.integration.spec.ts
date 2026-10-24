/**
 * Tire DS4 shadow catch-up SQL + migration (disposable PostgreSQL).
 *
 * CI: `production-database-guard-postgres-gate.sh` step 8b (no package.json script).
 * Local: TIRE_DS4_SHADOW_POSTGRES_INTEGRATION=1 DATABASE_URL=postgresql://127.0.0.1:5432/... \
 *   PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1 bash scripts/test/prisma-migrate-deploy-resilient.sh && \
 *   npx jest tire-ds4-shadow-catchup.postgres.integration --runInBand
 */
import { randomUUID } from 'node:crypto';
import { BusinessType, FuelType, PrismaClient, TripStatus } from '@prisma/client';
import { TireDs4ShadowRepository } from './tire-ds4-shadow.repository';
import { TIRE_DS4_SHADOW_ADAPTER_VERSION } from './tire-ds4-shadow-adapter.version';
import {
  TIRE_DS4_SHADOW_TERMINAL_RUN_DS4_NOT_AVAILABLE,
  TIRE_DS4_SHADOW_TERMINAL_RUN_RETRY_EXHAUSTED,
} from './tire-ds4-shadow-terminal-runs';

const LIVE = process.env.TIRE_DS4_SHADOW_POSTGRES_INTEGRATION === '1';
const REQUIRED = process.env.TIRE_DS4_SHADOW_POSTGRES_REQUIRED === '1';

if (REQUIRED) {
  if (!LIVE) {
    throw new Error(
      'TIRE_DS4_SHADOW_POSTGRES_REQUIRED=1 but TIRE_DS4_SHADOW_POSTGRES_INTEGRATION is not 1',
    );
  }
  const url = process.env.DATABASE_URL ?? '';
  if (!url) {
    throw new Error('TIRE_DS4_SHADOW_POSTGRES_REQUIRED=1 but DATABASE_URL is unset');
  }
  if (!url.includes('127.0.0.1') && !url.includes('localhost')) {
    throw new Error('TIRE_DS4_SHADOW_POSTGRES_REQUIRED=1 but DATABASE_URL is not CI-local');
  }
}

const describePg = LIVE && process.env.DATABASE_URL ? describe : describe.skip;

describePg('tire-ds4-shadow catch-up (PostgreSQL)', () => {
  const prisma = new PrismaClient();
  const repository = new TireDs4ShadowRepository(prisma as never);

  let organizationId = '';
  let vehicleId = '';
  let tripId = '';
  let tireSetupId = '';
  let ledgerId = '';

  async function seedDs4Run(runId: string, createdAt: Date, status = 'SUCCEEDED') {
    await prisma.diV0MotionCoreShadowRunV1.create({
      data: {
        id: runId,
        organizationId,
        vehicleId,
        tripId,
        workItemId: randomUUID(),
        shadowIntentKey: 'motion-core',
        shadowBundleVersion: 'bundle-test',
        pinnedSnapshotHash: `pin-${runId}`,
        combinedInputIdentity: `ci-${runId}`,
        contentFingerprint: `fp-${runId}`,
        shadowStatus: status,
        summaryJson: {},
        payloadGzip: Buffer.from('{}'),
        uncompressedBytes: 2,
        createdAt,
      },
    });
  }

  async function seedTerminalMarker(kind: 'retry_exhausted' | 'ds4_not_available') {
    const runId =
      kind === 'retry_exhausted'
        ? TIRE_DS4_SHADOW_TERMINAL_RUN_RETRY_EXHAUSTED
        : TIRE_DS4_SHADOW_TERMINAL_RUN_DS4_NOT_AVAILABLE;
    const fingerprint = `terminal:${kind}:test`;
    await prisma.tireDs4MotionShadowInputV1.create({
      data: {
        organizationId,
        vehicleId,
        tripId,
        tireSetupId,
        tireTripUsageLedgerId: ledgerId,
        diV0MotionCoreShadowRunId: runId,
        combinedInputIdentity: fingerprint,
        pinnedSnapshotHash: fingerprint,
        contentFingerprint: fingerprint,
        shadowBundleVersion: 'n/a',
        speedAuthority: 'n/a',
        eventsAlgorithmVersion: 'n/a',
        adapterVersion: TIRE_DS4_SHADOW_ADAPTER_VERSION,
        eventQualityCoverage: 'NONE',
        temporalCoverage: 'NONE',
        ds4ReadStatus: kind === 'retry_exhausted' ? 'RETRY_EXHAUSTED' : 'NOT_AVAILABLE',
        inputPayload: { schemaVersion: 2, neutral: true },
      },
    });
  }

  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: { companyName: `TIRE_DS4_SHADOW_PG_${Date.now()}`, businessType: BusinessType.RENTAL },
      select: { id: true },
    });
    organizationId = org.id;

    const vehicle = await prisma.vehicle.create({
      data: {
        organizationId,
        make: 'Test',
        model: 'TireDs4',
        year: 2026,
        fuelType: FuelType.GASOLINE,
      },
      select: { id: true },
    });
    vehicleId = vehicle.id;

    const trip = await prisma.vehicleTrip.create({
      data: {
        vehicleId,
        startTime: new Date('2026-10-01T10:00:00.000Z'),
        endTime: new Date('2026-10-01T11:00:00.000Z'),
        tripStatus: TripStatus.COMPLETED,
      },
      select: { id: true },
    });
    tripId = trip.id;

    // Migrate-deploy baseline may lag schema.prisma on tire setup columns; seed via SQL (no db push in PDB guard).
    tireSetupId = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO vehicle_tire_setups (id, vehicle_id, tire_season, updated_at)
      VALUES (
        ${tireSetupId}::text,
        ${vehicleId}::text,
        'ALL_SEASON'::"TireSeason",
        NOW()
      )
    `;

    const ledger = await prisma.tireTripUsageLedger.create({
      data: {
        organizationId,
        vehicleId,
        tripId,
        tireSetupId,
        tripStartedAt: new Date('2026-10-01T10:00:00.000Z'),
        tripEndedAt: new Date('2026-10-01T11:00:00.000Z'),
        distanceKm: 10,
        sourceVersion: 'test',
        sourceFingerprint: `fp-ledger-${randomUUID()}`,
        processedAt: new Date('2026-10-01T12:00:00.000Z'),
      },
      select: { id: true },
    });
    ledgerId = ledger.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('selects ledger when terminal exists but latest succeeded DS4 run is not materialized', async () => {
    const runOld = randomUUID();
    const runNew = randomUUID();
    await seedDs4Run(runOld, new Date('2026-10-01T09:00:00.000Z'));
    await seedDs4Run(runNew, new Date('2026-10-01T13:00:00.000Z'));
    await seedTerminalMarker('ds4_not_available');

    const candidates = await repository.findCatchupCandidates(TIRE_DS4_SHADOW_ADAPTER_VERSION, 20);
    expect(candidates.some((c) => c.tireTripUsageLedgerId === ledgerId)).toBe(true);
  });

  it('does not select ledger when latest succeeded run is already materialized', async () => {
    const runLatest = randomUUID();
    await seedDs4Run(runLatest, new Date('2026-10-02T10:00:00.000Z'));
    await prisma.tireDs4MotionShadowInputV1.create({
      data: {
        organizationId,
        vehicleId,
        tripId,
        tireSetupId,
        tireTripUsageLedgerId: ledgerId,
        diV0MotionCoreShadowRunId: runLatest,
        combinedInputIdentity: 'ci',
        pinnedSnapshotHash: 'pin',
        contentFingerprint: 'fp',
        shadowBundleVersion: 'bundle',
        speedAuthority: 'C4_ONLY',
        eventsAlgorithmVersion: 'ev',
        adapterVersion: TIRE_DS4_SHADOW_ADAPTER_VERSION,
        eventQualityCoverage: 'NONE',
        temporalCoverage: 'UNVERIFIED',
        ds4ReadStatus: 'SUCCEEDED_EMPTY',
        inputPayload: { schemaVersion: 2, neutral: true },
      },
    });

    const candidates = await repository.findCatchupCandidates(TIRE_DS4_SHADOW_ADAPTER_VERSION, 50);
    const forLedger = candidates.filter((c) => c.tireTripUsageLedgerId === ledgerId);
    expect(forLedger.every((c) => c.reason === 'newer_ds4_run')).toBe(true);
    expect(forLedger.length).toBe(0);
  });

  it('enforces ON DELETE RESTRICT from shadow rows to ledger', async () => {
    const shadowOnlyLedger = await prisma.tireTripUsageLedger.create({
      data: {
        organizationId,
        vehicleId,
        tripId,
        tireSetupId,
        tripStartedAt: new Date('2026-10-03T10:00:00.000Z'),
        tripEndedAt: new Date('2026-10-03T11:00:00.000Z'),
        distanceKm: 1,
        sourceVersion: 'test',
        sourceFingerprint: `fp-restrict-${randomUUID()}`,
        processedAt: new Date(),
      },
      select: { id: true },
    });

    await prisma.tireDs4MotionShadowInputV1.create({
      data: {
        organizationId,
        vehicleId,
        tripId,
        tireSetupId,
        tireTripUsageLedgerId: shadowOnlyLedger.id,
        diV0MotionCoreShadowRunId: randomUUID(),
        combinedInputIdentity: 'ci',
        pinnedSnapshotHash: 'pin',
        contentFingerprint: 'fp',
        shadowBundleVersion: 'bundle',
        speedAuthority: 'C4_ONLY',
        eventsAlgorithmVersion: 'ev',
        adapterVersion: TIRE_DS4_SHADOW_ADAPTER_VERSION,
        eventQualityCoverage: 'NONE',
        temporalCoverage: 'UNVERIFIED',
        ds4ReadStatus: 'SUCCEEDED_EMPTY',
        inputPayload: { schemaVersion: 2, neutral: true },
      },
    });

    await expect(prisma.tireTripUsageLedger.delete({ where: { id: shadowOnlyLedger.id } })).rejects.toThrow();
  });
});
