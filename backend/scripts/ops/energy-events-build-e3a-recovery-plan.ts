/**
 * PRIVATE OPS ONLY — build an event-specific E3A recovery plan from secured evidence.
 *
 * Reads a private manual-review evidence JSON (from energy-events-manual-review-evidence.ts)
 * and emits a recovery plan JSON suitable for ENERGY_EVENTS_RECOVERY_PLAN_PATH.
 *
 * Human decisions are explicit input — this script does not infer canonical dispositions
 * from telemetry heuristics alone. Pass APPROVE/EXCLUDE per caseId via env:
 *   E3A_CASE_A_DISPOSITION=EXCLUDE_FROM_BACKFILL
 *   E3A_CASE_B_DISPOSITION=EXCLUDE_FROM_BACKFILL
 *
 * Output must remain on secured infrastructure only.
 */
import * as fs from 'fs';
import * as path from 'path';

import { parseEnergyEventsRecoveryPlan } from '../../src/modules/vehicle-intelligence/energy-events/energy-events-recovery-plan';

interface EvidenceInvestigation {
  caseId: string;
  dimoSegmentId: string;
  mechanism: 'refuel' | 'recharge';
  analysis: {
    suggestedDisposition: 'APPROVE_FOR_BACKFILL' | 'EXCLUDE_FROM_BACKFILL';
    evidenceCategory: string;
  };
}

interface EvidencePayload {
  investigations: EvidenceInvestigation[];
}

const CASE_DISPOSITION_ENV: Record<string, string | undefined> = {
  ICE_A_CASE_A: process.env.E3A_CASE_A_DISPOSITION,
  ICE_A_CASE_B: process.env.E3A_CASE_B_DISPOSITION,
};

const CASE_EVIDENCE_CATEGORY: Record<string, string> = {
  ICE_A_CASE_A:
    'continuous_driving_irreconcilable_fuel_signals_no_stationary_refuel',
  ICE_A_CASE_B:
    'dimo_segment_padding_unsustained_micro_fuel_bump_during_driving',
};

function resolveDisposition(
  investigation: EvidenceInvestigation,
): 'APPROVE_FOR_BACKFILL' | 'EXCLUDE_FROM_BACKFILL' {
  const fromEnv = CASE_DISPOSITION_ENV[investigation.caseId];
  if (fromEnv === 'APPROVE_FOR_BACKFILL' || fromEnv === 'EXCLUDE_FROM_BACKFILL') {
    return fromEnv;
  }
  return investigation.analysis.suggestedDisposition;
}

function main() {
  const evidencePath = process.env.ENERGY_EVENTS_MANUAL_REVIEW_EVIDENCE_PATH?.trim();
  const outPath =
    process.env.ENERGY_EVENTS_RECOVERY_PLAN_OUTPUT_PATH?.trim() ??
    '/tmp/e3a-manual-review/recovery-plan.json';

  if (!evidencePath) {
    console.error('Set ENERGY_EVENTS_MANUAL_REVIEW_EVIDENCE_PATH to private evidence JSON');
    process.exit(1);
  }

  const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8')) as EvidencePayload;
  const plan = parseEnergyEventsRecoveryPlan({
    planVersion: 'e3a-2026-08',
    reviewProvenance: 'secured-production-telemetry-inspection-2026-08-28',
    reviewedDispositions: evidence.investigations.map((investigation) => ({
      dimoSegmentId: investigation.dimoSegmentId,
      mechanism: investigation.mechanism,
      disposition: resolveDisposition(investigation),
      evidenceCategory:
        CASE_EVIDENCE_CATEGORY[investigation.caseId] ??
        investigation.analysis.evidenceCategory,
      reviewedAt: new Date().toISOString(),
    })),
  });

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(plan, null, 2));
  console.error(`[recovery-plan] Wrote ${plan.reviewedDispositions.length} reviewed dispositions to ${outPath}`);
  console.log(JSON.stringify({ planVersion: plan.planVersion, reviewedDispositionCount: plan.reviewedDispositions.length }, null, 2));
}

main();
