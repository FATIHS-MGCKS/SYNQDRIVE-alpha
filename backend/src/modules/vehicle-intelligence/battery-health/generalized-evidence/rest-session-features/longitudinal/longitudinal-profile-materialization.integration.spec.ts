import { randomUUID } from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { probePostgresDatabase } from '../../../provider-observability-gap/provider-observability-gap-postgres.fixture';
import { canonicalFeatureInputUtf8 } from '../feature-input-canonical.serializer';
import { assembleLongitudinalProfileV1 } from './longitudinal-profile.assembler';
import { computeLongitudinalScientificProfileFingerprintV1 } from './longitudinal-profile-fingerprint';
import {
  ProfileFingerprintCollisionOrCanonicalizationDriftError,
  ProfileMaterializedMetadataDriftError,
} from './longitudinal-profile-materialization.errors';
import { buildLongitudinalProfileMaterializationPersistenceInput } from './longitudinal-profile-materialization.mapper';
import { revisionMetadataMirrorsPersistenceInput } from './longitudinal-profile-materialization.metadata-mirror';
import { LongitudinalProfileMaterializationRepository } from './longitudinal-profile-materialization.repository';
import {
  buildProfileTestInventory,
  buildProfileTestInventoryItem,
  PROFILE_TEST_GENERATED_AT,
} from './longitudinal-profile.test-fixtures';

const LIVE = process.env.BATTERY_V2_LONGITUDINAL_PROFILE_MATERIALIZATION_INTEGRATION === '1';

function buildPersistencePair(
  organizationId: string,
  vehicleId: string,
  profileGeneratedAt = PROFILE_TEST_GENERATED_AT,
) {
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
    profileGeneratedAt,
  });
  if (assembled.status !== 'OK') throw new Error(assembled.reason);
  const fingerprint = computeLongitudinalScientificProfileFingerprintV1(assembled.profile);
  const input = buildLongitudinalProfileMaterializationPersistenceInput(fingerprint);
  return { projection: fingerprint.scientificProjection, fingerprint, input };
}

async function rawInsertRevision(
  prisma: PrismaClient,
  organizationId: string,
  vehicleId: string,
  input: ReturnType<typeof buildLongitudinalProfileMaterializationPersistenceInput>,
  fingerprint: string,
) {
  return prisma.$executeRaw`
    INSERT INTO battery_longitudinal_profile_revisions (
      id, organization_id, vehicle_id,
      longitudinal_profile_contract_version, profile_policy_version,
      canonical_profile_fingerprint, scientific_profile_json,
      requested_session_limit, applied_session_limit,
      candidate_rest_session_count, included_session_count,
      provisional_session_count, excluded_session_count,
      profile_status
    ) VALUES (
      ${randomUUID()},
      ${organizationId},
      ${vehicleId},
      ${input.longitudinalProfileContractVersion},
      ${input.profilePolicyVersion},
      ${fingerprint},
      ${input.scientificProfileJson as Prisma.InputJsonValue},
      ${input.requestedSessionLimit},
      ${input.appliedSessionLimit},
      ${input.candidateRestSessionCount},
      ${input.includedSessionCount},
      ${input.provisionalSessionCount},
      ${input.excludedSessionCount},
      ${input.profileStatus}
    )
  `;
}

