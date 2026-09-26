#!/usr/bin/env ts-node
/**
 * M3.3F F1 — internal on-demand D3 longitudinal profile materialization (ops only).
 *
 * Usage:
 *   cd backend
 *   npm run battery:longitudinal-profile:materialize -- \
 *     --organization-id=<uuid> --vehicle-id=<uuid> [--session-limit=<n>]
 */
import {
  closeLongitudinalProfileMaterializationOpsContext,
  createLongitudinalProfileMaterializationOpsContext,
} from '../../src/modules/vehicle-intelligence/battery-health/generalized-evidence/rest-session-features/longitudinal/longitudinal-profile-materialization.ops-bootstrap';
import { parseCliSessionLimitArg } from '../../src/modules/vehicle-intelligence/battery-health/generalized-evidence/rest-session-features/longitudinal/longitudinal-profile-materialization.runtime-config';
import {
  describeLongitudinalMaterializationSessionLimitForOps,
  runLongitudinalProfileMaterializeOps,
} from '../../src/modules/vehicle-intelligence/battery-health/generalized-evidence/rest-session-features/longitudinal/longitudinal-profile-materialization.ops-runner';

function parseArg(prefix: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`${prefix}=`));
  return hit?.split('=').slice(1).join('=').trim();
}

async function main(): Promise<void> {
  const organizationId = parseArg('--organization-id');
  const vehicleId = parseArg('--vehicle-id');
  const sessionLimitRaw = parseArg('--session-limit');

  if (!organizationId || !vehicleId) {
    console.error(
      'Usage: battery-longitudinal-profile-materialize.ts --organization-id=... --vehicle-id=... [--session-limit=<positive-int>]',
    );
    process.exit(1);
  }

  const cliLimit = parseCliSessionLimitArg(sessionLimitRaw);
  if (cliLimit.status === 'INVALID') {
    console.error(cliLimit.message);
    process.exit(1);
  }

  const sessionLimitOverride = cliLimit.status === 'OK' ? cliLimit.value : undefined;

  const limitInfo = describeLongitudinalMaterializationSessionLimitForOps(sessionLimitOverride);
  if ('status' in limitInfo) {
    console.error(limitInfo.message);
    process.exit(1);
  }

  console.error(
    `longitudinal_materialization_ops session_limit=${limitInfo.sessionLimit} configured_default=${limitInfo.configuredDefault}`,
  );

  const ctx = await createLongitudinalProfileMaterializationOpsContext();

  try {
    const result = await runLongitudinalProfileMaterializeOps(ctx.runtime, {
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
    await closeLongitudinalProfileMaterializationOpsContext(ctx).catch(() => undefined);
  }
}

void main();
