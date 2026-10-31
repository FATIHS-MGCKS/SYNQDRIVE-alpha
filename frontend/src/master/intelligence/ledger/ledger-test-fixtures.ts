import type { MasterVsiSignalDetailDto } from '../vsi-master-intelligence-api.types';

/** Production-shaped Audi A4 engine_rpm excerpt (P0-a / dual-provenance tests). */
export const AUDI_ENGINE_RPM_SIGNAL: MasterVsiSignalDetailDto = {
  canonicalSignalKey: 'engine_rpm',
  providerNativeSignalName: 'powertrainCombustionEngineSpeed',
  declaredSupport: 'LISTED',
  empiricalObservation: 'NEVER_OBSERVED',
  qualityClassification: 'NEVER_OBSERVED',
  confidenceLevel: 'LOW',
  lastValidObservationAt: null,
  lastSourceTimestamp: null,
  lastProviderFetchAt: '2026-10-29T22:21:14.621Z',
  freshnessClassification: 'UNKNOWN',
  evidenceProvenance: ['VEHICLE_LATEST_STATE'],
  limitations: ['ICE_RPM_SNAPSHOT_ONLY_NOT_HISTORICAL_CADENCE'],
  powertrainApplicability: 'APPLICABLE',
  rpmCombinedEvidenceAvailabilityV1: 'PROVEN_HISTORICAL_ONLY',
  rpmCombinedEvidenceLimitationsV1: [],
  cadenceIntelligence: {
    provenance: ['CLICKHOUSE_TELEMETRY_HF_POINTS', 'CLICKHOUSE_TELEMETRY_HF_POINTS'],
    observedSampleCount: 2281,
  },
};

export const BEV_NOT_APPLICABLE_SIGNAL: MasterVsiSignalDetailDto = {
  canonicalSignalKey: 'engine_rpm',
  providerNativeSignalName: 'powertrainCombustionEngineSpeed',
  declaredSupport: 'NOT_LISTED',
  empiricalObservation: 'NOT_APPLICABLE',
  qualityClassification: null,
  confidenceLevel: null,
  lastValidObservationAt: null,
  lastSourceTimestamp: null,
  lastProviderFetchAt: '2026-10-29T22:21:14.621Z',
  freshnessClassification: null,
  evidenceProvenance: [],
  limitations: [],
  powertrainApplicability: 'NOT_APPLICABLE',
  rpmCombinedEvidenceAvailabilityV1: 'NOT_APPLICABLE',
  cadenceIntelligence: null,
};

export const UNKNOWN_APPLICABILITY_SIGNAL: MasterVsiSignalDetailDto = {
  canonicalSignalKey: 'lv_voltage',
  providerNativeSignalName: 'lowVoltageBatteryVoltage',
  declaredSupport: 'UNKNOWN',
  empiricalObservation: 'NEVER_OBSERVED',
  qualityClassification: 'UNKNOWN',
  confidenceLevel: null,
  lastValidObservationAt: null,
  lastSourceTimestamp: null,
  lastProviderFetchAt: null,
  freshnessClassification: 'UNKNOWN',
  evidenceProvenance: [],
  limitations: [],
  powertrainApplicability: 'UNKNOWN',
  cadenceIntelligence: null,
};

export const STALE_OBSERVATION_SIGNAL: MasterVsiSignalDetailDto = {
  canonicalSignalKey: 'vehicle_speed',
  providerNativeSignalName: 'speed',
  declaredSupport: 'LISTED',
  empiricalObservation: 'OBSERVED_STALE',
  qualityClassification: 'STALE_META',
  confidenceLevel: 'MEDIUM',
  lastValidObservationAt: '2026-09-01T12:00:00.000Z',
  lastSourceTimestamp: '2026-09-01T12:00:00.000Z',
  lastProviderFetchAt: '2026-10-29T22:21:14.621Z',
  freshnessClassification: 'STALE',
  evidenceProvenance: ['VEHICLE_LATEST_STATE'],
  limitations: [],
  powertrainApplicability: 'APPLICABLE',
  cadenceIntelligence: null,
};

export const ATTRIBUTION_LIMITED_RPM: MasterVsiSignalDetailDto = {
  ...AUDI_ENGINE_RPM_SIGNAL,
  rpmCombinedEvidenceAvailabilityV1: 'NOT_PROVEN',
  rpmCombinedEvidenceLimitationsV1: ['RPM_HF_SOURCE_LINK_ATTRIBUTION_UNPROVEN'],
};
