/**
 * M3.3-HV-H4-A3.3-O2-R4.2B-P0 — offline production Phase-A operational readiness (NO production access).
 *
 * Validates GO/NO-GO authorization record, approval contract, target/TLS URL policy, and consumption store.
 * Does not instantiate PostgreSQL clients, does not consume approvals, does not execute Phase-A SQL.
 *
 * READY in the report means offline operational readiness PASS — not authorization to access production.
 */
import { evaluatePhaseAProductionOperationalReadinessV1 } from '../../src/modules/vehicle-intelligence/battery-health/hv-h4/m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-operational-readiness.v1';

function main(): void {
  const report = evaluatePhaseAProductionOperationalReadinessV1(process.env);
  console.log('PHASE_A_OPERATIONAL_READINESS_SUMMARY');
  console.log('decision=%s', report.decision);
  console.log('productionPhaseAExecuted=%s', report.productionPhaseAExecuted ? 'YES' : 'NO');
  console.log('productionNetworkAccessAttempted=%s', report.productionNetworkAccessAttempted ? 'YES' : 'NO');
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.decision === 'READY' ? 0 : 1);
}

main();
