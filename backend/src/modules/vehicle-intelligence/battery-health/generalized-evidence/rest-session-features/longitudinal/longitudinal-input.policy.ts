import {
  BatteryRestSessionFeatureComputationPhase,
  BatteryRestSessionFeatureSessionTrust,
  BatteryRestSessionStatus,
  type BatteryRestSession,
  type BatteryRestSessionFeature,
} from '@prisma/client';
import { isActiveRestSessionStatus } from '../rest-session-feature-session.policy';
import type {
  LongitudinalInputExclusionReason,
  LongitudinalInputInclusionMode,
  LongitudinalInputQuality,
} from './longitudinal-input.types';

const EXCLUSION_ORDER: LongitudinalInputExclusionReason[] = [
  'NO_CANONICAL_ROW',
  'SESSION_INVALIDATED',
  'SESSION_TRUST_INVALIDATED',
  'INPUT_CONTRACT_VERSION_UNRESOLVED',
];

function sortExclusionReasons(
  reasons: LongitudinalInputExclusionReason[],
): LongitudinalInputExclusionReason[] {
  const set = new Set(reasons);
  return EXCLUSION_ORDER.filter((reason) => set.has(reason));
}

export function classifyLongitudinalInputInclusion(input: {
  session: Pick<BatteryRestSession, 'sessionStatus'>;
  canonicalRow: BatteryRestSessionFeature | null;
  inputContractResolved: boolean;
}): LongitudinalInputQuality {
  const exclusionReasons: LongitudinalInputExclusionReason[] = [];

  if (!input.canonicalRow) {
    exclusionReasons.push('NO_CANONICAL_ROW');
  }

  if (input.session.sessionStatus === BatteryRestSessionStatus.INVALIDATED) {
    exclusionReasons.push('SESSION_INVALIDATED');
  }

  if (
    input.canonicalRow?.sessionTrust === BatteryRestSessionFeatureSessionTrust.INVALIDATED
  ) {
    exclusionReasons.push('SESSION_TRUST_INVALIDATED');
  }

  if (!input.inputContractResolved) {
    exclusionReasons.push('INPUT_CONTRACT_VERSION_UNRESOLVED');
  }

  if (exclusionReasons.length > 0) {
    return {
      inclusionMode: 'EXCLUDED',
      exclusionReasons: sortExclusionReasons(exclusionReasons),
      perSessionInspectionStatus: 'NOT_EVALUATED',
    };
  }

  const row = input.canonicalRow!;
  const active = isActiveRestSessionStatus(input.session.sessionStatus);
  const incremental =
    row.computationPhase === BatteryRestSessionFeatureComputationPhase.INCREMENTAL;

  if (
    active &&
    incremental &&
    row.sessionTrust === BatteryRestSessionFeatureSessionTrust.VALID
  ) {
    return {
      inclusionMode: 'PROVISIONAL',
      exclusionReasons: [],
      perSessionInspectionStatus: 'NOT_EVALUATED',
    };
  }

  if (
    input.session.sessionStatus === BatteryRestSessionStatus.ENDED &&
    incremental
  ) {
    return {
      inclusionMode: 'PROVISIONAL',
      exclusionReasons: [],
      perSessionInspectionStatus: 'NOT_EVALUATED',
    };
  }

  return {
    inclusionMode: 'DEFAULT',
    exclusionReasons: [],
    perSessionInspectionStatus: 'NOT_EVALUATED',
  };
}
