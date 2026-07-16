import type { TripDrivingImpact } from '@prisma/client';
import type {
  DrivingImpactHealthEligibility,
  DrivingImpactPrimarySource,
  DrivingImpactProvenanceMaturity,
  DrivingImpactSourceProvenance,
} from './driving-impact-provenance';
import {
  DRIVING_IMPACT_PROVENANCE_VERSION,
  resolvePrimarySource,
} from './driving-impact-provenance';

type LegacySourceSummary = {
  v3DrivingEventInput?: string;
  vehicleHardwareType?: string;
  primarySource?: string;
};

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asInt(value: unknown): number | null {
  const n = asNumber(value);
  return n != null ? Math.trunc(n) : null;
}

function parseLegacySummary(json: unknown): LegacySourceSummary {
  if (!json || typeof json !== 'object') return {};
  return json as LegacySourceSummary;
}

function legacyPrimarySource(summary: LegacySourceSummary): DrivingImpactPrimarySource {
  if (summary.primarySource === 'PROVIDER_CLASSIFIED') return 'PROVIDER_CLASSIFIED';
  if (summary.primarySource === 'RECONSTRUCTED') return 'RECONSTRUCTED';
  if (summary.primarySource === 'MIXED') return 'MIXED';
  if (summary.v3DrivingEventInput === 'TELEMETRY_EVENTS') return 'PROVIDER_CLASSIFIED';
  if (summary.v3DrivingEventInput === 'HF_DERIVED') return 'RECONSTRUCTED';
  return 'STRESS_ONLY';
}

function legacyShares(
  primary: DrivingImpactPrimarySource,
): Pick<
  DrivingImpactSourceProvenance,
  | 'measuredShare'
  | 'providerClassifiedShare'
  | 'reconstructedShare'
  | 'estimatedProxyShare'
  | 'contextOnlyShare'
> {
  switch (primary) {
    case 'PROVIDER_CLASSIFIED':
      return {
        measuredShare: 0,
        providerClassifiedShare: 1,
        reconstructedShare: 0,
        estimatedProxyShare: 0,
        contextOnlyShare: 0,
      };
    case 'RECONSTRUCTED':
      return {
        measuredShare: 0,
        providerClassifiedShare: 0,
        reconstructedShare: 1,
        estimatedProxyShare: 0,
        contextOnlyShare: 0,
      };
    case 'MIXED':
      return {
        measuredShare: 0,
        providerClassifiedShare: 0.5,
        reconstructedShare: 0.5,
        estimatedProxyShare: 0,
        contextOnlyShare: 0,
      };
    default:
      return {
        measuredShare: 0,
        providerClassifiedShare: 0,
        reconstructedShare: 0,
        estimatedProxyShare: 0,
        contextOnlyShare: 1,
      };
  }
}

/** Read provenance from a trip impact row — new columns or legacy `sourceSummaryJson` fallback. */
export function readTripDrivingImpactProvenance(
  row: Pick<
    TripDrivingImpact,
    | 'modelVersion'
    | 'sourceSummaryJson'
    | 'primarySource'
    | 'measuredShare'
    | 'providerClassifiedShare'
    | 'reconstructedShare'
    | 'estimatedProxyShare'
    | 'contextOnlyShare'
    | 'nativeEventCount'
    | 'hfEventCount'
    | 'measurementCoverage'
    | 'hardwareProfile'
    | 'capabilityVersion'
    | 'healthEligibility'
    | 'provenanceMaturity'
    | 'provenanceVersion'
  >,
): DrivingImpactSourceProvenance {
  if (row.primarySource && row.provenanceVersion) {
    return {
      primarySource: row.primarySource as DrivingImpactPrimarySource,
      measuredShare: row.measuredShare ?? 0,
      providerClassifiedShare: row.providerClassifiedShare ?? 0,
      reconstructedShare: row.reconstructedShare ?? 0,
      estimatedProxyShare: row.estimatedProxyShare ?? 0,
      contextOnlyShare: row.contextOnlyShare ?? 0,
      nativeEventCount: row.nativeEventCount ?? 0,
      hfEventCount: row.hfEventCount ?? 0,
      measurementCoverage: row.measurementCoverage,
      hardwareProfile: row.hardwareProfile ?? 'UNKNOWN',
      capabilityVersion: row.capabilityVersion,
      modelVersion: row.modelVersion,
      healthEligibility: (row.healthEligibility as DrivingImpactHealthEligibility) ?? 'LOW',
      provenanceMaturity:
        (row.provenanceMaturity as DrivingImpactProvenanceMaturity) ?? 'PARTIAL',
      provenanceVersion: row.provenanceVersion,
    };
  }

  const summary = parseLegacySummary(row.sourceSummaryJson);
  const primarySource = legacyPrimarySource(summary);
  const shares = legacyShares(primarySource);

  return {
    primarySource,
    ...shares,
    nativeEventCount: asInt((summary as Record<string, unknown>).nativeEventCount) ?? 0,
    hfEventCount: asInt((summary as Record<string, unknown>).hfEventCount) ?? 0,
    measurementCoverage: null,
    hardwareProfile: summary.vehicleHardwareType ?? 'UNKNOWN',
    capabilityVersion: null,
    modelVersion: row.modelVersion,
    healthEligibility: 'LOW',
    provenanceMaturity: 'MINIMAL',
    provenanceVersion: DRIVING_IMPACT_PROVENANCE_VERSION,
  };
}

