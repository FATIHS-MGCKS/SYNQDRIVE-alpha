#!/usr/bin/env ts-node
/**
 * M3.3F F1 — internal on-demand D3 longitudinal profile materialization (ops only).
 *
 * Usage:
 *   cd backend
 *   npm run battery:longitudinal-profile:materialize -- \
 *     --organization-id=<uuid> --vehicle-id=<uuid> [--session-limit=<n>]
 */
import { Test } from '@nestjs/testing';
import { PrismaModule } from '@shared/database/prisma.module';
import { BatteryGeneralizedEvidenceModule } from '../../src/modules/vehicle-intelligence/battery-health/generalized-evidence/generalized-evidence.module';
import { LongitudinalProfileMaterializationRuntimeService } from '../../src/modules/vehicle-intelligence/battery-health/generalized-evidence/rest-session-features/longitudinal/longitudinal-profile-materialization.runtime.service';
import {
  describeLongitudinalMaterializationSessionLimitForOps,
  runLongitudinalProfileMaterializeOps,
} from '../../src/modules/vehicle-intelligence/battery-health/generalized-evidence/rest-session-features/longitudinal/longitudinal-profile-materialization.ops-runner';

function parseArg(prefix: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`${prefix}=`));
  return hit?.split('=').slice(1).join('=').trim();
}

function parseOptionalSessionLimit(): number | undefined {
  const raw = parseArg('--session-limit');
  if (raw == null || raw === '') return undefined;
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed;
}

async function main(): Promise<void> {
  const organizationId = parseArg('--organization-id');
  const vehicleId = parseArg('--vehicle-id');
  const sessionLimitOverride = parseOptionalSessionLimit();

  if (!organizationId || !vehicleId) {
    console.error(
      'Usage: battery-longitudinal-profile-materialize.ts --organization-id=... --vehicle-id=... [--session-limit=<1-100>]',
    );
    process.exit(1);
  }

  const limitInfo = describeLongitudinalMaterializationSessionLimitForOps(sessionLimitOverride);
  console.error(
    `longitudinal_materialization_ops session_limit=${limitInfo.sessionLimit} configured_default=${limitInfo.configuredDefault}`,
  );

  const moduleRef = await Test.createTestingModule({
    imports: [BatteryGeneralizedEvidenceModule, PrismaModule],
  }).compile();

  const runtime = moduleRef.get(LongitudinalProfileMaterializationRuntimeService);

  try {
    const result = await runLongitudinalProfileMaterializeOps(runtime, {
      organizationId,
      vehicleId,
      sessionLimitOverride,
    });

    console.log(JSON.stringify(result, null, 2));

    if ('status' in result && result.status === 'INVALID_ARGS') {
      process.exit(1);
    }
    if ('status' in result && result.status === 'SKIPPED_FLAG_OFF') {
      process.exit(0);
    }
    process.exit(0);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  } finally {
    await moduleRef.close().catch(() => undefined);
  }
}

void main();
