import type {
  RawFuelAbsoluteDetectionAdmissibility,
  RawFuelAbsoluteSignalTrust,
} from './raw-fuel-refuel-fallback.types';
import type { RawFuelPrePlateauBaselineRecencyClassification } from '../raw-fuel-rise-detector/raw-fuel-pre-plateau-baseline-recency.policy';
import { RFRF_READY_EVIDENCE_REFRESH_POLICY_VERSION } from './raw-refuel-ready-evidence-refresh.policy';
import { RFRF_SIGNAL_TRUST_RESOLVER_VERSION } from './raw-fuel-signal-trust.resolver';
import {
  RFRF_RISE_DETECTION_VERSION,
  RFRF_RISE_DETECTOR_VERSION,
} from '../raw-fuel-rise-detector/raw-fuel-rise-detector.config';

export const READY_EVIDENCE_REFRESH_META_KEY = 'readyEvidenceRefresh';

export interface ReadyEvidenceRefreshMeta {
  refreshPolicyVersion: string;
  trustResolverVersion: string;
  detectorVersion: string;
  detectionVersion: string;
  baselineRecencyClassification: RawFuelPrePlateauBaselineRecencyClassification;
  absoluteSignalTrust: RawFuelAbsoluteSignalTrust;
  absoluteDetectionAdmissibility: RawFuelAbsoluteDetectionAdmissibility;
  relativeSignalAvailable: boolean;
  hybridTrustReasonCode?: string;
  hybridTrustAuthorityVersion?: string;
}

export function buildReadyEvidenceRefreshMeta(input: {
  baselineRecencyClassification: RawFuelPrePlateauBaselineRecencyClassification;
  absoluteSignalTrust: RawFuelAbsoluteSignalTrust;
  absoluteDetectionAdmissibility: RawFuelAbsoluteDetectionAdmissibility;
  relativeSignalAvailable: boolean;
  hybridTrustReasonCode?: string;
  hybridTrustAuthorityVersion?: string;
}): ReadyEvidenceRefreshMeta {
  return {
    refreshPolicyVersion: RFRF_READY_EVIDENCE_REFRESH_POLICY_VERSION,
    trustResolverVersion: RFRF_SIGNAL_TRUST_RESOLVER_VERSION,
    detectorVersion: RFRF_RISE_DETECTOR_VERSION,
    detectionVersion: RFRF_RISE_DETECTION_VERSION,
    baselineRecencyClassification: input.baselineRecencyClassification,
    absoluteSignalTrust: input.absoluteSignalTrust,
    absoluteDetectionAdmissibility: input.absoluteDetectionAdmissibility,
    relativeSignalAvailable: input.relativeSignalAvailable,
    ...(input.hybridTrustReasonCode
      ? { hybridTrustReasonCode: input.hybridTrustReasonCode }
      : {}),
    ...(input.hybridTrustAuthorityVersion
      ? { hybridTrustAuthorityVersion: input.hybridTrustAuthorityVersion }
      : {}),
  };
}

export function readReadyEvidenceRefreshFromEvidenceMeta(
  evidenceMeta: unknown,
): ReadyEvidenceRefreshMeta | null {
  if (!evidenceMeta || typeof evidenceMeta !== 'object' || Array.isArray(evidenceMeta)) {
    return null;
  }
  const block = (evidenceMeta as Record<string, unknown>)[READY_EVIDENCE_REFRESH_META_KEY];
  if (!block || typeof block !== 'object' || Array.isArray(block)) {
    return null;
  }
  const meta = block as Record<string, unknown>;
  if (
    typeof meta.refreshPolicyVersion !== 'string' ||
    typeof meta.trustResolverVersion !== 'string' ||
    typeof meta.detectorVersion !== 'string' ||
    typeof meta.detectionVersion !== 'string' ||
    typeof meta.baselineRecencyClassification !== 'string' ||
    typeof meta.absoluteSignalTrust !== 'string' ||
    typeof meta.absoluteDetectionAdmissibility !== 'string' ||
    typeof meta.relativeSignalAvailable !== 'boolean'
  ) {
    return null;
  }
  const hybridTrustReasonCode =
    typeof meta.hybridTrustReasonCode === 'string' ? meta.hybridTrustReasonCode : undefined;
  const hybridTrustAuthorityVersion =
    typeof meta.hybridTrustAuthorityVersion === 'string'
      ? meta.hybridTrustAuthorityVersion
      : undefined;
  return {
    ...(meta as unknown as ReadyEvidenceRefreshMeta),
    ...(hybridTrustReasonCode ? { hybridTrustReasonCode } : {}),
    ...(hybridTrustAuthorityVersion ? { hybridTrustAuthorityVersion } : {}),
  } as ReadyEvidenceRefreshMeta;
}

export function mergeReadyEvidenceRefreshIntoEvidenceMeta(
  evidenceMeta: Record<string, unknown> | null | undefined,
  refresh: ReadyEvidenceRefreshMeta,
): Record<string, unknown> {
  return {
    ...(evidenceMeta ?? {}),
    [READY_EVIDENCE_REFRESH_META_KEY]: refresh,
  };
}