export function mergeRollingProvenance(
  rows: readonly DrivingImpactSourceProvenance[],
): Pick<
  DrivingImpactSourceProvenance,
  | 'primarySource'
  | 'measuredShare'
  | 'providerClassifiedShare'
  | 'reconstructedShare'
  | 'estimatedProxyShare'
  | 'contextOnlyShare'
  | 'measurementCoverage'
  | 'hardwareProfile'
  | 'capabilityVersion'
  | 'healthEligibility'
  | 'provenanceMaturity'
  | 'provenanceVersion'
> {
  if (!rows.length) {
    return {
      primarySource: 'STRESS_ONLY',
      measuredShare: 0,
      providerClassifiedShare: 0,
      reconstructedShare: 0,
      estimatedProxyShare: 0,
      contextOnlyShare: 0,
      measurementCoverage: null,
      hardwareProfile: 'UNKNOWN',
      capabilityVersion: null,
      healthEligibility: 'NONE',
      provenanceMaturity: 'MINIMAL',
      provenanceVersion: DRIVING_IMPACT_PROVENANCE_VERSION,
    };
  }

  const avg = (pick: (r: DrivingImpactSourceProvenance) => number) =>
    Math.round((rows.reduce((sum, r) => sum + pick(r), 0) / rows.length) * 1000) / 1000;

  const nativeTotal = rows.reduce((s, r) => s + r.nativeEventCount, 0);
  const hfTotal = rows.reduce((s, r) => s + r.hfEventCount, 0);
  const measuredShare = avg((r) => r.measuredShare);
  const estimatedProxyShare = avg((r) => r.estimatedProxyShare);

  const primarySource = resolvePrimarySource({
    nativeEventCount: nativeTotal,
    hfEventCount: hfTotal,
    measuredShare,
    estimatedProxyShare,
  });

  const coverageValues = rows
    .map((r) => r.measurementCoverage)
    .filter((v): v is number => v != null);
  const measurementCoverage =
    coverageValues.length > 0
      ? Math.round(
          (coverageValues.reduce((a, b) => a + b, 0) / coverageValues.length) * 1000,
        ) / 1000
      : null;

  const highCount = rows.filter((r) => r.healthEligibility === 'HIGH').length;
  const lowCount = rows.filter((r) => r.healthEligibility === 'LOW').length;
  const healthEligibility: DrivingImpactHealthEligibility =
    highCount / rows.length >= 0.8
      ? 'HIGH'
      : lowCount / rows.length >= 0.5
        ? 'LOW'
        : measurementCoverage != null
          ? 'MEDIUM'
          : 'LOW';

  const maturityRank = { FULL: 3, PARTIAL: 2, MINIMAL: 1 };
  const minMaturity = rows.reduce(
    (min, r) => (maturityRank[r.provenanceMaturity] < maturityRank[min] ? r.provenanceMaturity : min),
    'FULL' as DrivingImpactProvenanceMaturity,
  );

  return {
    primarySource,
    measuredShare,
    providerClassifiedShare: avg((r) => r.providerClassifiedShare),
    reconstructedShare: avg((r) => r.reconstructedShare),
    estimatedProxyShare,
    contextOnlyShare: avg((r) => r.contextOnlyShare),
    measurementCoverage,
    hardwareProfile: rows[rows.length - 1]?.hardwareProfile ?? 'UNKNOWN',
    capabilityVersion: rows[rows.length - 1]?.capabilityVersion ?? null,
    healthEligibility,
    provenanceMaturity: minMaturity,
    provenanceVersion: DRIVING_IMPACT_PROVENANCE_VERSION,
  };
}
