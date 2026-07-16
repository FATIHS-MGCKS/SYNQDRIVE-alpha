import type { DrivingImpactModelProfileManifest } from './driving-impact-model-profile.types';
import { DRIVING_IMPACT_MODEL_PROFILE_VERSION } from './driving-impact-model-profile.types';

type SourceSummaryJson = {
  modelProfile?: Partial<DrivingImpactModelProfileManifest> & { version?: string };
};

/**
 * Read model profile manifest from persisted sourceSummaryJson (legacy-safe).
 */
export function readTripDrivingImpactModelProfile(
  sourceSummaryJson: unknown,
): DrivingImpactModelProfileManifest | null {
  if (sourceSummaryJson == null || typeof sourceSummaryJson !== 'object') {
    return null;
  }
  const raw = (sourceSummaryJson as SourceSummaryJson).modelProfile;
  if (!raw || typeof raw !== 'object' || typeof raw.profile !== 'string') {
    return null;
  }
  return {
    version: DRIVING_IMPACT_MODEL_PROFILE_VERSION,
    profile: raw.profile as DrivingImpactModelProfileManifest['profile'],
    comparabilityGroup:
      raw.comparabilityGroup as DrivingImpactModelProfileManifest['comparabilityGroup'],
    behavioralIngestionPath:
      raw.behavioralIngestionPath as DrivingImpactModelProfileManifest['behavioralIngestionPath'],
    nativeEventCapable: raw.nativeEventCapable === true,
    engineContextCapable: raw.engineContextCapable === true,
    availableStressComponents: Array.isArray(raw.availableStressComponents)
      ? (raw.availableStressComponents as DrivingImpactModelProfileManifest['availableStressComponents'])
      : [],
    availableLoadComponents: Array.isArray(raw.availableLoadComponents)
      ? (raw.availableLoadComponents as DrivingImpactModelProfileManifest['availableLoadComponents'])
      : [],
    crossFleetComparableProfiles: Array.isArray(raw.crossFleetComparableProfiles)
      ? (raw.crossFleetComparableProfiles as DrivingImpactModelProfileManifest['crossFleetComparableProfiles'])
      : [],
    comparabilityHint: typeof raw.comparabilityHint === 'string' ? raw.comparabilityHint : '',
    gatingApplied: raw.gatingApplied === true,
    reasonCodes: Array.isArray(raw.reasonCodes)
      ? (raw.reasonCodes as DrivingImpactModelProfileManifest['reasonCodes'])
      : [],
  };
}
