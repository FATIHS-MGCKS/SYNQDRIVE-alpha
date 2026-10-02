import { randomUUID } from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { probePostgresDatabase } from '../../../provider-observability-gap/provider-observability-gap-postgres.fixture';
import { buildMinimalLongitudinalInputSummary } from './longitudinal-input.test-fixtures';
import {
  buildD4SessionKeysFromProjection,
  LongitudinalIntegrityInspectionRepository,
} from './longitudinal-integrity-inspection.repository';
import { D4_INSPECTION_PRISMA_ISOLATION } from './longitudinal-integrity-inspection.service';
import { evaluateMaterializedRevisionSelfIntegrity } from './longitudinal-integrity-inspection.self-integrity';
import {
  buildInspectionService,
  countBatteryV2Tables,
  createFeatureRow,
  createOrgVehicle,
  patchRevisionScientificJson,
  seedLongitudinalRevision,
} from './longitudinal-integrity-inspection.integration.helpers';
import { D4InspectionDbRoundTripBudget } from './longitudinal-integrity-inspection.db-round-trips';
import { LongitudinalProfileMaterializationRepository } from './longitudinal-profile-materialization.repository';
import { versionTuple } from './longitudinal-profile.test-fixtures';
import { deriveSemanticRevisionIntegrityFromAggregate } from '../rest-session-feature-shadow-inspection.integrity';

const LIVE = process.env.BATTERY_V2_LONGITUDINAL_INTEGRITY_INSPECTION_INTEGRATION === '1';

