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

function alternateTrust(
  trust: BatteryRestSessionFeatureSessionTrust,
): BatteryRestSessionFeatureSessionTrust {
  return trust === BatteryRestSessionFeatureSessionTrust.VALID
    ? BatteryRestSessionFeatureSessionTrust.INVALIDATED
    : BatteryRestSessionFeatureSessionTrust.VALID;
}

function alternatePhase(
  phase: BatteryRestSessionFeatureComputationPhase,
): BatteryRestSessionFeatureComputationPhase {
  return phase === BatteryRestSessionFeatureComputationPhase.INCREMENTAL
    ? BatteryRestSessionFeatureComputationPhase.FINAL
    : BatteryRestSessionFeatureComputationPhase.INCREMENTAL;
}

function pickHighestRevision(
  rows: BatteryRestSessionFeature[],
): BatteryRestSessionFeature | null {
  if (rows.length === 0) return null;
  return [...rows].sort((a, b) => b.semanticRevision - a.semanticRevision)[0];
}

function pickForPhaseTrust(
  rows: BatteryRestSessionFeature[],
  phase: BatteryRestSessionFeatureComputationPhase,
  trust: BatteryRestSessionFeatureSessionTrust,
): BatteryRestSessionFeature | null {
  return pickHighestRevision(
    rows.filter((row) => row.computationPhase === phase && row.sessionTrust === trust),
  );
}

export function selectCanonicalRestSessionFeatureShadowRow(input: {
  sessionStatus: BatteryRestSessionStatus;
  endReason: string | null;
  rows: BatteryRestSessionFeature[];
}): BatteryRestSessionFeature | null {
  const preference = resolveCanonicalRestSessionFeatureRowPreference(input);
  const altTrust = alternateTrust(preference.sessionTrust);
  const altPhase = alternatePhase(preference.computationPhase);

  const categories: Array<{
    phase: BatteryRestSessionFeatureComputationPhase;
    trust: BatteryRestSessionFeatureSessionTrust;
  }> = [
    { phase: preference.computationPhase, trust: preference.sessionTrust },
    { phase: preference.computationPhase, trust: altTrust },
    { phase: altPhase, trust: preference.sessionTrust },
    { phase: altPhase, trust: altTrust },
  ];

  for (const category of categories) {
    const pick = pickForPhaseTrust(input.rows, category.phase, category.trust);
    if (pick) return pick;
  }

  return pickHighestRevision(input.rows);
}
