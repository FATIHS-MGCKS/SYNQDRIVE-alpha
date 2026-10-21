import {
  BatteryRestSessionEndReason,
  BatteryRestSessionFeatureComputationPhase,
  BatteryRestSessionFeatureSessionTrust,
  BatteryRestSessionStatus,
} from '@prisma/client';

export function mapRestSessionComputationPhase(
  sessionStatus: BatteryRestSessionStatus,
): BatteryRestSessionFeatureComputationPhase {
  switch (sessionStatus) {
    case BatteryRestSessionStatus.CANDIDATE:
    case BatteryRestSessionStatus.CONFIRMED:
    case BatteryRestSessionStatus.RESTING:
      return BatteryRestSessionFeatureComputationPhase.INCREMENTAL;
    case BatteryRestSessionStatus.ENDED:
    case BatteryRestSessionStatus.INVALIDATED:
      return BatteryRestSessionFeatureComputationPhase.FINAL;
    default: {
      const _exhaustive: never = sessionStatus;
      return _exhaustive;
    }
  }
}

export function mapRestSessionFeatureTrust(input: {
  sessionStatus: BatteryRestSessionStatus;
  endReason: BatteryRestSessionEndReason | null;
}): BatteryRestSessionFeatureSessionTrust {
  if (
    input.sessionStatus === BatteryRestSessionStatus.INVALIDATED ||
    input.endReason === BatteryRestSessionEndReason.INVALIDATED
  ) {
    return BatteryRestSessionFeatureSessionTrust.INVALIDATED;
  }
  return BatteryRestSessionFeatureSessionTrust.VALID;
}

export function isActiveRestSessionStatus(sessionStatus: BatteryRestSessionStatus): boolean {
  return (
    sessionStatus === BatteryRestSessionStatus.CANDIDATE ||
    sessionStatus === BatteryRestSessionStatus.CONFIRMED ||
    sessionStatus === BatteryRestSessionStatus.RESTING
  );
}
