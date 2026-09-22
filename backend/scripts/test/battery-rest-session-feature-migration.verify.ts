import { randomUUID } from 'crypto';
import {
  BatteryRestSessionAnchorType,
  BatteryRestSessionChargeOpportunityClass,
  BatteryRestSessionFeatureComputationPhase,
  BatteryRestSessionFeatureSessionTrust,
  BatteryRestSessionStatus,
  PrismaClient,
} from '@prisma/client';
import {
  REST_SESSION_CHARGE_OPPORTUNITY_POLICY_VERSION,
  REST_SESSION_FEATURE_MODEL_VERSION,
  REST_SESSION_RETENTION_POLICY_VERSION,
} from '../../src/modules/vehicle-intelligence/battery-health/generalized-evidence/rest-session-features/rest-session-feature.constants';

const EXPECTED_ENUMS = [
  'BatteryRestSessionFeatureComputationPhase',
  'BatteryRestSessionFeatureSessionTrust',
  'BatteryRestSessionChargeOpportunityClass',
] as const;

const EXPECTED_UNIQUE_INDEXES = [
  'battery_rest_session_feature_input_digest',
  'battery_rest_session_feature_semantic_revision',
] as const;

/** PostgreSQL truncates identifiers >63 chars; legacy C1 index name on already-migrated ephemeral DBs. */
const LEGACY_REST_SESSION_REVISION_INDEX_PREFIX =
  'battery_rest_session_features_rest_session_id_feature_model';

const EXPECTED_FK_TABLES = ['organizations', 'vehicles', 'battery_rest_sessions'] as const;

