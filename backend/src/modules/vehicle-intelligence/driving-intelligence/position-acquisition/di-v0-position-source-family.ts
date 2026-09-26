import { SOURCE_FAMILY_POLICY_V0_1 } from '../core/versions';
import {
  hasUncertainHistoricalObdRecordTime,
  resolveTelemetrySourceFamily,
} from '../../telemetry-source-family';
import type { DiV0SourceFamilyResolution } from './di-v0-position-acquisition.types';

/**
 * DI consumes the canonical resolver owned by R1 temporal containment
 * (`vehicle-intelligence/telemetry-source-family.ts`); it does not re-implement it.
 */
export function resolveDiV0SourceFamily(dimoDeviceIdentity: unknown): DiV0SourceFamilyResolution {
  const sourceFamily = resolveTelemetrySourceFamily(dimoDeviceIdentity);
  return {
    sourceFamily,
    policyVersion: SOURCE_FAMILY_POLICY_V0_1,
    evidence: 'DIMO_DEVICE_IDENTITY',
    historicalObdRecordTimeUncertain: hasUncertainHistoricalObdRecordTime(sourceFamily),
    s1Supported: sourceFamily !== 'UNKNOWN',
  };
}
