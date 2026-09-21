import { SHUTDOWN_ALTERNATOR_VOLTAGE_THRESHOLD_V } from '../shutdown-evidence/shutdown-evidence.constants';
import type { GeneralizedEvidenceFieldBundle } from './generalized-evidence.types';

export function isAlternatorVoltage(voltage: number): boolean {
  return voltage >= SHUTDOWN_ALTERNATOR_VOLTAGE_THRESHOLD_V;
}

export function isPlausibleLvVoltage(v: number | null | undefined): v is number {
  return v != null && v >= 9.0 && v <= 16.0;
}

export function isSpeedKnownAtRest(speedKmh: number | null | undefined): boolean {
  return speedKmh != null && speedKmh <= 0.5;
}

export function isChargingContextFromFields(fields: GeneralizedEvidenceFieldBundle): boolean {
  if (fields.isHvCharging || fields.isLvCharging) return true;
  if (fields.voltage != null && fields.voltage >= 13.25) return true;
  return false;
}
