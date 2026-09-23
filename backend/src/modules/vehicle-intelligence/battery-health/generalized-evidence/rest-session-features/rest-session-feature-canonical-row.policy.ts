import type { BatteryRestSessionFeature } from '@prisma/client';
import {
  BatteryRestSessionFeatureComputationPhase,
  BatteryRestSessionFeatureSessionTrust,
  BatteryRestSessionStatus,
} from '@prisma/client';
import { isActiveRestSessionStatus } from './rest-session-feature-session.policy';

export type CanonicalRestSessionFeatureRowPreference = {
  computationPhase: BatteryRestSessionFeatureComputationPhase;
  sessionTrust: BatteryRestSessionFeatureSessionTrust;
};

export function resolveCanonicalRestSessionFeatureRowPreference(input: {
  sessionStatus: BatteryRestSessionStatus;
  endReason: string | null;
}): CanonicalRestSessionFeatureRowPreference {
  if (
    input.sessionStatus === BatteryRestSessionStatus.INVALIDATED ||
    input.endReason === 'INVALIDATED'
  ) {
    return {
      computationPhase: BatteryRestSessionFeatureComputationPhase.FINAL,
      sessionTrust: BatteryRestSessionFeatureSessionTrust.INVALIDATED,
    };
  }
  if (isActiveRestSessionStatus(input.sessionStatus)) {
    return {
      computationPhase: BatteryRestSessionFeatureComputationPhase.INCREMENTAL,
      sessionTrust: BatteryRestSessionFeatureSessionTrust.VALID,
    };
  }
  return {
    computationPhase: BatteryRestSessionFeatureComputationPhase.FINAL,
    sessionTrust: BatteryRestSessionFeatureSessionTrust.VALID,
  };
}

const FALLBACK_PHASE_ORDER: BatteryRestSessionFeatureComputationPhase[] = [
  BatteryRestSessionFeatureComputationPhase.INCREMENTAL,
  BatteryRestSessionFeatureComputationPhase.FINAL,
];

const FALLBACK_TRUST_ORDER: BatteryRestSessionFeatureSessionTrust[] = [
  BatteryRestSessionFeatureSessionTrust.VALID,
  BatteryRestSessionFeatureSessionTrust.INVALIDATED,
];

function pickHighestRevision(
  rows: BatteryRestSessionFeature[],
): BatteryRestSessionFeature | null {
  if (rows.length === 0) return null;
  return [...rows].sort((a, b) => b.semanticRevision - a.semanticRevision)[0];
}

export function selectCanonicalRestSessionFeatureShadowRow(input: {
  sessionStatus: BatteryRestSessionStatus;
  endReason: string | null;
  rows: BatteryRestSessionFeature[];
}): BatteryRestSessionFeature | null {
  const preference = resolveCanonicalRestSessionFeatureRowPreference(input);
  const exact = input.rows.filter(
    (row) =>
      row.computationPhase === preference.computationPhase &&
      row.sessionTrust === preference.sessionTrust,
  );
  const exactPick = pickHighestRevision(exact);
  if (exactPick) return exactPick;

  for (const phase of FALLBACK_PHASE_ORDER) {
    for (const trust of FALLBACK_TRUST_ORDER) {
      const fallback = input.rows.filter(
        (row) => row.computationPhase === phase && row.sessionTrust === trust,
      );
      const pick = pickHighestRevision(fallback);
      if (pick) return pick;
    }
  }

  return pickHighestRevision(input.rows);
}
