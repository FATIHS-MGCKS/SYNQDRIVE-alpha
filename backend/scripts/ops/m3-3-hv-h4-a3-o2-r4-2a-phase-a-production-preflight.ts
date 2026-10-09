/**
 * M3.3-HV-H4-A3.3-O2-R4.2A — authorized production Phase-A read-only preflight (preparation slice).
 *
 * Default DENY. Requires documented human approval record + deliberate execute ack + one-time consumption.
 * NOT invoked against production in this repository slice — operators follow the runbook when authorized.
 */
import { parseM3_3HvH4A3PhaseAProductionPreflightConfigFromEnvV1 } from '../../src/modules/vehicle-intelligence/battery-health/hv-h4/m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-config.v1';
import { runM3_3HvH4A3PhaseAPreflightV1 } from '../../src/modules/vehicle-intelligence/battery-health/hv-h4/m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.runner.v1';

async function main(): Promise<void> {
  const parsed = parseM3_3HvH4A3PhaseAProductionPreflightConfigFromEnvV1(process.env, {
    consumeApproval: false,
  });
  if (!parsed.ok) {
    console.error('PHASE_A_PRODUCTION_PREFLIGHT_BLOCKED', parsed.reasonCode);
    process.exit(1);
  }

  const outcome = await runM3_3HvH4A3PhaseAPreflightV1({
    databaseUrl: parsed.config.databaseUrl,
    roleNames: parsed.config.roleNames,
    admissionPolicy: 'PRODUCTION_AUTHORIZED_R4_2A',
  });

  if (!outcome.ok) {
    console.error('PHASE_A_PRODUCTION_PREFLIGHT_ERROR', outcome.reasonCode);
    process.exit(2);
  }

  const report = outcome.report;
  console.log('PHASE_A_PRODUCTION_PREFLIGHT_SUMMARY');
  for (const line of report.summary) {
    console.log(line);
  }
  console.log('PHASE_A_EXECUTION_COMPLETE=%s', report.phaseAExecutionComplete ? 'YES' : 'NO');
  console.log('PHASE_B_CERTIFIED=%s', report.phaseBCertificationStatus);
  console.log('PRODUCTION_CERTIFICATION=%s', report.productionCertification);
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.phaseAExecutionComplete ? 0 : 3);
}

main().catch(() => {
  console.error('PHASE_A_PRODUCTION_PREFLIGHT_FATAL', 'PHASE_A_RUNNER_FAILED');
  process.exit(2);
});
