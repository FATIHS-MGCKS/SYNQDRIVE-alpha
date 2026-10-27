/**
 * Tire Wear V3 P3 — read-only production offline replay + consumer-chain slice.
 *
 * NEVER mutates production. Requires DATABASE_URL (e.g. SSH tunnel to prod Postgres).
 * Shadow persist is forced OFF regardless of env.
 *
 * Usage:
 *   cd backend
 *   TIRE_WEAR_V3_PRIOR_SHADOW_WRITE_ENABLED=false \
 *   npx ts-node -r tsconfig-paths/register scripts/ops/tire-v3-p3-offline-e2e-validation.readonly.ts \
 *     --out=../../architecture/tires/evidence/p3-offline-e2e-2026-10-27/offline-replay-results.json
 */
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import tireWearV3PriorShadowConfig from '../../src/config/tire-wear-v3-prior-shadow.config';
import {
  isTireWearV3CustomerReadActive,
  isTireWearV3CustomerReadAuthoritative,
  shouldSuppressV2TireWearSnapshotWrites,
} from '../../src/config/tire-wear-v3-cutover.policy';
import {
  buildV3VerificationAlerts,
  mapV3SetupToCustomerRead,
  resolveV3OverallTreadStatus,
} from '../../src/modules/vehicle-intelligence/tires/tire-health-v3-read.adapter';
import { buildTireRentalHealthReadModel } from '../../src/modules/rental-health/tire-rental-health.policy';
import { TireWearV3PriorRepository } from '../../src/modules/vehicle-intelligence/tires/wear-v3-prior/tire-wear-v3-prior.repository';
import { TireWearV3PriorService } from '../../src/modules/vehicle-intelligence/tires/wear-v3-prior/tire-wear-v3-prior.service';
import { TIRE_WEAR_V3_PRIOR_DYNAMIC_BETA } from '../../src/modules/vehicle-intelligence/tires/wear-v3-prior/tire-wear-v3-prior.config';
import type { TireWearV3PriorSetupResult } from '../../src/modules/vehicle-intelligence/tires/wear-v3-prior/tire-wear-v3-prior.types';

const P3_VEHICLES: Array<{
  vehicleId: string;
  label: string;
  setupId: string;
}> = [
  {
    vehicleId: '68868291-5478-42cd-b0c4-cc77b2a78e21',
    label: 'Tesla Model 3 (KS FH 660E)',
    setupId: '52d71c61-5215-4b4f-8884-3183b11d32aa',
  },
  {
    vehicleId: '19fedd4b-c4e8-4de8-a125-dab293326e7e',
    label: 'VW Tiguan (WOB L 7503)',
    setupId: 'a4c7c0ff-5a3f-45d5-a7ee-a24ef327344e',
  },
  {
    vehicleId: 'c10351f8-b6a2-4258-947f-631aeaa6d359',
    label: 'Audi A4 (KS MS 661)',
    setupId: 'ed89e3e1-ee91-46e1-b6a1-b5bb8e8c7f44',
  },
  {
    vehicleId: '8c850ff1-4201-432b-af2e-2711dbc7ca48',
    label: 'VW Arteon (HMÜ C 215)',
    setupId: '7e34a096-fc68-4443-8e89-5d60eab1e42f',
  },
];

function parseOutArg(): string {
  const m = process.argv.find((a) => a.startsWith('--out='));
  return m?.split('=').slice(1).join('=') ?? '';
}

function stablePriorDigest(result: TireWearV3PriorSetupResult): string {
  return JSON.stringify({
    fingerprint: result.inputFingerprint,
    verification: result.verification.status,
    wheels: result.wheels.map((w) => ({
      position: w.position,
      treadEvidenceClass: w.treadEvidenceClass,
      display: w.displayTreadMm,
      verification: result.verification.wheels.find((v) => v.position === w.position)?.verificationStatus,
    })),
  });
}

