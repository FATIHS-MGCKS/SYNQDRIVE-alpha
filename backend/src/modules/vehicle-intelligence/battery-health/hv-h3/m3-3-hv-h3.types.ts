import { BatteryMeasurementScope } from '../battery-v2-domain';
import {
  M3_3_HV_H3_ESTIMATOR_VERSION,
  M3_3_HV_H3_EXPOSURE_AXIS,
  M3_3_HV_H3_LONGITUDINAL_TREND_REPORT_V1,
  M3_3_HV_H3_METHOD_TREND_V1,
  M3_3_HV_H3_TREND_POINT_V1,
} from './m3-3-hv-h3.constants';
import type { M3_3HvH2LongitudinalInputReportV1 } from '../hv-h2/m3-3-hv-h2.types';

export const M3_3_HV_H3_SCIENTIFIC_ROLES = [
  'PRIMARY_METHOD_EVIDENCE',
  'VALIDATION_ONLY',
  'PROVIDER_OBSERVATIONAL',
] as const;

export type M3_3HvH3ScientificRole = (typeof M3_3_HV_H3_SCIENTIFIC_ROLES)[number];

export const M3_3_HV_H3_TREND_AVAILABILITY = [
  'NO_DATA',
  'INSUFFICIENT_DISTINCT_TIMEPOINTS',
  'DESCRIPTIVE_SLOPE_AVAILABLE',
  'SERIES_TOO_LARGE_FOR_V1_ESTIMATOR',
] as const;

export type M3_3HvH3TrendAvailability = (typeof M3_3_HV_H3_TREND_AVAILABILITY)[number];

export const M3_3_HV_H3_SOURCE_COMPLETENESS = [
  'COMPLETE_WITHIN_H2_CONTRACT',
  'TRUNCATED',
] as const;

export type M3_3HvH3SourceCompleteness =
  (typeof M3_3_HV_H3_SOURCE_COMPLETENESS)[number];

export interface M3_3HvH3ExposureAxisAuditEntryV1 {
  availability: 'AVAILABLE' | 'PARTIAL' | 'NOT_AVAILABLE';
  durableAuthority: boolean;
  lifecycleComplete: boolean;
  h3V1Used: boolean;
  reason: string;
  source: string | null;
}

export interface M3_3HvH3ExposureAxisAuditV1 {
  calendarTime: M3_3HvH3ExposureAxisAuditEntryV1;
  odometer: M3_3HvH3ExposureAxisAuditEntryV1;
  cumulativeChargeThroughput: M3_3HvH3ExposureAxisAuditEntryV1;
  fullEquivalentCycles: M3_3HvH3ExposureAxisAuditEntryV1;
  temperatureExposure: M3_3HvH3ExposureAxisAuditEntryV1;
  fastChargeExposure: M3_3HvH3ExposureAxisAuditEntryV1;
  socWindowExposure: M3_3HvH3ExposureAxisAuditEntryV1;
}

export interface M3_3HvH3TrendPointV1 {
  contractVersion: typeof M3_3_HV_H3_TREND_POINT_V1;
  organizationId: string;
  vehicleId: string;
  batteryScope: typeof BatteryMeasurementScope.HV;
  lifecycleSegmentId: string;
  method: string;
  methodRole: string;
  valueSemantic: string;
  unit: string;
  seriesPartitionKey: string;
  pointId: string;
  pointFingerprint: string;
  observedAt: string;
  numericValue: number;
  aggregationKind: string;
  sourceCandidateFingerprints: string[];
  sourceCandidateCount: number;
  sessionId: string | null;
  provider: string | null;
  evidenceStrength: string;
  scientificRole: M3_3HvH3ScientificRole;
  modelVersion: number | null;
}

export interface M3_3HvH3MethodTrendSeriesV1 {
  contractVersion: typeof M3_3_HV_H3_METHOD_TREND_V1;
  seriesFingerprint: string;
  lifecycleSegmentId: string;
  method: string;
  methodRole: string;
  valueSemantic: string;
  unit: string;
  modelVersion: number | null;
  provider: string | null;
  scientificRole: M3_3HvH3ScientificRole;
  aggregationKind: string;
  seriesPartitionKey: string;
  pointCount: number;
  distinctTimestampCount: number;
  pairwiseSlopeCount: number;
  timeSpanDays: number;
  medianValue: number | null;
  minValue: number | null;
  maxValue: number | null;
  trendAvailability: M3_3HvH3TrendAvailability;
  trendSlopePerDay: number | null;
  trendIntercept: number | null;
  fittedAtSeriesStart: number | null;
  fittedAtSeriesEnd: number | null;
  residualMedian: number | null;
  residualMad: number | null;
  medianAbsoluteStepChange: number | null;
  sourceCandidateCount: number;
  sourcePointFingerprints: string[];
  trendPoints: M3_3HvH3TrendPointV1[];
  sourceCompleteness: M3_3HvH3SourceCompleteness;
  scientificTrendEligible: boolean;
  primaryTrendEligible: boolean;
  trendDirectionConclusion: null;
  degradationConclusion: null;
}

export interface M3_3HvH3LifecycleSegmentTrendsV1 {
  lifecycleSegmentId: string;
  methodSeries: M3_3HvH3MethodTrendSeriesV1[];
}

export interface M3_3HvH3ValidationContextV1 {
  groundTruthEventId: string;
  groundTruthType: string;
  effectiveAt: string;
  verificationStatusAtEvaluationAt: string;
  maturity: string;
}

export interface M3_3HvH3MethodAgreementSessionV1 {
  sessionId: string;
  lifecycleSegmentId: string;
  m2SessionMedianKwh: number | null;
  m3PointKwh: number | null;
  absoluteDifferenceKwh: number | null;
  relativeDifferenceRatio: number | null;
}

export interface M3_3HvH3MethodAgreementDiagnosticsV1 {
  pairedSessionCount: number;
  sessions: M3_3HvH3MethodAgreementSessionV1[];
  medianAbsoluteDifferenceKwh: number | null;
  medianRelativeDifferenceRatio: number | null;
}

export interface M3_3HvH3LongitudinalTrendReportV1 {
  contractVersion: typeof M3_3_HV_H3_LONGITUDINAL_TREND_REPORT_V1;
  organizationId: string;
  vehicleId: string;
  batteryScope: typeof BatteryMeasurementScope.HV;
  evaluationAt: string;
  inheritedTemporalSemantics: string;
  sourceH2ContractVersion: string;
  sourceH2Truncated: boolean;
  estimatorVersion: typeof M3_3_HV_H3_ESTIMATOR_VERSION;
  exposureAxis: typeof M3_3_HV_H3_EXPOSURE_AXIS;
  exposureAxisAudit: M3_3HvH3ExposureAxisAuditV1;
  lifecycleSegments: M3_3HvH3LifecycleSegmentTrendsV1[];
  validationContext: M3_3HvH3ValidationContextV1[];
  methodAgreementDiagnostics: M3_3HvH3MethodAgreementDiagnosticsV1;
  legacyDerivedContext: { kind: string; note: string }[];
  sourceCompleteness: M3_3HvH3SourceCompleteness;
  methodIdentityRequired: true;
  crossMethodPoolingDefault: false;
  crossProviderPoolingDefault: false;
  trendDirectionConclusion: null;
  degradationConclusion: null;
  healthConclusion: null;
  groundTruthValidated: false;
  customerPublicationEligible: false;
}

export type M3_3HvH3BuildInput = {
  h2Report: M3_3HvH2LongitudinalInputReportV1;
  maxPointsPerSeries?: number;
};
