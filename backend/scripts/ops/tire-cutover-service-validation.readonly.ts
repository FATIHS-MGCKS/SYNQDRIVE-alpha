/**
 * Production read-only tire cutover validation (service-level, no HTTP writes).
 *
 * Usage (on VPS with production env loaded):
 *   cd backend
 *   npx ts-node -r tsconfig-paths/register scripts/ops/tire-cutover-service-validation.readonly.ts --mode=v2
 *   npx ts-node -r tsconfig-paths/register scripts/ops/tire-cutover-service-validation.readonly.ts --mode=v3
 *
 * P3 cohort org/vehicles are fixed in-script for repeatable cutover smoke.
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/shared/database/prisma.service';
import { TireHealthService } from '../../src/modules/vehicle-intelligence/tires/tire-health.service';
import { TiresService } from '../../src/modules/vehicle-intelligence/tires/tires.service';
import { RentalHealthService } from '../../src/modules/rental-health/rental-health.service';
import {
  isTireWearV3CustomerReadActive,
  isTireWearV3CustomerReadAuthoritative,
  shouldSuppressV2TireWearSnapshotWrites,
} from '../../src/config/tire-wear-v3-cutover.policy';
import tireWearV3CutoverConfig from '../../src/config/tire-wear-v3-cutover.config';

const ORG_ID = 'faa710c9-6d91-4079-a7d5-91fdccdec14a';
const WRONG_ORG = '00000000-0000-0000-0000-000000000001';

const VEHICLES: Array<{ label: string; vehicleId: string }> = [
  { label: 'Tesla', vehicleId: '68868291-5478-42cd-b0c4-cc77b2a78e21' },
  { label: 'Tiguan', vehicleId: '19fedd4b-c4e8-4de8-a125-dab293326e7e' },
  { label: 'Audi', vehicleId: 'c10351f8-b6a2-4258-947f-631aeaa6d359' },
  { label: 'Arteon', vehicleId: '8c850ff1-4201-432b-af2e-2711dbc7ca48' },
];

type WearV3Wheel = {
  position?: string;
  treadDepthMm?: number | null;
  treadEvidenceClass?: string;
  verificationStatus?: string;
};

type WearV3Read = {
  verificationStatus?: string;
  verification?: { status?: string; insufficientEvidence?: boolean };
  wheels?: WearV3Wheel[];
  unavailableReason?: string;
};

function parseMode(): 'v2' | 'v3' {
  const m = process.argv.find((a) => a.startsWith('--mode='));
  const v = m?.split('=')[1]?.trim();
  return v === 'v3' ? 'v3' : 'v2';
}

function resolveVerificationStatus(wearV3: WearV3Read | undefined): string {
  if (!wearV3) return 'missing';
  return (
    wearV3.verificationStatus ??
    wearV3.verification?.status ??
    wearV3.unavailableReason ??
    'unknown'
  );
}

function summarizeWearV3(wearV3: WearV3Read | undefined) {
  if (!wearV3) return null;
  const verificationStatus = resolveVerificationStatus(wearV3);
  const wheels = wearV3.wheels ?? [];
  const insufficientEvidence =
    verificationStatus === 'INSUFFICIENT_EVIDENCE' ||
    wearV3.verification?.insufficientEvidence === true;
  const fabricatedPoint = wheels.some(
    (w) => typeof w.treadDepthMm === 'number' && insufficientEvidence,
  );
  return {
    verificationStatus,
    insufficientEvidence,
    wheelCount: wheels.length,
    treadEvidenceClasses: [...new Set(wheels.map((w) => w.treadEvidenceClass).filter(Boolean))],
    anyTreadDepthMm: wheels.some((w) => typeof w.treadDepthMm === 'number'),
    fabricatedPointUnderInsufficient: fabricatedPoint,
  };
}

function validateVehicle(
  mode: 'v2' | 'v3',
  summary: Record<string, unknown> | null,
  rentalTiresReason: string,
  rentalTiresState: string,
  authoritative: boolean,
) {
  const wearReadModel = (summary?.wearReadModel as string | undefined) ?? 'v2';
  const wearV3 = summary?.wearV3 as WearV3Read | undefined;
  const wearV3Summary = summarizeWearV3(wearV3);
  const legacyGoodFallback =
    wearReadModel === 'v3' &&
    authoritative &&
    (summary?.overallStatus === 'GOOD' || rentalTiresState === 'good') &&
    (wearV3Summary?.insufficientEvidence === true || !wearV3);

  const checks: Record<string, unknown> = {
    wearReadModel,
    wearV3Present: Boolean(wearV3),
    wearV3Summary,
    rentalTiresState,
    rentalTiresReason: rentalTiresReason.slice(0, 160),
    legacyGoodFallback,
    serviceException: false,
  };

  if (mode === 'v2') {
    checks.pass =
      !authoritative && wearReadModel !== 'v3' && !checks.wearV3Present;
  } else {
    checks.pass =
      authoritative &&
      wearReadModel === 'v3' &&
      Boolean(wearV3) &&
      !legacyGoodFallback &&
      !wearV3Summary?.fabricatedPointUnderInsufficient;
  }
  return checks;
}

async function main(): Promise<void> {
  const mode = parseMode();
  const flags = tireWearV3CutoverConfig();
  const authoritative = isTireWearV3CustomerReadAuthoritative(flags);

  const appModule = await AppModule.forRootAsync();
  const app = await NestFactory.createApplicationContext(appModule, {
    logger: ['error', 'warn'],
  });

  try {
    const prisma = app.get(PrismaService);
    const snapshotAgg = await prisma.tireHealthSnapshot.aggregate({
      _count: { _all: true },
      _max: { createdAt: true },
    });
    const tireHealth = app.get(TireHealthService);
    const tires = app.get(TiresService);
    const rental = app.get(RentalHealthService);

    const vehicles: Record<string, unknown> = {};
    for (const v of VEHICLES) {
      try {
        const summary = (await tireHealth.getSummary(v.vehicleId)) as Record<
          string,
          unknown
        > | null;
        await tires.getWearAnalysis(v.vehicleId);
        const health = await rental.getVehicleHealth(ORG_ID, v.vehicleId);
        vehicles[v.label] = validateVehicle(
          mode,
          summary,
          String(health.modules.tires.reason ?? ''),
          health.modules.tires.state,
          authoritative,
        );
      } catch (e: unknown) {
        const err = e as { name?: string; message?: string };
        vehicles[v.label] = {
          pass: false,
          serviceException: true,
          error: err?.name || String(err?.message || e),
        };
      }
    }

    let orgIsolation = 'unknown';
    try {
      await rental.getVehicleHealth(WRONG_ORG, VEHICLES[0].vehicleId);
      orgIsolation = 'unexpected_success';
    } catch (e: unknown) {
      const err = e as { name?: string };
      orgIsolation = err?.name || 'error';
    }

    const allPass = Object.values(vehicles).every(
      (row) => (row as { pass?: boolean }).pass === true,
    );

    console.log(
      JSON.stringify(
        {
          kind: 'tire_cutover_service_validation',
          mode,
          orgId: ORG_ID,
          cutoverFlags: {
            customerReadEnabled: flags.customerReadEnabled,
            customerReadAuthoritative: flags.customerReadAuthoritative,
            readActive: isTireWearV3CustomerReadActive(flags),
            readAuthoritative: authoritative,
            suppressV2Snapshots: shouldSuppressV2TireWearSnapshotWrites(flags),
          },
          tireHealthSnapshot: {
            count: snapshotAgg._count._all,
            latestCreatedAt: snapshotAgg._max.createdAt?.toISOString() ?? null,
          },
          vehicles,
          orgIsolation,
          verdict: allPass ? 'PASS' : 'FAIL',
        },
        null,
        2,
      ),
    );
  } finally {
    await app.close();
  }
}

main().catch((e: unknown) => {
  const err = e as { message?: string };
  console.error(JSON.stringify({ error: String(err?.message || e) }));
  process.exit(1);
});
