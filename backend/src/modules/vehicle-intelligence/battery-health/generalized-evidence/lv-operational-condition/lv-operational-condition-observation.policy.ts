import { BatteryGeneralizedEvidenceClass } from '@prisma/client';
import type { LvOperationalConditionObservationV1 } from './lv-operational-condition-v1.types';

const REST_WAKE = BatteryGeneralizedEvidenceClass.REST_WAKE_VOLTAGE;

export function isEligibleRestObservationForConditionV1(
  obs: LvOperationalConditionObservationV1,
): boolean {
  if (obs.operationalContext === 'CHARGING' || obs.isLvCharging === true) {
    return false;
  }
  if (obs.operationalContext === 'DRIVING' || obs.engineRunning === true) {
    return false;
  }
  if (obs.operationalContext !== 'REST') {
    return false;
  }
  if (!Number.isFinite(obs.voltageV) || obs.voltageV < 9 || obs.voltageV > 16) {
    return false;
  }
  return true;
}

export function isWakeStartabilityObservationV1(obs: LvOperationalConditionObservationV1): boolean {
  return obs.evidenceClass === REST_WAKE;
}

export function medianRestVoltageMv(observations: LvOperationalConditionObservationV1[]): number | null {
  if (observations.length === 0) return null;
  const sorted = observations.map((o) => o.voltageV * 1000).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}