function flagTruthTable(): unknown {
  const combos = [
    { enabled: false, authoritative: false },
    { enabled: false, authoritative: true },
    { enabled: true, authoritative: false },
    { enabled: true, authoritative: true },
  ];
  return combos.map((c) => {
    const flags = {
      customerReadEnabled: c.enabled,
      customerReadAuthoritative: c.authoritative,
    };
    return {
      ...c,
      readActive: isTireWearV3CustomerReadActive(flags),
      readAuthoritative: isTireWearV3CustomerReadAuthoritative(flags),
      suppressV2Snapshots: shouldSuppressV2TireWearSnapshotWrites(flags),
    };
  });
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required (read-only tunnel to production Postgres).');
  }
  process.env.TIRE_WEAR_V3_PRIOR_SHADOW_WRITE_ENABLED = 'false';

  const prisma = new PrismaClient();
  const configService = new ConfigService({
    tireWearV3PriorShadow: tireWearV3PriorShadowConfig(),
  });
  const repository = new TireWearV3PriorRepository(prisma as never);
  const priorService = new TireWearV3PriorService(prisma as never, repository, configService);

  const baseSha = process.env.P3_BASE_SHA ?? '1cc5b91c7508b5e973caa3c5e5ea32e0eb397cc2';
  const vehicles: Record<string, unknown>[] = [];
  const report = {
    kind: 'tire_wear_v3_p3_offline_e2e',
    baseSha,
    replayedAtUtc: new Date().toISOString(),
    readOnly: true,
    shadowWriteEnv: process.env.TIRE_WEAR_V3_PRIOR_SHADOW_WRITE_ENABLED,
    dynamicBeta: TIRE_WEAR_V3_PRIOR_DYNAMIC_BETA,
    flagTruthTable: flagTruthTable(),
    vehicles,
  };

  for (const v of P3_VEHICLES) {
    const vehicle = await prisma.vehicle.findUnique({
      where: { id: v.vehicleId },
      select: { mileageKm: true, make: true, model: true, licensePlate: true },
    });
    const shadowBefore = await prisma.tireWearV3PriorShadowV1.count({
      where: { vehicleId: v.vehicleId, tireSetupId: v.setupId },
    });

    const run1 = await priorService.computeForSetup(v.setupId, { persistShadow: false });
    const run2 = await priorService.computeForSetup(v.setupId, { persistShadow: false });

    const shadowAfter = await prisma.tireWearV3PriorShadowV1.count({
      where: { vehicleId: v.vehicleId, tireSetupId: v.setupId },
    });

    const v2Snap = await prisma.tireHealthSnapshot.findFirst({
      where: { vehicleId: v.vehicleId, tireSetId: v.setupId },
      orderBy: { snapshotDate: 'desc' },
      select: {
        estimatedTreadMm: true,
        odometerKm: true,
        modelVersion: true,
        snapshotDate: true,
      },
    });

    const customerRead = run1 ? mapV3SetupToCustomerRead(run1) : null;
    const v3Alerts = customerRead ? buildV3VerificationAlerts(customerRead, v.setupId) : [];
    const overallV3Status = customerRead
      ? resolveV3OverallTreadStatus(customerRead, 'ALL_SEASON')
      : null;

    const rentalModel =
      customerRead && overallV3Status
        ? buildTireRentalHealthReadModel({
            summary: {
              activeSetupId: v.setupId,
              displayMode: customerRead.insufficientEvidence ? 'UNKNOWN' : 'ESTIMATED',
              overallStatus: overallV3Status,
              lowestTreadMm: customerRead.lowestTreadMm?.lo ?? null,
              lowestTreadPosition: customerRead.lowestTreadPosition,
              lastMeasurementAt: null,
              isDefaultAssumption: customerRead.insufficientEvidence,
              confidence: 'MEDIUM',
              wearV3: customerRead,
              alerts: [],
              pressureSpecMissingLabel: null,
            } as unknown as import('../../src/modules/vehicle-intelligence/tires/tire-health.service').TireHealthSummary,
          })
        : null;

    vehicles.push({
      label: v.label,
      vehicleId: v.vehicleId,
      setupId: v.setupId,
      mileageKm: vehicle?.mileageKm ?? null,
      v3PriorShadowRowsBefore: shadowBefore,
      v3PriorShadowRowsAfter: shadowAfter,
      shadowRowsUnchanged: shadowBefore === shadowAfter,
      idempotent: run1 && run2 ? stablePriorDigest(run1) === stablePriorDigest(run2) : false,
      v2LatestSnapshot: v2Snap,
      v3: run1
        ? {
            modelVersion: run1.modelVersion,
            inputFingerprint: run1.inputFingerprint,
            rated: run1.rated,
            verificationStatus: run1.verification.status,
            verificationQualityFlags: run1.verification.qualityFlags,
            setupFlags: run1.setupFlags,
            wheels: run1.wheels.map((w) => ({
              position: w.position,
              treadEvidenceClass: w.treadEvidenceClass,
              evidenceLevel: w.evidenceLevel,
              displayTreadMm: w.displayTreadMm,
              pointEstimateTreadMm: w.pointEstimateTreadMm,
              flags: w.flags,
            })),
          }
        : null,
      customerRead,
      v3AlertCodes: v3Alerts.map((a) => a.code),
      rentalReasonCodes: rentalModel?.structuredReasonCodes ?? [],
      rentalReviewRequirement: rentalModel?.reviewRequirement ?? null,
      v3OverallTreadStatus: overallV3Status,
    });
  }

  await prisma.$disconnect();

  const out = parseOutArg();
  const json = JSON.stringify(report, null, 2);
  if (out) {
    const abs = path.resolve(out);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, json);
  }
  process.stdout.write(json);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
