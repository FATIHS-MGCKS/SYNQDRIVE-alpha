/**
 * M3.3-HV-H4-A3.3-O2-R4.1 — executable Phase-A read-only preflight (repository / isolated DB only).
 *
 * NOT for production. Requires explicit enable flag + dedicated database URL env.
 *
 * Usage (isolated test database only):
 *   M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_ENABLED=1 \
 *   M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_DATABASE_URL='postgresql://user@127.0.0.1:5432/isolated_db' \
 *     npx ts-node -r tsconfig-paths/register scripts/ops/m3-3-hv-h4-a3-o2-r4-1-phase-a-preflight.ts
 */
import { parseM3_3HvH4A3PhaseAPreflightConfigFromEnvV1 } from '../../src/modules/vehicle-intelligence/battery-health/hv-h4/m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.config.v1';
import { runM3_3HvH4A3PhaseAPreflightV1 } from '../../src/modules/vehicle-intelligence/battery-health/hv-h4/m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.runner.v1';

async function main(): Promise<void> {
  const parsed = parseM3_3HvH4A3PhaseAPreflightConfigFromEnvV1(process.env);
  if (!parsed.ok) {
    console.error('PHASE_A_PREFLIGHT_BLOCKED', parsed.reasonCode);
    process.exit(1);
  }

  const outcome = await runM3_3HvH4A3PhaseAPreflightV1({
    databaseUrl: parsed.config.databaseUrl,
    roleNames: parsed.config.roleNames,
  });

  if (!outcome.ok) {
    console.error('PHASE_A_PREFLIGHT_ERROR', outcome.reasonCode);
    process.exit(2);
  }

  const report = outcome.report;
  console.log('PHASE_A_PREFLIGHT_SUMMARY');
  for (const line of report.summary) {
    console.log(line);
  }
  console.log('PHASE_A_EXECUTION_COMPLETE=%s', report.phaseAExecutionComplete ? 'YES' : 'NO');
  console.log('PHASE_B_CERTIFIED=%s', report.phaseBCertificationStatus);
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.phaseAExecutionComplete ? 0 : 3);
}

main().catch((error) => {
  console.error('PHASE_A_PREFLIGHT_FATAL', error instanceof Error ? error.message : 'UNKNOWN');
  process.exit(2);
});