async function createOrgVehicle(prisma: PrismaClient, label: string) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const org = await prisma.organization.create({
    data: {
      companyName: `D3 ${label} ${suffix}`,
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
      ${`D3-${suffix}`.slice(0, 32)},
      NOW(),
      NOW()
    )
  `;
  return { organizationId: org.id, vehicleId };
}

(LIVE ? describe : describe.skip)(
  'longitudinal-profile materialization PostgreSQL (M3.3D D3)',
  () => {
    let prisma: PrismaClient;
    let repo: LongitudinalProfileMaterializationRepository;
    let dbOk = false;

    beforeAll(async () => {
      dbOk = await probePostgresDatabase();
      if (!dbOk) return;
      prisma = new PrismaClient();
      repo = new LongitudinalProfileMaterializationRepository(
        prisma as unknown as PrismaService,
      );
    });

    afterAll(async () => {
      if (prisma) await prisma.$disconnect();
    });

    it('PG-A — schema table exists', async () => {
      if (!dbOk) return;
      const rows = await prisma.$queryRaw<Array<{ regclass: string | null }>>`
        SELECT to_regclass('public.battery_longitudinal_profile_revisions')::text AS regclass
      `;
      expect(rows[0]?.regclass).toBe('battery_longitudinal_profile_revisions');
    });

    describe('PG-B — fingerprint CHECK matrix', () => {
      it('rejects uppercase 64-char hex', async () => {
        if (!dbOk) return;
        const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'CHK-UP');
        const { input } = buildPersistencePair(organizationId, vehicleId);
        await expect(
          rawInsertRevision(
            prisma,
            organizationId,
            vehicleId,
            input,
            'ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789',
          ),
        ).rejects.toThrow();
      });

      it('rejects 63 lowercase hex chars', async () => {
        if (!dbOk) return;
        const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'CHK-63');
        const { input } = buildPersistencePair(organizationId, vehicleId);
        await expect(
          rawInsertRevision(prisma, organizationId, vehicleId, input, 'a'.repeat(63)),
        ).rejects.toThrow();
      });

      it('rejects 65 lowercase hex chars', async () => {
        if (!dbOk) return;
        const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'CHK-65');
        const { input } = buildPersistencePair(organizationId, vehicleId);
        await expect(
          rawInsertRevision(prisma, organizationId, vehicleId, input, 'a'.repeat(65)),
        ).rejects.toThrow();
      });

      it('rejects 64 chars with non-hex character', async () => {
        if (!dbOk) return;
        const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'CHK-NH');
        const { input } = buildPersistencePair(organizationId, vehicleId);
        await expect(
          rawInsertRevision(
            prisma,
            organizationId,
            vehicleId,
            input,
            `g${'a'.repeat(63)}`,
          ),
        ).rejects.toThrow();
      });

      it('accepts exactly 64 lowercase hex characters', async () => {
        if (!dbOk) return;
        const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'CHK-OK');
        const { input, fingerprint } = buildPersistencePair(organizationId, vehicleId);
        await expect(
          rawInsertRevision(
            prisma,
            organizationId,
            vehicleId,
            input,
            fingerprint.canonicalProfileFingerprint,
          ),
        ).resolves.toBeDefined();
      });
    });

    it('PG-C — first insert CREATED', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'CREATE');
      const { fingerprint, input } = buildPersistencePair(organizationId, vehicleId);
      const out = await repo.insertIdempotent(input, fingerprint.canonicalScientificUtf8);
      expect(out.persistenceOutcome).toBe('CREATED');
      const count = await prisma.batteryLongitudinalProfileRevision.count({
        where: { organizationId, vehicleId },
      });
      expect(count).toBe(1);
    });

    it('PG-D — duplicate EXISTING same row', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'DUP');
      const { fingerprint, input } = buildPersistencePair(organizationId, vehicleId);
      const first = await repo.insertIdempotent(input, fingerprint.canonicalScientificUtf8);
      const second = await repo.insertIdempotent(input, fingerprint.canonicalScientificUtf8);
      expect(first.persistenceOutcome).toBe('CREATED');
      expect(second.persistenceOutcome).toBe('EXISTING');
      expect(second.revision.id).toBe(first.revision.id);
      expect(
        await prisma.batteryLongitudinalProfileRevision.count({
          where: { organizationId, vehicleId },
        }),
      ).toBe(1);
    });

    it('PG-E — profileGeneratedAt-only change → EXISTING', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'ENV');
      const a = buildPersistencePair(organizationId, vehicleId, '2026-01-01T00:00:00.000Z');
      const b = buildPersistencePair(organizationId, vehicleId, '2026-06-01T00:00:00.000Z');
      const first = await repo.insertIdempotent(a.input, a.fingerprint.canonicalScientificUtf8);
      const second = await repo.insertIdempotent(a.input, b.fingerprint.canonicalScientificUtf8);
      expect(first.persistenceOutcome).toBe('CREATED');
      expect(second.persistenceOutcome).toBe('EXISTING');
      expect(
        await prisma.batteryLongitudinalProfileRevision.count({
          where: { organizationId, vehicleId },
        }),
      ).toBe(1);
    });

    it('PG-F — multi-replica concurrent insert (8 clients)', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'CONC');
      const { fingerprint, input } = buildPersistencePair(organizationId, vehicleId);
      const clients = Array.from({ length: 8 }, () => new PrismaClient());
      await Promise.all(clients.map((c) => c.$connect()));
      try {
        const repos = clients.map(
          (c) =>
            new LongitudinalProfileMaterializationRepository(c as unknown as PrismaService),
        );
        const results = await Promise.all(
          repos.map((r) => r.insertIdempotent(input, fingerprint.canonicalScientificUtf8)),
        );
        const created = results.filter((r) => r.persistenceOutcome === 'CREATED');
        const existing = results.filter((r) => r.persistenceOutcome === 'EXISTING');
        expect(created).toHaveLength(1);
        expect(existing).toHaveLength(7);
        const ids = new Set(results.map((r) => r.revision.id));
        expect(ids.size).toBe(1);
        expect(
          await prisma.batteryLongitudinalProfileRevision.count({
            where: { organizationId, vehicleId },
          }),
        ).toBe(1);
      } finally {
        await Promise.all(clients.map((c) => c.$disconnect()));
      }
    });

    it('PG-G — different science → two rows', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'SCI');
      const inv1 = buildProfileTestInventory([
        buildProfileTestInventoryItem({
          restSessionId: 'a',
          anchorAt: '2026-05-01T10:00:00.000Z',
          inclusionMode: 'DEFAULT',
        }),
      ]);
      const inv2 = buildProfileTestInventory([
        buildProfileTestInventoryItem({
          restSessionId: 'b',
          anchorAt: '2026-05-02T10:00:00.000Z',
          inclusionMode: 'DEFAULT',
        }),
      ]);
      for (const inv of [inv1, inv2]) {
        inv.organizationId = organizationId;
        inv.vehicleId = vehicleId;
        inv.sessions.forEach((s) => {
          s.organizationId = organizationId;
          s.vehicleId = vehicleId;
        });
      }
      const p1 = assembleLongitudinalProfileV1({
        inventory: inv1,
        profileGeneratedAt: PROFILE_TEST_GENERATED_AT,
      });
      const p2 = assembleLongitudinalProfileV1({
        inventory: inv2,
        profileGeneratedAt: PROFILE_TEST_GENERATED_AT,
      });
      if (p1.status !== 'OK' || p2.status !== 'OK') throw new Error('assemble failed');
      const f1 = computeLongitudinalScientificProfileFingerprintV1(p1.profile);
      const f2 = computeLongitudinalScientificProfileFingerprintV1(p2.profile);
      const row1 = buildLongitudinalProfileMaterializationPersistenceInput(f1);
      const row2 = buildLongitudinalProfileMaterializationPersistenceInput(f2);
      await repo.insertIdempotent(row1, f1.canonicalScientificUtf8);
      await repo.insertIdempotent(row2, f2.canonicalScientificUtf8);
      expect(f1.canonicalProfileFingerprint).not.toBe(f2.canonicalProfileFingerprint);
      expect(
        await prisma.batteryLongitudinalProfileRevision.count({
          where: { organizationId, vehicleId },
        }),
      ).toBe(2);
    });

    it('PG-H — collision drift fail closed', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'COL');
      const profileA = buildPersistencePair(organizationId, vehicleId);
      const invB = buildProfileTestInventory([
        buildProfileTestInventoryItem({
          restSessionId: 'other',
          anchorAt: '2026-08-01T12:00:00.000Z',
          inclusionMode: 'DEFAULT',
        }),
      ]);
      invB.organizationId = organizationId;
      invB.vehicleId = vehicleId;
      invB.sessions.forEach((s) => {
        s.organizationId = organizationId;
        s.vehicleId = vehicleId;
      });
      const assembledB = assembleLongitudinalProfileV1({
        inventory: invB,
        profileGeneratedAt: PROFILE_TEST_GENERATED_AT,
      });
      if (assembledB.status !== 'OK') throw new Error(assembledB.reason);
      const fingerprintB = computeLongitudinalScientificProfileFingerprintV1(assembledB.profile);
      const wrongJson = fingerprintB.scientificProjection;
      const seedId = randomUUID();
      await prisma.$executeRaw`
        INSERT INTO battery_longitudinal_profile_revisions (
          id, organization_id, vehicle_id,
          longitudinal_profile_contract_version, profile_policy_version,
          canonical_profile_fingerprint, scientific_profile_json,
          requested_session_limit, applied_session_limit,
          candidate_rest_session_count, included_session_count,
          provisional_session_count, excluded_session_count,
          profile_status
        ) VALUES (
          ${seedId},
          ${organizationId},
          ${vehicleId},
          ${profileA.input.longitudinalProfileContractVersion},
          ${profileA.input.profilePolicyVersion},
          ${profileA.fingerprint.canonicalProfileFingerprint},
          ${wrongJson as unknown as Prisma.InputJsonValue},
          ${profileA.input.requestedSessionLimit},
          ${profileA.input.appliedSessionLimit},
          ${profileA.input.candidateRestSessionCount},
          ${profileA.input.includedSessionCount},
          ${profileA.input.provisionalSessionCount},
          ${profileA.input.excludedSessionCount},
          ${profileA.input.profileStatus}
        )
      `;
      const scoped = profileA.input;
      await expect(
        repo.insertIdempotent(scoped, profileA.fingerprint.canonicalScientificUtf8),
      ).rejects.toBeInstanceOf(ProfileFingerprintCollisionOrCanonicalizationDriftError);
    });

    it('PG-I — tenant isolation on unique key', async () => {
      if (!dbOk) return;
      const a = await createOrgVehicle(prisma, 'TEN-A');
      const b = await createOrgVehicle(prisma, 'TEN-B');
      const packA = buildPersistencePair(a.organizationId, a.vehicleId);
      const packB = buildPersistencePair(b.organizationId, b.vehicleId);
      await repo.insertIdempotent(packA.input, packA.fingerprint.canonicalScientificUtf8);
      await repo.insertIdempotent(packB.input, packB.fingerprint.canonicalScientificUtf8);
      expect(packA.fingerprint.canonicalProfileFingerprint).not.toBe(
        packB.fingerprint.canonicalProfileFingerprint,
      );
      expect(await prisma.batteryLongitudinalProfileRevision.count()).toBeGreaterThanOrEqual(2);
      await prisma.organization.delete({ where: { id: a.organizationId } });
      await prisma.organization.delete({ where: { id: b.organizationId } });
    });

    it('PG-J — organization cascade delete', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'ORGC');
      const { fingerprint, input } = buildPersistencePair(organizationId, vehicleId);
      await repo.insertIdempotent(input, fingerprint.canonicalScientificUtf8);
      await prisma.organization.delete({ where: { id: organizationId } });
      expect(
        await prisma.batteryLongitudinalProfileRevision.count({
          where: { organizationId },
        }),
      ).toBe(0);
    });

    it('PG-K — vehicle cascade delete', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'VEHC');
      const { fingerprint, input } = buildPersistencePair(organizationId, vehicleId);
      await repo.insertIdempotent(input, fingerprint.canonicalScientificUtf8);
      await prisma.$executeRaw`DELETE FROM vehicles WHERE id = ${vehicleId}`;
      expect(
        await prisma.batteryLongitudinalProfileRevision.count({
          where: { vehicleId },
        }),
      ).toBe(0);
      await prisma.organization.delete({ where: { id: organizationId } });
    });

    it('PG-L — no FK to C3/rest session tables', async () => {
      if (!dbOk) return;
      const rows = await prisma.$queryRaw<
        Array<{ foreign_table_name: string }>
      >`
        SELECT ccu.table_name AS foreign_table_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name
        WHERE tc.table_name = 'battery_longitudinal_profile_revisions'
          AND tc.constraint_type = 'FOREIGN KEY'
      `;
      const names = rows.map((r) => r.foreign_table_name).sort();
      expect(names).toEqual(['organizations', 'vehicles']);
    });

    it('PG-M — unique + indexes in pg_catalog', async () => {
      if (!dbOk) return;
      const unique = await prisma.$queryRaw<Array<{ indexname: string }>>`
        SELECT indexname FROM pg_indexes
        WHERE tablename = 'battery_longitudinal_profile_revisions'
          AND indexname = 'battery_longitudinal_profile_revision_scientific_identity'
      `;
      expect(unique).toHaveLength(1);
      const vehicleIdx = await prisma.$queryRaw<Array<{ indexname: string }>>`
        SELECT indexname FROM pg_indexes
        WHERE indexname = 'battery_longitudinal_profile_revisions_vehicle_materialized_idx'
      `;
      const orgIdx = await prisma.$queryRaw<Array<{ indexname: string }>>`
        SELECT indexname FROM pg_indexes
        WHERE indexname = 'battery_longitudinal_profile_revisions_org_created_idx'
      `;
      expect(vehicleIdx).toHaveLength(1);
      expect(orgIdx).toHaveLength(1);
    });

    it('PG-N — stored JSON canonical equivalence', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'EQ');
      const { fingerprint, input } = buildPersistencePair(organizationId, vehicleId);
      const out = await repo.insertIdempotent(input, fingerprint.canonicalScientificUtf8);
      const stored = out.revision.scientificProfileJson;
      expect(canonicalFeatureInputUtf8(stored)).toBe(fingerprint.canonicalScientificUtf8);
    });

    it('PG-O — full metadata mirror', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'META');
      const { fingerprint, input } = buildPersistencePair(organizationId, vehicleId);
      const out = await repo.insertIdempotent(input, fingerprint.canonicalScientificUtf8);
      expect(revisionMetadataMirrorsPersistenceInput(out.revision, input)).toBe(true);
      expect(canonicalFeatureInputUtf8(out.revision.scientificProfileJson)).toBe(
        fingerprint.canonicalScientificUtf8,
      );
    });

    it('PG-Q — metadata drift fail closed on EXISTING path', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'MDRIFT');
      const { fingerprint, input } = buildPersistencePair(organizationId, vehicleId);
      const seedId = randomUUID();
      await prisma.$executeRaw`
        INSERT INTO battery_longitudinal_profile_revisions (
          id, organization_id, vehicle_id,
          longitudinal_profile_contract_version, profile_policy_version,
          canonical_profile_fingerprint, scientific_profile_json,
          requested_session_limit, applied_session_limit,
          candidate_rest_session_count, included_session_count,
          provisional_session_count, excluded_session_count,
          profile_status
        ) VALUES (
          ${seedId},
          ${organizationId},
          ${vehicleId},
          ${input.longitudinalProfileContractVersion},
          ${input.profilePolicyVersion},
          ${input.canonicalProfileFingerprint},
          ${input.scientificProfileJson as Prisma.InputJsonValue},
          ${input.requestedSessionLimit},
          ${input.appliedSessionLimit},
          ${input.candidateRestSessionCount},
          ${999},
          ${input.provisionalSessionCount},
          ${input.excludedSessionCount},
          ${input.profileStatus}
        )
      `;
      await expect(
        repo.insertIdempotent(input, fingerprint.canonicalScientificUtf8),
      ).rejects.toBeInstanceOf(ProfileMaterializedMetadataDriftError);
    });

    it('PG-P — profileGeneratedAt absent from JSONB', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'ABS');
      const { fingerprint, input } = buildPersistencePair(organizationId, vehicleId);
      const out = await repo.insertIdempotent(input, fingerprint.canonicalScientificUtf8);
      const json = out.revision.scientificProfileJson as Record<string, unknown>;
      const window = json.window as Record<string, unknown>;
      expect(window).toBeDefined();
      expect(Object.prototype.hasOwnProperty.call(window, 'profileGeneratedAt')).toBe(false);
    });

    it('TX — duplicate path succeeds under explicit READ COMMITTED', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'TX');
      const { fingerprint, input } = buildPersistencePair(organizationId, vehicleId);
      await repo.insertIdempotent(input, fingerprint.canonicalScientificUtf8);
      await expect(
        repo.insertIdempotent(input, fingerprint.canonicalScientificUtf8),
      ).resolves.toMatchObject({ persistenceOutcome: 'EXISTING' });
    });
  },
);
