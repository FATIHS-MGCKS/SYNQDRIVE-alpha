/**
 * EXP-021 — real PostgreSQL persistence proof for native temporal evidence and settlement join.
 */
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { parseAcquisitionState } from './reference-capture-session.repository';
import { computeNativeTemporalCadenceStats } from './reference-capture-hf-calibration-phase.policy';
import { reconstructNativeGapReportFromEvidence } from './reference-capture-exp021-native-gap-reconstruction';
import { joinNativeGapsWithSettlementObservations } from './reference-capture-exp021-native-settlement-join';
import { buildExp021BucketIdentity } from './reference-capture-settlement-shadow-bucket-identity';
import {
  compareValueSnapshots,
  hashBucketValueContent,
} from './reference-capture-settlement-shadow-value-snapshot';
import {
  activatePendingPhaseAtBoundary,
  buildNativeCountersForPhase,
  buildReferenceCapturePostgresDatabaseUrl,
  cleanupReferenceCaptureSeed,
  createRepository,
  defaultV2Policy,
  persistCountersViaCanonicalCycleRelease,
  proveIsolatedReferenceCapturePostgres,
  probeReferenceCapturePostgresDatabase,
  reloadSessionFromPostgres,
  seedPreRollCalibrationSeries,
  seedRecordingSession,
  seedSettlementShadowObservation,
} from './testing/reference-capture-postgres.integration.harness';

const LIVE = process.env.REFERENCE_CAPTURE_POSTGRES_INTEGRATION === '1';
const FIELD = 'speed';

