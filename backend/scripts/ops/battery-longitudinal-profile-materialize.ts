#!/usr/bin/env ts-node
/**
 * M3.3F F1 — internal on-demand D3 longitudinal profile materialization (ops only).
 *
 * Usage:
 *   cd backend
 *   npm run battery:longitudinal-profile:materialize -- \
 *     --organization-id=<uuid> --vehicle-id=<uuid> [--session-limit=<n>]
 */
import { runBatteryLongitudinalProfileMaterializeCli } from '../../src/modules/vehicle-intelligence/battery-health/generalized-evidence/rest-session-features/longitudinal/longitudinal-profile-materialization.ops-cli';

async function main(): Promise<void> {
  const exitCode = await runBatteryLongitudinalProfileMaterializeCli({
    argv: process.argv,
  });
  process.exitCode = exitCode;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
