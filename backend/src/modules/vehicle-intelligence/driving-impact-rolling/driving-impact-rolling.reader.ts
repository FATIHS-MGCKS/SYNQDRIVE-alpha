import type { DrivingImpactRollingWindowManifest } from './driving-impact-rolling.types';
import { DRIVING_IMPACT_ROLLING_VERSION } from './driving-impact-rolling.types';

export function readVehicleDrivingImpactRollingWindow(
  rollingWindowJson: unknown,
): DrivingImpactRollingWindowManifest | null {
  if (rollingWindowJson == null || typeof rollingWindowJson !== 'object') {
    return null;
  }
  const raw = rollingWindowJson as Partial<DrivingImpactRollingWindowManifest>;
  if (raw.version !== DRIVING_IMPACT_ROLLING_VERSION) {
    return null;
  }
  return raw as DrivingImpactRollingWindowManifest;
}