(LIVE ? describe : describe.skip)(
  'EXP-021 native temporal evidence PostgreSQL integration',
  () => {
    let prisma: PrismaClient;
    let repo: ReturnType<typeof createRepository>;
    const hfPolicy = defaultV2Policy();
    const t0Ms = Date.parse('2026-09-10T19:41:19.000Z');
    const T0 = new Date(t0Ms).toISOString();
    const T1 = new Date(t0Ms + 1000).toISOString();
    const T2 = new Date(t0Ms + 2000).toISOString();
    const T3 = new Date(t0Ms + 3000).toISOString();
    const T4 = new Date(t0Ms + 4000).toISOString();
    const T10 = new Date(t0Ms + 10_000).toISOString();
    const T11 = new Date(t0Ms + 11_000).toISOString();

    beforeAll(async () => {
      process.env.DATABASE_URL =
        process.env.DATABASE_URL ?? buildReferenceCapturePostgresDatabaseUrl();
      proveIsolatedReferenceCapturePostgres();
      const ok = await probeReferenceCapturePostgresDatabase();
      if (!ok) {
        throw new Error(
          'REFERENCE_CAPTURE_POSTGRES_INTEGRATION=1 requires isolated Postgres with reference_capture tables',
        );
      }
      prisma = new PrismaClient();
      repo = createRepository(prisma);
    }, 120_000);

    afterAll(async () => {
      await prisma?.$disconnect().catch(() => undefined);
    });

    async function activatePhysicalPhase60(seed: Awaited<ReturnType<typeof seedRecordingSession>>) {
      await seedPreRollCalibrationSeries(prisma, seed, t0Ms - 35 * 60_000);
      await repo.persistExp021CanonicalT0Atomic({
        organizationId: seed.organizationId,
        sessionId: seed.sessionId,
        firstQualifyingMovementAt: new Date(t0Ms),
        startConfirmedAt: new Date(t0Ms + 1000),
        nowMs: t0Ms + 1000,
      });
      const activated = await repo.activatePhysicalPhaseAtT0Atomic({
        organizationId: seed.organizationId,
        sessionId: seed.sessionId,
        vehicleId: seed.vehicleId,
        tokenId: seed.tokenId,
        effectivePollIntervalMs: 60_000,
        hfPolicy,
        nowMs: t0Ms + 2000,
      });
      expect(activated?.activePhase.phaseProvenance).toBe('PHYSICAL_T0');
      return activated!;
    }

    it('REAL_PG_NATIVE_TEMPORAL_EVIDENCE: survives PostgreSQL reload and gap reconstruction', async () => {
      const suffix = randomUUID().slice(0, 8);
      const seed = await seedRecordingSession(prisma, suffix, { tokenId: 187_361 });
      try {
        const activated = await activatePhysicalPhase60(seed);
        const phaseId = activated.activePhase.calibrationPhaseId;
        const counters = buildNativeCountersForPhase(phaseId, [T4, T1, T0, T1]);
        await persistCountersViaCanonicalCycleRelease(
          repo,
          seed,
          counters,
          hfPolicy,
          t0Ms + 5000,
        );

        const finalized = await repo.finalizeTerminalCalibrationAtomic(
          seed.organizationId,
          seed.sessionId,
          { terminalAtMs: t0Ms + 600_000, reason: 'STOP' },
        );
        expect(finalized).not.toBeNull();

        await prisma.$disconnect();
        const reloaded = await reloadSessionFromPostgres(seed.organizationId, seed.sessionId);
        try {
          const state = parseAcquisitionState(reloaded.session.acquisitionStateJson);
          const summary = state.hfCalibrationSeries?.completedPhaseSummaries[0];
          expect(summary?.nativeTemporalEvidence).toBeDefined();
          const evidence = summary!.nativeTemporalEvidence!;
          expect(evidence.orderedNativeTemporalBucketStarts).toEqual([T0, T1, T4]);
          expect(evidence.phaseProvenance).toBe('PHYSICAL_T0');
          expect(evidence.canonicalT0At).toBe(T0);
          expect(evidence.calibrationSeriesId).toBeTruthy();
          expect(evidence.calibrationPhaseId).toBe(phaseId);
          expect(evidence.duplicateSemantics).toContain('UNIQUE_BY_CANONICAL_ISO_MS');
          expect(evidence.providerIdentity).toBe('DIMO_HF_AGGREGATE_BUCKET');

          const report = reconstructNativeGapReportFromEvidence(evidence, 1);
          const aggregate = computeNativeTemporalCadenceStats(
            evidence.orderedNativeTemporalBucketStarts,
          );
          expect(report.nativeBucketCount).toBe(3);
          expect(report.medianNativeDtMs).toBe(aggregate.nativeMedianTemporalCadenceMs);
          expect(report.maxNativeDtMs).toBe(aggregate.nativeMaxTemporalGapMs);
          expect(report.gaps.some((g) => g.gapDurationMs === 3000)).toBe(true);
        } finally {
          await reloaded.prisma.$disconnect().catch(() => undefined);
        }
        prisma = new PrismaClient();
        repo = createRepository(prisma);
      } finally {
        await cleanupReferenceCaptureSeed(prisma, seed);
      }
    });

    it('REAL_PG_PHASE_60_TO_30: phase evidence isolated across transition and reload', async () => {
      const suffix = randomUUID().slice(0, 8);
      const seed = await seedRecordingSession(prisma, suffix, { tokenId: 187_361 });
      try {
        const activated = await activatePhysicalPhase60(seed);
        const phase60Id = activated.activePhase.calibrationPhaseId;
        await persistCountersViaCanonicalCycleRelease(
          repo,
          seed,
          buildNativeCountersForPhase(phase60Id, [T0, T1, T4]),
          hfPolicy,
          t0Ms + 5000,
        );

        await repo.requestHfCalibrationPhaseAtomic({
          organizationId: seed.organizationId,
          sessionId: seed.sessionId,
          vehicleId: seed.vehicleId,
          tokenId: seed.tokenId,
          effectivePollIntervalMs: 30_000,
          nowMs: t0Ms + 600_000,
          phaseProvenance: 'PHYSICAL_TRANSITION',
        });
        await activatePendingPhaseAtBoundary(
          repo,
          seed.organizationId,
          seed.sessionId,
          hfPolicy,
          t0Ms + 600_000,
        );

        const afterTransition = await repo.findById(seed.organizationId, seed.sessionId);
        const transitionState = parseAcquisitionState(afterTransition?.acquisitionStateJson);
        const phase30Id = transitionState.hfCalibrationSeries?.activePhase?.calibrationPhaseId;
        expect(phase30Id).toBeTruthy();
        expect(transitionState.hfCalibrationSeries?.completedPhaseSummaries).toHaveLength(1);

        await persistCountersViaCanonicalCycleRelease(
          repo,
          seed,
          buildNativeCountersForPhase(phase30Id!, [T10, T11]),
          hfPolicy,
          t0Ms + 610_000,
        );
        await repo.finalizeTerminalCalibrationAtomic(seed.organizationId, seed.sessionId, {
          terminalAtMs: t0Ms + 900_000,
          reason: 'STOP',
        });

        await prisma.$disconnect();
        const reloaded = await reloadSessionFromPostgres(seed.organizationId, seed.sessionId);
        try {
          const state = parseAcquisitionState(reloaded.session.acquisitionStateJson);
          const summaries = state.hfCalibrationSeries?.completedPhaseSummaries ?? [];
          expect(summaries).toHaveLength(2);

          const phase60 = summaries.find((s) => s.effectivePollIntervalMs === 60_000);
          const phase30 = summaries.find((s) => s.effectivePollIntervalMs === 30_000);
          expect(phase60?.nativeTemporalEvidence?.phaseProvenance).toBe('PHYSICAL_T0');
          expect(phase30?.nativeTemporalEvidence?.phaseProvenance).toBe('PHYSICAL_TRANSITION');
          expect(phase60?.nativeTemporalEvidence?.orderedNativeTemporalBucketStarts).toEqual([
            T0,
            T1,
            T4,
          ]);
          expect(phase30?.nativeTemporalEvidence?.orderedNativeTemporalBucketStarts).toEqual([
            T10,
            T11,
          ]);
          expect(phase60?.nativeTemporalEvidence?.calibrationPhaseId).not.toBe(
            phase30?.nativeTemporalEvidence?.calibrationPhaseId,
          );

          const preRollOnly = summaries.filter((s) => s.nativeTemporalEvidence?.phaseProvenance === 'PRE_ROLL');
          expect(preRollOnly).toHaveLength(0);
        } finally {
          await reloaded.prisma.$disconnect().catch(() => undefined);
        }
        prisma = new PrismaClient();
        repo = createRepository(prisma);
      } finally {
        await cleanupReferenceCaptureSeed(prisma, seed);
      }
    });

    it('REAL_PG_SETTLEMENT_JOIN: bucketValueSnapshots survive reload and join native gaps', async () => {
      const suffix = randomUUID().slice(0, 8);
      const seed = await seedRecordingSession(prisma, suffix, { tokenId: 187_361 });
      try {
        const activated = await activatePhysicalPhase60(seed);
        const phaseId = activated.activePhase.calibrationPhaseId;
        await persistCountersViaCanonicalCycleRelease(
          repo,
          seed,
          buildNativeCountersForPhase(phaseId, [T0, T1, T4]),
          hfPolicy,
          t0Ms + 5000,
        );
        await repo.finalizeTerminalCalibrationAtomic(seed.organizationId, seed.sessionId, {
          terminalAtMs: t0Ms + 600_000,
          reason: 'STOP',
        });

        const bucketSnapshots = {
          [buildExp021BucketIdentity(FIELD, T0)]: '10',
          [buildExp021BucketIdentity(FIELD, T1)]: '11',
          [buildExp021BucketIdentity(FIELD, T2)]: '12',
          [buildExp021BucketIdentity(FIELD, T3)]: '13',
          [buildExp021BucketIdentity(FIELD, T4)]: '14',
        };
        const valueContentHash = hashBucketValueContent(bucketSnapshots);
        await seedSettlementShadowObservation({
          prisma,
          seed,
          experimentId: `exp-pg-${suffix}`,
          probeId: 'SP-60-A',
          scheduledAgeMs: 30_000,
          sourceIntervalStart: new Date(t0Ms),
          sourceIntervalEnd: new Date(t0Ms + 60_000),
          observationJson: {
            uniqueBucketIdentities: Object.keys(bucketSnapshots),
            bucketValueSnapshots: bucketSnapshots,
            valueContentHash,
            valueRevisedBucketIdentities: [],
          },
        });

        await prisma.$disconnect();
        const reloaded = await reloadSessionFromPostgres(seed.organizationId, seed.sessionId);
        try {
          const reloadedPrisma = reloaded.prisma;
          const state = parseAcquisitionState(reloaded.session.acquisitionStateJson);
          const evidence = state.hfCalibrationSeries?.completedPhaseSummaries[0]?.nativeTemporalEvidence;
          expect(evidence).toBeDefined();

          const observations = await reloadedPrisma.referenceCaptureSettlementShadowObservation.findMany({
            where: { sessionId: seed.sessionId },
          });
          expect(observations).toHaveLength(1);
          const json = observations[0].observationJson as {
            bucketValueSnapshots?: Record<string, string>;
            valueContentHash?: string;
          };
          expect(json.bucketValueSnapshots).toEqual(bucketSnapshots);
          expect(json.valueContentHash).toBe(valueContentHash);
          expect(hashBucketValueContent(json.bucketValueSnapshots ?? {})).toBe(valueContentHash);

          const join = joinNativeGapsWithSettlementObservations({
            phaseLabel: '60s',
            phaseProvenance: evidence!.phaseProvenance,
            orderedNativeTemporalBucketStarts: evidence!.orderedNativeTemporalBucketStarts,
            primaryField: FIELD,
            observations: [
              {
                scheduledAgeMs: 30_000,
                providerRequestStatus: 'SUCCESS',
                rawRowCount: 5,
                uniqueBucketIdentities: Object.keys(bucketSnapshots),
                bucketValueSnapshots: json.bucketValueSnapshots,
                valueContentHash: json.valueContentHash,
              },
            ],
            minGapMs: 1,
          });
          const gapRow = join.gapJoinRows.find((r) => r.gap.gapDurationMs === 3000);
          expect(gapRow).toBeDefined();
          expect(
            gapRow!.interiorBuckets.find((b) => b.temporalIso === T2)?.classification,
          ).toBe('SETTLEMENT_PRESENT_NATIVE_ABSENT');

          const metadataOnly = compareValueSnapshots(bucketSnapshots, bucketSnapshots);
          expect(metadataOnly.revisionCount).toBe(0);
          const revised = compareValueSnapshots(
            { ...bucketSnapshots, [buildExp021BucketIdentity(FIELD, T1)]: '99' },
            bucketSnapshots,
          );
          expect(revised.revisionCount).toBe(1);
        } finally {
          await reloaded.prisma.$disconnect().catch(() => undefined);
        }
        prisma = new PrismaClient();
        repo = createRepository(prisma);
      } finally {
        await cleanupReferenceCaptureSeed(prisma, seed);
      }
    });
  },
);
