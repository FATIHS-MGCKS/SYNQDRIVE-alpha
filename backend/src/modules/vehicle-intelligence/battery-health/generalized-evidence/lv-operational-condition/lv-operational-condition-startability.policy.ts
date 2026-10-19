import { BatteryGeneralizedEvidenceClass } from '@prisma/client';
import {
  classifyCrankDrop,
  type BatteryHealthStatus,
} from '../../battery-status';
import { sanitizeStartProxyVoltages } from '../../lv-start-proxy/battery-start-proxy.policy';
import type {
  LvOperationalConditionObservationV1,
  LvOperationalConditionReasonCodeV1,
  LvOperationalConditionStatusV1,
  LvOperationalCrankEvidenceV1,
} from './lv-operational-condition-v1.types';

const REST_WAKE = BatteryGeneralizedEvidenceClass.REST_WAKE_VOLTAGE;

function mapCrankBandToStartability(
  band: BatteryHealthStatus,
): LvOperationalConditionStatusV1 {
  switch (band) {
    case 'GOOD':
      return 'GREEN';
    case 'WATCH':
    case 'WARNING':
      return 'YELLOW';
    case 'CRITICAL':
      return 'RED';
    default:
      return 'UNKNOWN';
  }
}

/**
 * P1.1: GE evidence classes (REST / REST_WAKE / ENGINE_OFF / DRIVING) are never sufficient
 * for positive startability. Requires timestamp-aligned crank/load voltage from battery_features.
 */
export function hasValidatedStartabilityCrankEvidenceV1(
  crank: LvOperationalCrankEvidenceV1 | null | undefined,
): boolean {
  if (!crank) return false;

  const sanitized = sanitizeStartProxyVoltages({
    vPreCrank: crank.vPreCrankV,
    vMinCrank: crank.vMinCrankV,
    vRecovery5s: crank.vRecovery5sV,
    vRecovery30s: crank.vRecovery30sV,
  });
  if (sanitized.vPreCrank == null || sanitized.vMinCrank == null) {
    return false;
  }

  const drop =
    crank.crankDropV != null && Number.isFinite(crank.crankDropV)
      ? crank.crankDropV
      : sanitized.vPreCrank - sanitized.vMinCrank;
  if (!Number.isFinite(drop) || drop < 0 || drop > 6) {
    return false;
  }

  if (crank.crankAtIso == null && crank.crankObservationCount < 1) {
    return false;
  }

  return true;
}

export function evaluateStartabilityV1(input: {
  observations: LvOperationalConditionObservationV1[];
  crankEvidence: LvOperationalCrankEvidenceV1 | null;
}): {
  status: LvOperationalConditionStatusV1;
  crankDropBand: BatteryHealthStatus | 'UNKNOWN';
  reasonCodes: LvOperationalConditionReasonCodeV1[];
} {
  const wakes = input.observations.filter((o) => o.evidenceClass === REST_WAKE);

  if (hasValidatedStartabilityCrankEvidenceV1(input.crankEvidence)) {
    const crank = input.crankEvidence!;
    const sanitized = sanitizeStartProxyVoltages({
      vPreCrank: crank.vPreCrankV,
      vMinCrank: crank.vMinCrankV,
      vRecovery5s: crank.vRecovery5sV,
      vRecovery30s: crank.vRecovery30sV,
    });
    const drop =
      crank.crankDropV != null && Number.isFinite(crank.crankDropV)
        ? crank.crankDropV
        : (sanitized.vPreCrank ?? 0) - (sanitized.vMinCrank ?? 0);
    const band = classifyCrankDrop(drop);
    return {
      status: mapCrankBandToStartability(band),
      crankDropBand: band,
      reasonCodes: ['STARTABILITY_CRANK_EVIDENCE_VALIDATED'],
    };
  }

  const reasonCodes: LvOperationalConditionReasonCodeV1[] = [];
  if (wakes.length === 0) {
    reasonCodes.push('STARTABILITY_NOT_OBSERVED');
  } else {
    reasonCodes.push('STARTABILITY_GE_SEQUENCE_NOT_CRANK_PROOF');
    reasonCodes.push('STARTABILITY_WAKE_WITHOUT_VALIDATED_SIGNATURE');
  }
  if (input.crankEvidence == null || input.crankEvidence.crankObservationCount === 0) {
    reasonCodes.push('STARTABILITY_MISSING_CRANK_LOAD_EVIDENCE');
  }

  return {
    status: 'UNKNOWN',
    crankDropBand: 'UNKNOWN',
    reasonCodes: [...new Set(reasonCodes)],
  };
}
