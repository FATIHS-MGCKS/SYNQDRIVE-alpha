import { randomUUID } from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { probePostgresDatabase } from '../../../provider-observability-gap/provider-observability-gap-postgres.fixture';
import { assembleLongitudinalProfileV1 } from './longitudinal-profile.assembler';
import { computeLongitudinalScientificProfileFingerprintV1 } from './longitudinal-profile-fingerprint';
import { buildLongitudinalProfileMaterializationPersistenceInput } from './longitudinal-profile-materialization.mapper';
import { LongitudinalProfileMaterializationRepository } from './longitudinal-profile-materialization.repository';
import {
  buildProfileTestInventory,
  buildProfileTestInventoryItem,
  PROFILE_TEST_GENERATED_AT,
} from './longitudinal-profile.test-fixtures';
import { REST_SESSION_LONGITUDINAL_INTEGRITY_INSPECTION_CONTRACT_VERSION } from './longitudinal-integrity-inspection.constants';
import { getLastD4InspectionDbRoundTripCount } from './longitudinal-integrity-inspection.db-round-trips';
import {
  LongitudinalIntegrityInspectionRepository,
  buildD4SessionKeysFromProjection,
  getDbRoundTripCount,
} from './longitudinal-integrity-inspection.repository';
import {
  D4_INSPECTION_PRISMA_ISOLATION,
  LongitudinalIntegrityInspectionService,
} from './longitudinal-integrity-inspection.service';
import { evaluateMaterializedRevisionSelfIntegrity } from './longitudinal-integrity-inspection.self-integrity';
import { parseLongitudinalScientificProfileProjectionV1 } from './longitudinal-scientific-profile.parser';

const LIVE = process.env.BATTERY_V2_LONGITUDINAL_INTEGRITY_INSPECTION_INTEGRATION === '1';