(LIVE ? describe : describe.skip)(
  'longitudinal integrity inspection PostgreSQL (M3.3D D4 PG-A–PG-Y)',
  () => {
    let prisma: PrismaClient;
    let materializationRepo: LongitudinalProfileMaterializationRepository;
    let inspectionRepo: LongitudinalIntegrityInspectionRepository;
    let dbOk = false;

    beforeAll(async () => {
      dbOk = await probePostgresDatabase();
      if (!dbOk) return;
      prisma = new PrismaClient();
      materializationRepo = new LongitudinalProfileMaterializationRepository(
        prisma as unknown as PrismaService,
      );
      inspectionRepo = new LongitudinalIntegrityInspectionRepository(
        prisma as unknown as PrismaService,
      );
    });

    afterAll(async () => {
      if (prisma) await prisma.$disconnect();
    });

    it('PG-A — tenant-scoped D3 revision lookup', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'PG-A');
      const seeded = await seedLongitudinalRevision(prisma, materializationRepo, organizationId, vehicleId, [
        { anchorAt: new Date('2026-04-01T10:00:00.000Z'), inclusionMode: 'DEFAULT' },
      ]);
      const found = await inspectionRepo.findRevisionForInspection({
        organizationId,
        vehicleId,
        revisionId: seeded.revision.id,
      });
      expect(found?.id).toBe(seeded.revision.id);
      expect(
        await inspectionRepo.findRevisionForInspection({
          organizationId: randomUUID(),
          vehicleId,
          revisionId: seeded.revision.id,
        }),
      ).toBeNull();
      expect(
        await inspectionRepo.findRevisionForInspection({
          organizationId,
          vehicleId: randomUUID(),
          revisionId: seeded.revision.id,
        }),
      ).toBeNull();
    });

    it('PG-B — valid full inspection with matching C3 source evidence', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'PG-B');
      const seeded = await seedLongitudinalRevision(prisma, materializationRepo, organizationId, vehicleId, [
        { anchorAt: new Date('2026-04-01T10:00:00.000Z'), inclusionMode: 'DEFAULT' },
      ]);
      const service = buildInspectionService(prisma);
      const outcome = await service.inspectRevision({
        organizationId,
        vehicleId,
        revisionId: seeded.revision.id,
      });
      expect(outcome.status).toBe('OK');
      if (outcome.status === 'OK') {
        expect(outcome.inspection.profile.overallStatus).toBe('OK');
        const session = outcome.inspection.perSession[0];
        expect(session.sourceEvidenceAvailability).toBe('FOUND');
        expect(session.sourceIdentity).toBe('PASS');
        expect(session.sourceFeatureScalarIntegrity).toBe('PASS');
        expect(session.sourceSnapshotContextIntegrity).toBe('PASS');
        expect(session.digestIntegrity).toBe('PASS');
        expect(session.integrityQualifiedDisposition).toBe('ELIGIBLE');
      }
      expect(service.getLastInspectionDbRoundTrips()).toBeLessThanOrEqual(4);
    });

    it('PG-C — missing referenced source → SOURCE_EVIDENCE_LIMITED not corruption', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'PG-C');
      const seeded = await seedLongitudinalRevision(prisma, materializationRepo, organizationId, vehicleId, [
        { anchorAt: new Date('2026-04-01T10:00:00.000Z'), inclusionMode: 'DEFAULT' },
      ]);
      const canonical = [...seeded.canonicalRows.values()][0];
      await prisma.batteryRestSessionFeature.delete({ where: { id: canonical.id } });
      const outcome = await buildInspectionService(prisma).inspectRevision({
        organizationId,
        vehicleId,
        revisionId: seeded.revision.id,
      });
      expect(outcome.status).toBe('OK');
      if (outcome.status === 'OK') {
        expect(outcome.inspection.profile.overallStatus).toBe('SOURCE_EVIDENCE_LIMITED');
        expect(outcome.inspection.profile.overallStatus).not.toBe('INTEGRITY_WARNING');
        const session = outcome.inspection.perSession[0];
        expect(session.reasons).toContain('SOURCE_ROW_MISSING');
        expect(session.integrityQualifiedDisposition).toBe('SOURCE_EVIDENCE_LIMITED');
      }
    });

    it('PG-D — canonical source outside latest K=100 still materialized and digest checked', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'PG-D');
      const extras = Array.from({ length: 104 }, (_, i) => i + 2);
      const seeded = await seedLongitudinalRevision(prisma, materializationRepo, organizationId, vehicleId, [
        {
          anchorAt: new Date('2026-04-01T10:00:00.000Z'),
          inclusionMode: 'DEFAULT',
          extraSemanticRevisions: extras,
        },
      ]);
      const canonical = [...seeded.canonicalRows.values()][0];
      expect(canonical.semanticRevision).toBe(1);

      const outcome = await buildInspectionService(prisma).inspectRevision({
        organizationId,
        vehicleId,
        revisionId: seeded.revision.id,
      });
      expect(outcome.status).toBe('OK');
      if (outcome.status === 'OK') {
        const session = outcome.inspection.perSession[0];
        expect(session.digestIntegrity).toBe('PASS');
        expect(session.digestVerificationScope).toBe('BOUNDED_LATEST_WINDOW');
        expect(session.reasons).toContain('DIGEST_COVERAGE_PARTIAL');
        expect(session.digestRowsChecked).toBeGreaterThanOrEqual(101);
      }
    });

    it('PG-E — >100 historical revisions → BOUNDED_LATEST_WINDOW; coverage alone does not quarantine DEFAULT', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'PG-E');
      const seeded = await seedLongitudinalRevision(prisma, materializationRepo, organizationId, vehicleId, [
        {
          anchorAt: new Date('2026-04-01T10:00:00.000Z'),
          inclusionMode: 'DEFAULT',
          extraSemanticRevisions: Array.from({ length: 104 }, (_, i) => i + 2),
        },
      ]);
      const outcome = await buildInspectionService(prisma).inspectRevision({
        organizationId,
        vehicleId,
        revisionId: seeded.revision.id,
      });
      expect(outcome.status).toBe('OK');
      if (outcome.status === 'OK') {
        expect(outcome.inspection.coverage.digestVerificationScope).toBe('BOUNDED_LATEST_WINDOW');
        expect(outcome.inspection.profile.overallStatus).toBe('INTEGRITY_PARTIAL');
        const session = outcome.inspection.perSession[0];
        expect(session.integrityQualifiedDisposition).toBe('ELIGIBLE');
        expect(session.reasons).toContain('DIGEST_COVERAGE_PARTIAL');
      }
    });

    it('PG-F — semantic revision gap → warning DEFAULT quarantine', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'PG-F');
      const seeded = await seedLongitudinalRevision(prisma, materializationRepo, organizationId, vehicleId, [
        {
          anchorAt: new Date('2026-04-01T10:00:00.000Z'),
          inclusionMode: 'DEFAULT',
          extraSemanticRevisions: [3],
        },
      ]);
      const outcome = await buildInspectionService(prisma).inspectRevision({
        organizationId,
        vehicleId,
        revisionId: seeded.revision.id,
      });
      expect(outcome.status).toBe('OK');
      if (outcome.status === 'OK') {
        expect(outcome.inspection.profile.overallStatus).toBe('INTEGRITY_WARNING');
        const session = outcome.inspection.perSession[0];
        expect(session.reasons).toContain('SEMANTIC_REVISION_GAP');
        expect(session.integrityQualifiedDisposition).toBe('QUARANTINED_INTEGRITY_WARNING');
      }
    });

    it('PG-G — semantic revision duplicate semantics → warning (document test fixture approach)', async () => {
      if (!dbOk) return;
      // Postgres unique index `battery_rest_session_feature_semantic_revision` prevents two rows
      // with the same semantic_revision per version tuple. Duplicate lineage is validated via the
      // pure aggregate fixture [1,2,2,3] in rest-session-feature-shadow-inspection.integrity.spec.ts.
      const duplicateFixture = deriveSemanticRevisionIntegrityFromAggregate({
        totalRows: 4,
        incrementalRows: 0,
        finalRows: 4,
        validRows: 4,
        invalidatedRows: 0,
        latestSemanticRevision: 3,
        positiveRevisionRowCount: 4,
        distinctPositiveRevisionCount: 3,
        minPositiveSemanticRevision: 1,
        maxPositiveSemanticRevision: 3,
        nonPositiveRevisionRowCount: 0,
      });
      expect(duplicateFixture.duplicateSemanticRevisionCount).toBeGreaterThan(0);

      const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'PG-G');
      const seeded = await seedLongitudinalRevision(prisma, materializationRepo, organizationId, vehicleId, [
        {
          anchorAt: new Date('2026-04-01T10:00:00.000Z'),
          inclusionMode: 'DEFAULT',
          extraSemanticRevisions: [2, 3],
        },
      ]);
      const outcome = await buildInspectionService(prisma).inspectRevision({
        organizationId,
        vehicleId,
        revisionId: seeded.revision.id,
      });
      expect(outcome.status).toBe('OK');
      if (outcome.status === 'OK') {
        const session = outcome.inspection.perSession[0];
        expect(session.revisionLineage).toBe('PASS');
        expect(session.reasons).not.toContain('SEMANTIC_REVISION_DUPLICATE');
      }
    });

    it('PG-H — parseable fingerprint mismatch → forensic overlay REVISION_SELF_INTEGRITY_FAILED zero eligible DEFAULT', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'PG-H');
      const seeded = await seedLongitudinalRevision(prisma, materializationRepo, organizationId, vehicleId, [
        { anchorAt: new Date('2026-04-01T10:00:00.000Z'), inclusionMode: 'DEFAULT' },
      ]);
      await prisma.batteryLongitudinalProfileRevision.update({
        where: { id: seeded.revision.id },
        data: { canonicalProfileFingerprint: 'f'.repeat(64) },
      });
      const outcome = await buildInspectionService(prisma).inspectRevision({
        organizationId,
        vehicleId,
        revisionId: seeded.revision.id,
      });
      expect(outcome.status).toBe('OK');
      if (outcome.status === 'OK') {
        expect(outcome.inspection.profile.overallStatus).toBe('REVISION_SELF_INTEGRITY_FAILED');
        expect(outcome.inspection.profile.integrityQualifiedDefaultCount).toBe(0);
        expect(outcome.inspection.perSession.length).toBeGreaterThan(0);
      }
    });

    it('PG-I — malformed scientific JSON → top-level REVISION_SELF_INTEGRITY_FAILED no source batch', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'PG-I');
      const seeded = await seedLongitudinalRevision(prisma, materializationRepo, organizationId, vehicleId, [
        { anchorAt: new Date('2026-04-01T10:00:00.000Z'), inclusionMode: 'DEFAULT' },
      ]);
      await prisma.batteryLongitudinalProfileRevision.update({
        where: { id: seeded.revision.id },
        data: { scientificProfileJson: { broken: true } as Prisma.InputJsonValue },
      });
      const service = buildInspectionService(prisma);
      const outcome = await service.inspectRevision({
        organizationId,
        vehicleId,
        revisionId: seeded.revision.id,
      });
      expect(outcome.status).toBe('REVISION_SELF_INTEGRITY_FAILED');
      expect(service.getLastInspectionDbRoundTrips()).toBeLessThanOrEqual(2);
    });

    it('PG-J — metadata mirror mismatch → parseable forensic self-failure', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'PG-J');
      const seeded = await seedLongitudinalRevision(prisma, materializationRepo, organizationId, vehicleId, [
        { anchorAt: new Date('2026-04-01T10:00:00.000Z'), inclusionMode: 'DEFAULT' },
      ]);
      await prisma.batteryLongitudinalProfileRevision.update({
        where: { id: seeded.revision.id },
        data: { includedSessionCount: 999 },
      });
      const outcome = await buildInspectionService(prisma).inspectRevision({
        organizationId,
        vehicleId,
        revisionId: seeded.revision.id,
      });
      expect(outcome.status).toBe('OK');
      if (outcome.status === 'OK') {
        expect(outcome.inspection.materializedRevision.selfIntegrity).toBe('SELF_INTEGRITY_FAILED');
        expect(outcome.inspection.profile.overallStatus).toBe('REVISION_SELF_INTEGRITY_FAILED');
        expect(outcome.inspection.materializedRevision.selfIntegrityReasons).toContain(
          'PROFILE_METADATA_MIRROR_MISMATCH',
        );
      }
    });

    it('PG-K — feature scalar mismatch → sourceFeatureScalarIntegrity FAIL INTEGRITY_WARNING DEFAULT quarantine', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'PG-K');
      const seeded = await seedLongitudinalRevision(prisma, materializationRepo, organizationId, vehicleId, [
        { anchorAt: new Date('2026-04-01T10:00:00.000Z'), inclusionMode: 'DEFAULT' },
      ]);
      const canonical = [...seeded.canonicalRows.values()][0];
      await prisma.batteryRestSessionFeature.update({
        where: { id: canonical.id },
        data: { minimumRestVoltageMv: 99999 },
      });
      const outcome = await buildInspectionService(prisma).inspectRevision({
        organizationId,
        vehicleId,
        revisionId: seeded.revision.id,
      });
      expect(outcome.status).toBe('OK');
      if (outcome.status === 'OK') {
        expect(outcome.inspection.profile.overallStatus).toBe('INTEGRITY_WARNING');
        const session = outcome.inspection.perSession[0];
        expect(session.sourceFeatureScalarIntegrity).toBe('FAIL');
        expect(session.reasons).toContain('SOURCE_CONTENT_MISMATCH');
        expect(session.integrityQualifiedDisposition).toBe('QUARANTINED_INTEGRITY_WARNING');
      }
    });

    it('PG-L — snapshot context mismatch → sourceSnapshotContextIntegrity FAIL', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'PG-L');
      const seeded = await seedLongitudinalRevision(prisma, materializationRepo, organizationId, vehicleId, [
        { anchorAt: new Date('2026-04-01T10:00:00.000Z'), inclusionMode: 'DEFAULT' },
      ]);
      const canonical = [...seeded.canonicalRows.values()][0];
      const badSummary = buildMinimalLongitudinalInputSummary({
        organizationId,
        vehicleId,
        restSessionId: canonical.restSessionId,
        contextCompleteness: ['NOT_A_REAL_REASON'],
      });
      await prisma.batteryRestSessionFeature.update({
        where: { id: canonical.id },
        data: { inputSummary: badSummary as Prisma.InputJsonValue },
      });
      const outcome = await buildInspectionService(prisma).inspectRevision({
        organizationId,
        vehicleId,
        revisionId: seeded.revision.id,
      });
      expect(outcome.status).toBe('OK');
      if (outcome.status === 'OK') {
        const session = outcome.inspection.perSession[0];
        expect(session.sourceSnapshotContextIntegrity).toBe('FAIL');
        expect(session.reasons).toContain('SOURCE_CONTENT_MISMATCH');
      }
    });

    it('PG-M — temporal provenance violation → SOURCE_TEMPORAL_ORDER_INVALID', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'PG-M');
      const seeded = await seedLongitudinalRevision(prisma, materializationRepo, organizationId, vehicleId, [
        {
          anchorAt: new Date('2026-04-01T10:00:00.000Z'),
          inclusionMode: 'DEFAULT',
          featureCreatedAt: new Date('2099-01-01T00:00:00.000Z'),
        },
      ]);
      const outcome = await buildInspectionService(prisma).inspectRevision({
        organizationId,
        vehicleId,
        revisionId: seeded.revision.id,
      });
      expect(outcome.status).toBe('OK');
      if (outcome.status === 'OK') {
        const session = outcome.inspection.perSession[0];
        expect(session.sourceTemporalProvenance).toBe('FAIL');
        expect(session.reasons).toContain('SOURCE_TEMPORAL_ORDER_INVALID');
      }
    });

    it('PG-N — unsupported but matching historical input contract → NOT SOURCE_VERSION_MISMATCH', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'PG-N');
      const unsupported = 'FUTURE_CONTRACT_V9';
      const seeded = await seedLongitudinalRevision(prisma, materializationRepo, organizationId, vehicleId, [
        {
          anchorAt: new Date('2026-04-01T10:00:00.000Z'),
          inclusionMode: 'DEFAULT',
          version: versionTuple({ inputContractVersion: unsupported }),
        },
      ]);
      const outcome = await buildInspectionService(prisma).inspectRevision({
        organizationId,
        vehicleId,
        revisionId: seeded.revision.id,
      });
      expect(outcome.status).toBe('OK');
      if (outcome.status === 'OK') {
        const session = outcome.inspection.perSession[0];
        expect(session.reasons).not.toContain('SOURCE_VERSION_MISMATCH');
        expect(session.reasons).toContain('UNSUPPORTED_SOURCE_INPUT_CONTRACT');
        expect(session.sourceFeatureScalarIntegrity).toBe('PASS');
        expect(session.sourceSnapshotContextIntegrity).toBe('NOT_EVALUATED');
        expect(session.integrityQualifiedDisposition).toBe('SOURCE_EVIDENCE_LIMITED');
      }
    });

    it('PG-O — mixed DEFAULT/PROVISIONAL/EXCLUDED with excluded canonical inspected NOT_APPLICABLE', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'PG-O');
      const seeded = await seedLongitudinalRevision(prisma, materializationRepo, organizationId, vehicleId, [
        { anchorAt: new Date('2026-04-01T10:00:00.000Z'), inclusionMode: 'DEFAULT' },
        { anchorAt: new Date('2026-04-02T10:00:00.000Z'), inclusionMode: 'PROVISIONAL' },
        {
          anchorAt: new Date('2026-04-03T10:00:00.000Z'),
          inclusionMode: 'EXCLUDED',
          exclusionReasons: ['SESSION_INVALIDATED'],
        },
      ]);
      const outcome = await buildInspectionService(prisma).inspectRevision({
        organizationId,
        vehicleId,
        revisionId: seeded.revision.id,
      });
      expect(outcome.status).toBe('OK');
      if (outcome.status === 'OK') {
        expect(outcome.inspection.perSession.length).toBe(3);
        const excluded = outcome.inspection.perSession.find((s) => s.profileSlice === 'EXCLUDED');
        expect(excluded?.sourceFeatureScalarIntegrity).toBe('NOT_APPLICABLE');
        expect(excluded?.sourceSnapshotContextIntegrity).toBe('NOT_APPLICABLE');
        expect(excluded?.integrityQualifiedDisposition).toBe('NOT_APPLICABLE');
        const provisional = outcome.inspection.perSession.find((s) => s.profileSlice === 'PROVISIONAL');
        expect(provisional?.integrityQualifiedDisposition).toBe('NOT_APPLICABLE');
      }
    });

    it('PG-P — multiple version triples one set-based batch (no runtime-current-version substitution)', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'PG-P');
      const altFm = 'fm-alt-v2';
      const seeded = await seedLongitudinalRevision(prisma, materializationRepo, organizationId, vehicleId, [
        { anchorAt: new Date('2026-04-01T10:00:00.000Z'), inclusionMode: 'DEFAULT' },
        {
          anchorAt: new Date('2026-04-02T10:00:00.000Z'),
          inclusionMode: 'DEFAULT',
          version: versionTuple({ featureModelVersion: altFm }),
        },
      ]);
      const self = evaluateMaterializedRevisionSelfIntegrity(seeded.revision);
      if (self.status === 'PARSE_FAILED') throw new Error(String(self.reasons));
      const { sessionKeys, referencedRowIds } = buildD4SessionKeysFromProjection({
        organizationId,
        vehicleId,
        observations: self.projection.observations,
        provisionalObservations: self.projection.provisionalObservations,
        excludedSessions: self.projection.excludedSessions,
      });
      expect(sessionKeys.length).toBe(2);
      const loaded = await inspectionRepo.loadInspectionBatch({
        request: { organizationId, vehicleId, revisionId: seeded.revision.id },
        sessionKeys,
        referencedRowIds,
      });
      expect(loaded).not.toBeNull();
      expect(loaded!.dbRoundTrips).toBeLessThanOrEqual(4);
      expect(loaded!.snapshot.aggregatesBySessionKey.size).toBe(2);
      const outcome = await buildInspectionService(prisma).inspectRevision({
        organizationId,
        vehicleId,
        revisionId: seeded.revision.id,
      });
      expect(outcome.status).toBe('OK');
      if (outcome.status === 'OK') {
        expect(outcome.inspection.profile.overallStatus).toBe('OK');
      }
    });

    it('PG-Q — DB statement count 1/10/100 sessions and version triple scaling <=4', async () => {
      if (!dbOk) return;
      for (const count of [1, 10, 100]) {
        const { organizationId, vehicleId } = await createOrgVehicle(prisma, `PG-Q-${count}`);
        const seeds = Array.from({ length: count }, (_, i) => ({
          anchorAt: new Date(Date.UTC(2026, 0, 1, 10, 0, 0) + i * 3600_000),
          inclusionMode: 'DEFAULT' as const,
        }));
        const seeded = await seedLongitudinalRevision(
          prisma,
          materializationRepo,
          organizationId,
          vehicleId,
          seeds,
        );
        const service = buildInspectionService(prisma);
        await service.inspectRevision({
          organizationId,
          vehicleId,
          revisionId: seeded.revision.id,
        });
        expect(service.getLastInspectionDbRoundTrips()).toBeLessThanOrEqual(4);
      }
    });

    it('PG-R — result bounds unique C3 ids <=10100, four-step instances <=10200, aggregates <=100', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'PG-R');
      const seeds = Array.from({ length: 25 }, (_, i) => ({
        anchorAt: new Date(`2026-05-${String(i + 1).padStart(2, '0')}T10:00:00.000Z`),
        inclusionMode: 'DEFAULT' as const,
      }));
      const seeded = await seedLongitudinalRevision(
        prisma,
        materializationRepo,
        organizationId,
        vehicleId,
        seeds,
      );
      const self = evaluateMaterializedRevisionSelfIntegrity(seeded.revision);
      if (self.status === 'PARSE_FAILED') throw new Error(String(self.reasons));
      const { sessionKeys, referencedRowIds } = buildD4SessionKeysFromProjection({
        organizationId,
        vehicleId,
        observations: self.projection.observations,
        provisionalObservations: self.projection.provisionalObservations,
        excludedSessions: self.projection.excludedSessions,
      });
      const loaded = await inspectionRepo.loadInspectionBatch({
        request: { organizationId, vehicleId, revisionId: seeded.revision.id },
        sessionKeys,
        referencedRowIds,
      });
      const snap = loaded!.snapshot;
      const uniqueIds = new Set<string>();
      for (const row of snap.sourceRowsById.values()) uniqueIds.add(row.id);
      for (const rows of snap.latestRowsBySessionKey.values()) {
        for (const row of rows) uniqueIds.add(row.id);
      }
      let fourStepInstances = snap.sourceRowsById.size;
      for (const rows of snap.latestRowsBySessionKey.values()) {
        fourStepInstances += rows.length;
      }
      fourStepInstances += snap.aggregatesBySessionKey.size;
      expect(uniqueIds.size).toBeLessThanOrEqual(10100);
      expect(fourStepInstances).toBeLessThanOrEqual(10200);
      expect(snap.aggregatesBySessionKey.size).toBeLessThanOrEqual(100);
    });

    it('PG-S — read-only non-effects D3/C3/BatteryAssessment/BatteryPublication unchanged', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'PG-S');
      const seeded = await seedLongitudinalRevision(prisma, materializationRepo, organizationId, vehicleId, [
        { anchorAt: new Date('2026-04-01T10:00:00.000Z'), inclusionMode: 'DEFAULT' },
      ]);
      const before = await countBatteryV2Tables(prisma, organizationId, vehicleId);
      await buildInspectionService(prisma).inspectRevision({
        organizationId,
        vehicleId,
        revisionId: seeded.revision.id,
      });
      const after = await countBatteryV2Tables(prisma, organizationId, vehicleId);
      expect(after).toEqual(before);
    });

    it('PG-T — RepeatableRead concurrency second connection inserts C3 during inspection consistent snapshot', async () => {
      expect(D4_INSPECTION_PRISMA_ISOLATION).toBe(Prisma.TransactionIsolationLevel.RepeatableRead);
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'PG-T');
      const seeded = await seedLongitudinalRevision(prisma, materializationRepo, organizationId, vehicleId, [
        { anchorAt: new Date('2026-04-01T10:00:00.000Z'), inclusionMode: 'DEFAULT' },
      ]);
      const session = seeded.sessions[0];
      const prisma2 = new PrismaClient();
      let aggregateTotalDuringTx: number | null = null;

      try {
        await prisma.$transaction(
          async (tx) => {
            const self = evaluateMaterializedRevisionSelfIntegrity(seeded.revision);
            if (self.status === 'PARSE_FAILED') throw new Error(String(self.reasons));
            const { sessionKeys, referencedRowIds } = buildD4SessionKeysFromProjection({
              organizationId,
              vehicleId,
              observations: self.projection.observations,
              provisionalObservations: self.projection.provisionalObservations,
              excludedSessions: self.projection.excludedSessions,
            });
            const budget = new D4InspectionDbRoundTripBudget();
            const batch = await inspectionRepo.readSourceEvidenceBatchInTransaction(
              tx as never,
              {
                request: { organizationId, vehicleId, revisionId: seeded.revision.id },
                sessionKeys,
                referencedRowIds,
              },
              budget,
            );
            aggregateTotalDuringTx =
              [...batch.totalRowsBySessionKey.values()].reduce((a, b) => a + b, 0) ?? 0;

            await createFeatureRow(prisma2, {
              organizationId,
              vehicleId,
              restSessionId: session.id,
              semanticRevision: 99,
            });

            const batchAfter = await inspectionRepo.readSourceEvidenceBatchInTransaction(
              tx as never,
              {
                request: { organizationId, vehicleId, revisionId: seeded.revision.id },
                sessionKeys,
                referencedRowIds,
              },
              new D4InspectionDbRoundTripBudget(),
            );
            const totalAfter =
              [...batchAfter.totalRowsBySessionKey.values()].reduce((a, b) => a + b, 0) ?? 0;
            expect(totalAfter).toBe(aggregateTotalDuringTx);
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
        );
      } finally {
        await prisma2.$disconnect();
      }
    });

    it('PG-U — zero-match aggregate totalRows=0 (actual SQL via loadInspectionBatch)', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'PG-U');
      const seeded = await seedLongitudinalRevision(prisma, materializationRepo, organizationId, vehicleId, [
        { anchorAt: new Date('2026-04-01T10:00:00.000Z'), inclusionMode: 'DEFAULT' },
      ]);
      const self = evaluateMaterializedRevisionSelfIntegrity(seeded.revision);
      if (self.status === 'PARSE_FAILED') throw new Error(String(self.reasons));
      const phantomSessionId = randomUUID();
      const loaded = await inspectionRepo.loadInspectionBatch({
        request: { organizationId, vehicleId, revisionId: seeded.revision.id },
        sessionKeys: [
          {
            organizationId,
            vehicleId,
            restSessionId: phantomSessionId,
            featureModelVersion: 'fm-v1',
            retentionPolicyVersion: 'ret-v1',
            chargeOpportunityPolicyVersion: 'chg-v1',
            canonicalFeatureRowId: null,
          },
        ],
        referencedRowIds: [],
      });
      const key = [...loaded!.snapshot.totalRowsBySessionKey.entries()][0];
      expect(key?.[1]).toBe(0);
    });

    it('PG-V — EXCLUDED canonical source truly inspected (identity/digest/temporal PASS)', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'PG-V');
      const seeded = await seedLongitudinalRevision(prisma, materializationRepo, organizationId, vehicleId, [
        {
          anchorAt: new Date('2026-04-01T10:00:00.000Z'),
          inclusionMode: 'EXCLUDED',
          exclusionReasons: ['SESSION_INVALIDATED'],
        },
      ]);
      const outcome = await buildInspectionService(prisma).inspectRevision({
        organizationId,
        vehicleId,
        revisionId: seeded.revision.id,
      });
      expect(outcome.status).toBe('OK');
      if (outcome.status === 'OK') {
        const session = outcome.inspection.perSession[0];
        expect(session.profileSlice).toBe('EXCLUDED');
        expect(session.sourceEvidenceAvailability).toBe('FOUND');
        expect(session.sourceIdentity).toBe('PASS');
        expect(session.digestIntegrity).toBe('PASS');
        expect(session.sourceTemporalProvenance).toBe('PASS');
      }
    });

    it('PG-W — two concurrent D4 inspections independent query counters', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'PG-W');
      const seeded = await seedLongitudinalRevision(prisma, materializationRepo, organizationId, vehicleId, [
        { anchorAt: new Date('2026-04-01T10:00:00.000Z'), inclusionMode: 'DEFAULT' },
      ]);
      const serviceA = buildInspectionService(prisma);
      const serviceB = buildInspectionService(prisma);
      const request = { organizationId, vehicleId, revisionId: seeded.revision.id };
      await Promise.all([serviceA.inspectRevision(request), serviceB.inspectRevision(request)]);
      expect(serviceA.getLastInspectionDbRoundTrips()).toBeLessThanOrEqual(4);
      expect(serviceB.getLastInspectionDbRoundTrips()).toBeLessThanOrEqual(4);
      expect(serviceA.getLastInspectionDbRoundTrips()).toBe(serviceB.getLastInspectionDbRoundTrips());
    });

    it('PG-X — raw stored JSON extra-field tamper detected self-integrity failure', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'PG-X');
      const seeded = await seedLongitudinalRevision(prisma, materializationRepo, organizationId, vehicleId, [
        { anchorAt: new Date('2026-04-01T10:00:00.000Z'), inclusionMode: 'DEFAULT' },
      ]);
      await patchRevisionScientificJson(prisma, seeded.revision.id, (json) => ({
        ...json,
        tamperField: 'injected',
      }));
      const outcome = await buildInspectionService(prisma).inspectRevision({
        organizationId,
        vehicleId,
        revisionId: seeded.revision.id,
      });
      expect(outcome.status).toBe('REVISION_SELF_INTEGRITY_FAILED');
    });

    it('PG-Y — matching V1 input contract malformed snapshot SOURCE_CONTENT_MISMATCH not SOURCE_VERSION_MISMATCH', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'PG-Y');
      const seeded = await seedLongitudinalRevision(prisma, materializationRepo, organizationId, vehicleId, [
        { anchorAt: new Date('2026-04-01T10:00:00.000Z'), inclusionMode: 'DEFAULT' },
      ]);
      const canonical = [...seeded.canonicalRows.values()][0];
      const malformed = buildMinimalLongitudinalInputSummary({
        organizationId,
        vehicleId,
        restSessionId: canonical.restSessionId,
        contextCompleteness: ['NOT_A_REAL_REASON'],
      });
      await prisma.batteryRestSessionFeature.update({
        where: { id: canonical.id },
        data: { inputSummary: malformed as Prisma.InputJsonValue },
      });
      const outcome = await buildInspectionService(prisma).inspectRevision({
        organizationId,
        vehicleId,
        revisionId: seeded.revision.id,
      });
      expect(outcome.status).toBe('OK');
      if (outcome.status === 'OK') {
        const session = outcome.inspection.perSession[0];
        expect(session.reasons).toContain('SOURCE_CONTENT_MISMATCH');
        expect(session.reasons).not.toContain('SOURCE_VERSION_MISMATCH');
        expect(session.sourceSnapshotContextIntegrity).toBe('FAIL');
      }
    });

  },
);
