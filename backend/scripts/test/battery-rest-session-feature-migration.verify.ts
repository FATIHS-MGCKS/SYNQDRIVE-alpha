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

async function main() {
  const prisma = new PrismaClient();
  try {
    const enums = await prisma.$queryRaw<Array<{ typname: string }>>`
      SELECT typname FROM pg_type
      WHERE typname IN (
        'BatteryRestSessionFeatureComputationPhase',
        'BatteryRestSessionFeatureSessionTrust',
        'BatteryRestSessionChargeOpportunityClass'
      )
      ORDER BY typname
    `;
    if (enums.length !== 3) {
      throw new Error(`expected 3 enums, got ${enums.length}`);
    }

    const table = await prisma.$queryRaw<Array<{ regclass: string }>>`
      SELECT to_regclass('public.battery_rest_session_features')::text AS regclass
    `;
    if (table[0]?.regclass !== 'battery_rest_session_features') {
      throw new Error('battery_rest_session_features table missing');
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

    let duplicateRejected = false;
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
      duplicateRejected = true;
    }
    if (!duplicateRejected) {
      throw new Error('duplicate inputDigest was not rejected');
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
        DUPLICATE_DIGEST_REJECTED: true,
        NEW_DIGEST_REVISION_ALLOWED: true,
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