(LIVE ? describe : describe.skip)(
  'longitudinal integrity inspection PostgreSQL (M3.3D D4)',
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

    async function createOrgVehicle(label: string) {
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const org = await prisma.organization.create({
        data: {
          companyName: `D4 ${label} ${suffix}`,
          businessType: 'FLEET',
          status: 'ACTIVE',
        },
      });
      const vehicleId = randomUUID();
      const vin = `VIN${suffix}`.slice(0, 17).padEnd(17, '0');
      await prisma.$executeRaw`
        INSERT INTO vehicles (
          id, organization_id, vin, make, model, year, fuel_type, hardware_type, status,
          license_plate, created_at, updated_at
        ) VALUES (
          ${vehicleId}::uuid,
          ${org.id}::uuid,
          ${vin},
          'Test',
          'ICE',
          2024,
          'GASOLINE'::"FuelType",
          'LTE_R1'::"HardwareType",
          'AVAILABLE'::"VehicleStatus",
          ${`D4-${suffix}`.slice(0, 32)},
          NOW(),
          NOW()
        )
      `;
      return { organizationId: org.id, vehicleId };
    }

    async function insertRevision(organizationId: string, vehicleId: string) {
      const inventory = buildProfileTestInventory([
        buildProfileTestInventoryItem({
          restSessionId: 's1',
          anchorAt: '2026-04-01T10:00:00.000Z',
          inclusionMode: 'DEFAULT',
        }),
      ]);
      inventory.organizationId = organizationId;
      inventory.vehicleId = vehicleId;
      inventory.sessions.forEach((s) => {
        s.organizationId = organizationId;
        s.vehicleId = vehicleId;
      });
      const assembled = assembleLongitudinalProfileV1({
        inventory,
        profileGeneratedAt: PROFILE_TEST_GENERATED_AT,
      });
      if (assembled.status !== 'OK') throw new Error(assembled.reason);
      const fingerprint = computeLongitudinalScientificProfileFingerprintV1(assembled.profile);
      const input = buildLongitudinalProfileMaterializationPersistenceInput(fingerprint);
      const outcome = await materializationRepo.insertIdempotent(input);
      return outcome.revision;
    }

    it('PG-A — tenant-scoped revision lookup', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle('LOOKUP');
      const revision = await insertRevision(organizationId, vehicleId);
      const found = await inspectionRepo.findRevisionForInspection({
        organizationId,
        vehicleId,
        revisionId: revision.id,
      });
      expect(found?.id).toBe(revision.id);
      const wrongOrg = await inspectionRepo.findRevisionForInspection({
        organizationId: randomUUID(),
        vehicleId,
        revisionId: revision.id,
      });
      expect(wrongOrg).toBeNull();
    });

    it('PG-B — OK inspection path stays within DB round trip bound', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle('OK');
      const revision = await insertRevision(organizationId, vehicleId);
      const service = new LongitudinalIntegrityInspectionService(
        prisma as unknown as PrismaService,
        { nowIso: () => '2026-09-24T12:00:00.000Z' },
      );
      const outcome = await service.inspectRevision({
        organizationId,
        vehicleId,
        revisionId: revision.id,
      });
      expect(outcome.status).toBe('OK');
      expect(getLastD4InspectionDbRoundTripCount()).toBeLessThanOrEqual(4);
    });

    it('PG-C — malformed scientific JSON returns self-integrity failure', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle('MALFORMED');
      const revision = await insertRevision(organizationId, vehicleId);
      await prisma.$executeRaw`
        UPDATE battery_longitudinal_profile_revisions
        SET scientific_profile_json = ${({ broken: true }) as Prisma.InputJsonValue}
        WHERE id = ${revision.id}::uuid
      `;
      const service = new LongitudinalIntegrityInspectionService(
        prisma as unknown as PrismaService,
        { nowIso: () => '2026-09-24T12:00:00.000Z' },
      );
      const outcome = await service.inspectRevision({
        organizationId,
        vehicleId,
        revisionId: revision.id,
      });
      expect(outcome.status).toBe('REVISION_SELF_INTEGRITY_FAILED');
    });

    it('PG-D — REVISION_NOT_FOUND when vehicle tenant key mismatches', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle('NOTFOUND');
      const revision = await insertRevision(organizationId, vehicleId);
      const service = new LongitudinalIntegrityInspectionService(
        prisma as unknown as PrismaService,
        { nowIso: () => '2026-09-24T12:00:00.000Z' },
      );
      const outcome = await service.inspectRevision({
        organizationId,
        vehicleId: randomUUID(),
        revisionId: revision.id,
      });
      expect(outcome).toEqual({ status: 'REVISION_NOT_FOUND' });
    });

    it('PG-E — loadInspectionBatch returns revision and bounded source snapshot', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle('BATCH');
      const revision = await insertRevision(organizationId, vehicleId);
      const self = evaluateMaterializedRevisionSelfIntegrity(revision);
      if (self.status === 'PARSE_FAILED') throw new Error(String(self.reasons));
      const projection = self.projection;
      const { sessionKeys, referencedRowIds } = buildD4SessionKeysFromProjection({
        organizationId: projection.organizationId,
        vehicleId: projection.vehicleId,
        observations: projection.observations,
        provisionalObservations: projection.provisionalObservations,
        excludedSessions: projection.excludedSessions,
      });
      const batch = await inspectionRepo.loadInspectionBatch({
        request: { organizationId, vehicleId, revisionId: revision.id },
        sessionKeys,
        referencedRowIds,
      });
      expect(batch?.revision.id).toBe(revision.id);
      expect(batch?.sourceRowsById.size).toBe(0);
      expect(getDbRoundTripCount()).toBeLessThanOrEqual(4);
    });

    it('PG-F — fingerprint mismatch returns forensic OK overlay', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle('FP-MISMATCH');
      const revision = await insertRevision(organizationId, vehicleId);
      await prisma.$executeRaw`
        UPDATE battery_longitudinal_profile_revisions
        SET canonical_profile_fingerprint = ${'f'.repeat(64)}
        WHERE id = ${revision.id}::uuid
      `;
      const service = new LongitudinalIntegrityInspectionService(
        prisma as unknown as PrismaService,
        { nowIso: () => '2026-09-24T12:00:00.000Z' },
      );
      const outcome = await service.inspectRevision({
        organizationId,
        vehicleId,
        revisionId: revision.id,
      });
      expect(outcome.status).toBe('OK');
      if (outcome.status === 'OK') {
        expect(outcome.inspection.profile.overallStatus).toBe('REVISION_SELF_INTEGRITY_FAILED');
        expect(outcome.inspection.profile.integrityQualifiedDefaultCount).toBe(0);
      }
    });

    it('PG-G — metadata mirror drift fails self integrity at parse gate', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle('MIRROR');
      const revision = await insertRevision(organizationId, vehicleId);
      await prisma.$executeRaw`
        UPDATE battery_longitudinal_profile_revisions
        SET included_session_count = 999
        WHERE id = ${revision.id}::uuid
      `;
      const refreshed = await inspectionRepo.findRevisionForInspection({
        organizationId,
        vehicleId,
        revisionId: revision.id,
      });
      const self = evaluateMaterializedRevisionSelfIntegrity(refreshed!);
      expect(self.status).toBe('SELF_INTEGRITY_FAILED');
    });

    it('PG-H — service uses RepeatableRead isolation', () => {
      expect(D4_INSPECTION_PRISMA_ISOLATION).toBe('RepeatableRead');
    });

    it('PG-I — tenant isolation on findRevisionForInspection vehicle scope', async () => {
      if (!dbOk) return;
      const a = await createOrgVehicle('ISO-A');
      const b = await createOrgVehicle('ISO-B');
      const revision = await insertRevision(a.organizationId, a.vehicleId);
      const cross = await inspectionRepo.findRevisionForInspection({
        organizationId: b.organizationId,
        vehicleId: b.vehicleId,
        revisionId: revision.id,
      });
      expect(cross).toBeNull();
    });

    it('PG-J — loadInspectionBatch null when revision id unknown', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle('MISSING-REV');
      const batch = await inspectionRepo.loadInspectionBatch({
        request: { organizationId, vehicleId, revisionId: randomUUID() },
        sessionKeys: [],
        referencedRowIds: [],
      });
      expect(batch).toBeNull();
    });

    it('PG-K — perSession cardinality equals candidateRestSessionCount', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle('CARDINALITY');
      const revision = await insertRevision(organizationId, vehicleId);
      const service = new LongitudinalIntegrityInspectionService(
        prisma as unknown as PrismaService,
        { nowIso: () => '2026-09-24T12:00:00.000Z' },
      );
      const outcome = await service.inspectRevision({
        organizationId,
        vehicleId,
        revisionId: revision.id,
      });
      expect(outcome.status).toBe('OK');
      if (outcome.status === 'OK') {
        expect(outcome.inspection.perSession.length).toBe(
          outcome.inspection.coverage.candidateRestSessionCount,
        );
      }
    });

    it('PG-L — inspection is read-only (revision row count unchanged)', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle('READONLY');
      const revision = await insertRevision(organizationId, vehicleId);
      const before = await prisma.batteryLongitudinalProfileRevision.count({
        where: { organizationId, vehicleId },
      });
      const service = new LongitudinalIntegrityInspectionService(
        prisma as unknown as PrismaService,
        { nowIso: () => '2026-09-24T12:00:00.000Z' },
      );
      await service.inspectRevision({ organizationId, vehicleId, revisionId: revision.id });
      const after = await prisma.batteryLongitudinalProfileRevision.count({
        where: { organizationId, vehicleId },
      });
      expect(after).toBe(before);
    });

    it('PG-M — inspection contract version on OK outcome', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle('CONTRACT');
      const revision = await insertRevision(organizationId, vehicleId);
      const service = new LongitudinalIntegrityInspectionService(
        prisma as unknown as PrismaService,
        { nowIso: () => '2026-09-24T12:00:00.000Z' },
      );
      const outcome = await service.inspectRevision({
        organizationId,
        vehicleId,
        revisionId: revision.id,
      });
      expect(outcome.status).toBe('OK');
      if (outcome.status === 'OK') {
        expect(outcome.inspection.inspectionContractVersion).toBe(
          REST_SESSION_LONGITUDINAL_INTEGRITY_INSPECTION_CONTRACT_VERSION,
        );
      }
    });

    it('PG-N — stored scientific JSON passes strict parser equivalence', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle('JSON-EQ');
      const revision = await insertRevision(organizationId, vehicleId);
      const parsed = parseLongitudinalScientificProfileProjectionV1(revision.scientificProfileJson);
      expect(parsed.status).toBe('OK');
      if (parsed.status === 'OK') {
        expect(parsed.projection.coverage.includedSessionCount).toBe(revision.includedSessionCount);
      }
    });
  },
);