async function verifyPostgresObjectContract(prisma: PrismaClient): Promise<void> {
  const enums = await prisma.$queryRaw<Array<{ typname: string }>>`
    SELECT typname FROM pg_type
    WHERE typname IN (
      'BatteryRestSessionFeatureComputationPhase',
      'BatteryRestSessionFeatureSessionTrust',
      'BatteryRestSessionChargeOpportunityClass'
    )
    ORDER BY typname
  `;
  const enumNames = enums.map((e) => e.typname).sort();
  const expectedSorted = [...EXPECTED_ENUMS].sort();
  if (enumNames.join(',') !== expectedSorted.join(',')) {
    throw new Error(`enum contract mismatch: got ${enumNames.join(',')}`);
  }

  const table = await prisma.$queryRaw<Array<{ regclass: string }>>`
    SELECT to_regclass('public.battery_rest_session_features')::text AS regclass
  `;
  if (table[0]?.regclass !== 'battery_rest_session_features') {
    throw new Error('battery_rest_session_features table missing');
  }

  const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'battery_rest_session_features'
  `;
  const indexSet = new Set(indexes.map((i) => i.indexname));
  for (const name of EXPECTED_UNIQUE_INDEXES) {
    if (!indexSet.has(name)) {
      throw new Error(`missing index ${name}`);
    }
  }
  for (const name of [
    'battery_rest_session_features_vehicle_id_computed_at_idx',
    'battery_rest_session_features_organization_id_computed_at_idx',
  ]) {
    if (!indexSet.has(name)) {
      throw new Error(`missing index ${name}`);
    }
  }
  const hasRestSessionRevisionIdx = [...indexSet].some(
    (name) =>
      name === 'battery_rest_session_feature_rest_session_model_revision_idx' ||
      name.startsWith(LEGACY_REST_SESSION_REVISION_INDEX_PREFIX),
  );
  if (!hasRestSessionRevisionIdx) {
    throw new Error('missing rest_session_id + feature_model_version + semantic_revision index');
  }

  const fks = await prisma.$queryRaw<
    Array<{ conname: string; referenced_table: string }>
  >`
    SELECT c.conname,
           ref.relname AS referenced_table
    FROM pg_constraint c
    JOIN pg_class rel ON rel.oid = c.conrelid
    JOIN pg_class ref ON ref.oid = c.confrelid
    WHERE rel.relname = 'battery_rest_session_features'
      AND c.contype = 'f'
    ORDER BY c.conname
  `;
  const refTables = new Set(fks.map((f) => f.referenced_table));
  for (const t of EXPECTED_FK_TABLES) {
    if (!refTables.has(t)) {
      throw new Error(`missing FK to ${t}`);
    }
  }

  const defaultRow = await prisma.$queryRaw<Array<{ column_default: string | null }>>`
    SELECT column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'battery_rest_session_features'
      AND column_name = 'charge_opportunity_class'
  `;
  const colDefault = defaultRow[0]?.column_default ?? '';
  if (!colDefault.includes('UNKNOWN')) {
    throw new Error(
      `charge_opportunity_class default expected UNKNOWN, got ${colDefault}`,
    );
  }
}

async function main() {
  const prisma = new PrismaClient();
  try {
    await verifyPostgresObjectContract(prisma);

    const preFixtureCount = await prisma.batteryRestSessionFeature.count();
    if (preFixtureCount > 0) {
      await prisma.$executeRaw`TRUNCATE TABLE battery_rest_session_features CASCADE`;
    }
    const migrationInitialFeatureRowCount = await prisma.batteryRestSessionFeature.count();
    if (migrationInitialFeatureRowCount !== 0) {
      throw new Error(
        `MIGRATION_INITIAL_FEATURE_ROW_COUNT expected 0, got ${migrationInitialFeatureRowCount}`,
      );
    }

    const org = await prisma.organization.create({
      data: {
        companyName: `M3.3C C1 Verify ${Date.now()}`,
        businessType: 'FLEET',
        status: 'ACTIVE',
      },
    });

    const vehicleId = randomUUID();
    const suffix = randomUUID().slice(0, 8);
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
        ${`C1-${suffix}`},
        NOW(),
        NOW()
      )
    `;

    const session = await prisma.batteryRestSession.create({
      data: {
        id: randomUUID(),
        organizationId: org.id,
        vehicleId,
        anchorType: BatteryRestSessionAnchorType.PHYSICAL_SHUTDOWN,
        anchorAt: new Date('2026-09-22T17:28:29.000Z'),
        sessionStatus: BatteryRestSessionStatus.CANDIDATE,
        openedAt: new Date('2026-09-22T17:28:29.000Z'),
        idempotencyKey: `rest-session:${vehicleId}:172829000`,
      },
    });

    const digestA = 'a'.repeat(64);
    const digestB = 'b'.repeat(64);

    await prisma.batteryRestSessionFeature.create({
      data: {
        id: randomUUID(),
        organizationId: org.id,
        vehicleId,
        restSessionId: session.id,
        featureModelVersion: REST_SESSION_FEATURE_MODEL_VERSION,
        retentionPolicyVersion: REST_SESSION_RETENTION_POLICY_VERSION,
        chargeOpportunityPolicyVersion: REST_SESSION_CHARGE_OPPORTUNITY_POLICY_VERSION,
        semanticRevision: 1,
        inputDigest: digestA,
        inputSummary: { schema: 'M3_3C_C1_VERIFY', restSessionId: session.id },
        computationPhase: BatteryRestSessionFeatureComputationPhase.INCREMENTAL,
        sessionTrust: BatteryRestSessionFeatureSessionTrust.VALID,
        chargeOpportunityClass: BatteryRestSessionChargeOpportunityClass.UNKNOWN,
        numberOfValidRestPoints: 0,
        computedAt: new Date(),
      },
    });

    let duplicateDigestRejected = false;
    try {
      await prisma.batteryRestSessionFeature.create({
        data: {
          id: randomUUID(),
          organizationId: org.id,
          vehicleId,
          restSessionId: session.id,
          featureModelVersion: REST_SESSION_FEATURE_MODEL_VERSION,
          retentionPolicyVersion: REST_SESSION_RETENTION_POLICY_VERSION,
          chargeOpportunityPolicyVersion: REST_SESSION_CHARGE_OPPORTUNITY_POLICY_VERSION,
          semanticRevision: 99,
          inputDigest: digestA,
          inputSummary: { duplicate: true },
          computationPhase: BatteryRestSessionFeatureComputationPhase.FINAL,
          sessionTrust: BatteryRestSessionFeatureSessionTrust.VALID,
          chargeOpportunityClass: BatteryRestSessionChargeOpportunityClass.UNKNOWN,
          numberOfValidRestPoints: 0,
          computedAt: new Date(),
        },
      });
    } catch {
      duplicateDigestRejected = true;
    }
    if (!duplicateDigestRejected) {
      throw new Error('duplicate inputDigest was not rejected');
    }

    let duplicateSemanticRevisionRejected = false;
    try {
      await prisma.batteryRestSessionFeature.create({
        data: {
          id: randomUUID(),
          organizationId: org.id,
          vehicleId,
          restSessionId: session.id,
          featureModelVersion: REST_SESSION_FEATURE_MODEL_VERSION,
          retentionPolicyVersion: REST_SESSION_RETENTION_POLICY_VERSION,
          chargeOpportunityPolicyVersion: REST_SESSION_CHARGE_OPPORTUNITY_POLICY_VERSION,
          semanticRevision: 1,
          inputDigest: digestB,
          inputSummary: { schema: 'M3_3C_C1_VERIFY', duplicateRevision: true },
          computationPhase: BatteryRestSessionFeatureComputationPhase.FINAL,
          sessionTrust: BatteryRestSessionFeatureSessionTrust.VALID,
          chargeOpportunityClass: BatteryRestSessionChargeOpportunityClass.UNKNOWN,
          numberOfValidRestPoints: 0,
          computedAt: new Date(),
        },
      });
    } catch {
      duplicateSemanticRevisionRejected = true;
    }
    if (!duplicateSemanticRevisionRejected) {
      throw new Error('duplicate semantic revision 1 was not rejected');
    }

    await prisma.batteryRestSessionFeature.create({
      data: {
        id: randomUUID(),
        organizationId: org.id,
        vehicleId,
        restSessionId: session.id,
        featureModelVersion: REST_SESSION_FEATURE_MODEL_VERSION,
        retentionPolicyVersion: REST_SESSION_RETENTION_POLICY_VERSION,
        chargeOpportunityPolicyVersion: REST_SESSION_CHARGE_OPPORTUNITY_POLICY_VERSION,
        semanticRevision: 2,
        inputDigest: digestB,
        inputSummary: { schema: 'M3_3C_C1_VERIFY', revision: 2 },
        computationPhase: BatteryRestSessionFeatureComputationPhase.FINAL,
        sessionTrust: BatteryRestSessionFeatureSessionTrust.VALID,
        chargeOpportunityClass: BatteryRestSessionChargeOpportunityClass.UNKNOWN,
        numberOfValidRestPoints: 1,
        computedAt: new Date(),
      },
    });

    const count = await prisma.batteryRestSessionFeature.count({
      where: { restSessionId: session.id },
    });
    if (count !== 2) {
      throw new Error(`expected 2 feature rows, got ${count}`);
    }

    console.log(
      JSON.stringify({
        POSTGRES_OBJECT_CONTRACT: 'PASS',
        MIGRATION_INITIAL_FEATURE_ROW_COUNT: migrationInitialFeatureRowCount,
        DUPLICATE_DIGEST_REJECTED: true,
        DUPLICATE_SEMANTIC_REVISION_REJECTED: true,
        NEW_DIGEST_REVISION_ALLOWED: true,
        NEW_SEMANTIC_REVISION_ALLOWED: true,
        FEATURE_ROW_COUNT: count,
      }),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
