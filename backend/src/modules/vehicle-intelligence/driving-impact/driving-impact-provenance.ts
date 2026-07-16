/**
 * Driving Impact source provenance (P41).
 *
 * Quantifies which evidence types contributed to impact normalization.
 * Shares sum to 1.0 when provenance weights are known; primarySource is never empty on new writes.
 */

export const DRIVING_IMPACT_PROVENANCE_VERSION = 'impact-provenance-v1';

export type DrivingImpactPrimarySource =
  | 'PROVIDER_CLASSIFIED'
  | 'RECONSTRUCTED'
  | 'MIXED'
  | 'MEASURED'
  | 'ESTIMATED_PROXY'
  | 'STRESS_ONLY';

export type DrivingImpactHealthEligibility = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';

export type DrivingImpactProvenanceMaturity = 'FULL' | 'PARTIAL' | 'MINIMAL';

export type DrivingImpactSourceProvenance = {
  primarySource: DrivingImpactPrimarySource;
  measuredShare: number;
  providerClassifiedShare: number;
  reconstructedShare: number;
  estimatedProxyShare: number;
  contextOnlyShare: number;
  nativeEventCount: number;
  hfEventCount: number;
  measurementCoverage: number | null;
  hardwareProfile: string;
  capabilityVersion: string | null;
  modelVersion: string;
  healthEligibility: DrivingImpactHealthEligibility;
  provenanceMaturity: DrivingImpactProvenanceMaturity;
  provenanceVersion: string;
};

export type DrivingImpactProvenanceInput = {
  hardwareProfile: string;
  capabilityVersion: string | null;
  modelVersion: string;
  nativeEventCount: number;
  hfEventCount: number;
  estimatedProxyEventCount: number;
  contextOnlyEventCount: number;
  hasMeasuredRouteContext: boolean;
  measurementCoverage: number | null;
};

function roundShare(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function normalizeShares(weights: {
  measured: number;
  providerClassified: number;
  reconstructed: number;
  estimatedProxy: number;
  contextOnly: number;
}): Omit<
  DrivingImpactSourceProvenance,
  | 'primarySource'
  | 'nativeEventCount'
  | 'hfEventCount'
  | 'measurementCoverage'
  | 'hardwareProfile'
  | 'capabilityVersion'
  | 'modelVersion'
  | 'healthEligibility'
  | 'provenanceMaturity'
  | 'provenanceVersion'
> {
  const total =
    weights.measured +
    weights.providerClassified +
    weights.reconstructed +
    weights.estimatedProxy +
    weights.contextOnly;

  if (total <= 0) {
    return {
      measuredShare: 0,
      providerClassifiedShare: 0,
      reconstructedShare: 0,
      estimatedProxyShare: 0,
      contextOnlyShare: 0,
    };
  }

  return {
    measuredShare: roundShare(weights.measured / total),
    providerClassifiedShare: roundShare(weights.providerClassified / total),
    reconstructedShare: roundShare(weights.reconstructed / total),
    estimatedProxyShare: roundShare(weights.estimatedProxy / total),
    contextOnlyShare: roundShare(weights.contextOnly / total),
  };
}

export function resolvePrimarySource(input: {
  nativeEventCount: number;
  hfEventCount: number;
  measuredShare: number;
  estimatedProxyShare: number;
}): DrivingImpactPrimarySource {
  if (input.nativeEventCount > 0 && input.hfEventCount > 0) {
    return 'MIXED';
  }
  if (input.nativeEventCount > 0) {
    return 'PROVIDER_CLASSIFIED';
  }
  if (input.hfEventCount > 0) {
    return 'RECONSTRUCTED';
  }
  if (input.estimatedProxyShare >= 0.5) {
    return 'ESTIMATED_PROXY';
  }
  if (input.measuredShare >= 0.5) {
    return 'MEASURED';
  }
  return 'STRESS_ONLY';
}

export function computeHealthEligibility(input: {
  measuredShare: number;
  providerClassifiedShare: number;
  reconstructedShare: number;
  estimatedProxyShare: number;
  measurementCoverage: number | null;
  nativeEventCount: number;
  hfEventCount: number;
}): DrivingImpactHealthEligibility {
  const behavioralEvents = input.nativeEventCount + input.hfEventCount;
  if (behavioralEvents === 0 && (input.measurementCoverage ?? 0) <= 0) {
    return 'NONE';
  }

  const strongShare = input.measuredShare + input.providerClassifiedShare;
  const coverage = input.measurementCoverage ?? 0;

  if (input.estimatedProxyShare >= 0.5 || coverage < 0.25) {
    return 'LOW';
  }
  if (strongShare >= 0.8 && coverage >= 0.5) {
    return 'HIGH';
  }
  if (strongShare >= 0.5 || input.reconstructedShare >= 0.5) {
    return 'MEDIUM';
  }
  return 'LOW';
}

export function computeProvenanceMaturity(input: {
  primarySource: DrivingImpactPrimarySource;
  capabilityVersion: string | null;
  measurementCoverage: number | null;
  provenanceComplete: boolean;
}): DrivingImpactProvenanceMaturity {
  if (!input.provenanceComplete || !input.primarySource) {
    return 'MINIMAL';
  }
  if (input.capabilityVersion == null || input.measurementCoverage == null) {
    return 'PARTIAL';
  }
  return 'FULL';
}

export function buildDrivingImpactSourceProvenance(
  input: DrivingImpactProvenanceInput,
): DrivingImpactSourceProvenance {
  const measuredWeight = input.hasMeasuredRouteContext ? 1 : 0;
  const shares = normalizeShares({
    measured: measuredWeight,
    providerClassified: input.nativeEventCount,
    reconstructed: input.hfEventCount,
    estimatedProxy: input.estimatedProxyEventCount,
    contextOnly: input.contextOnlyEventCount,
  });

  const primarySource = resolvePrimarySource({
    nativeEventCount: input.nativeEventCount,
    hfEventCount: input.hfEventCount,
    measuredShare: shares.measuredShare,
    estimatedProxyShare: shares.estimatedProxyShare,
  });

  const healthEligibility = computeHealthEligibility({
    ...shares,
    measurementCoverage: input.measurementCoverage,
    nativeEventCount: input.nativeEventCount,
    hfEventCount: input.hfEventCount,
  });

  const provenanceMaturity = computeProvenanceMaturity({
    primarySource,
    capabilityVersion: input.capabilityVersion,
    measurementCoverage: input.measurementCoverage,
    provenanceComplete: true,
  });

  return {
    primarySource,
    ...shares,
    nativeEventCount: input.nativeEventCount,
    hfEventCount: input.hfEventCount,
    measurementCoverage: input.measurementCoverage,
    hardwareProfile: input.hardwareProfile,
    capabilityVersion: input.capabilityVersion,
    modelVersion: input.modelVersion,
    healthEligibility,
    provenanceMaturity,
    provenanceVersion: DRIVING_IMPACT_PROVENANCE_VERSION,
  };
}
