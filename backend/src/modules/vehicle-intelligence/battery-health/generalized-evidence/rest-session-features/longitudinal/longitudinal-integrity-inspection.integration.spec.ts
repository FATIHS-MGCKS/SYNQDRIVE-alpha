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
import {
  LongitudinalIntegrityInspectionRepository,
  getDbRoundTripCount,
  resetDbRoundTripCount,
} from './longitudinal-integrity-inspection.repository';
import { LongitudinalIntegrityInspectionService } from './longitudinal-integrity-inspection.service';

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
      resetDbRoundTripCount();
      const outcome = await service.inspectRevision({
        organizationId,
        vehicleId,
        revisionId: revision.id,
      });
      expect(outcome.status).toBe('OK');
      expect(getDbRoundTripCount()).toBeLessThanOrEqual(4);
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
  },
);
