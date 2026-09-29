import type { PrismaClient, RawRefuelCandidate } from '@prisma/client';
import {
  RFRF_HYBRID_TRUST_ACTIVATION_MODE_ENV,
  RFRF_HYBRID_TRUST_ALLOWED_ORGANIZATION_IDS_ENV,
  RFRF_HYBRID_TRUST_ALLOWED_VEHICLE_IDS_ENV,
} from '../raw-fuel-hybrid-trust-activation.authority';
import {
  buildHybridAbsoluteSignalTrustEvidence,
  mergeHybridAbsoluteSignalTrustEvidence,
  readHybridAbsoluteSignalTrustEvidence,
} from '../raw-fuel-hybrid-trust-evidence-metadata';
import { RFRF_HYBRID_ABSOLUTE_SIGNAL_TRUST_AUTHORITY_VERSION } from '../raw-fuel-hybrid-absolute-signal-trust.authority';
import {
  RAW_FUEL_RISE_DETECTOR_CONFIG_V1,
} from '../../raw-fuel-rise-detector/raw-fuel-rise-detector.config';

/**
 * Isolated integration tests: register seeded org for scoped activation without production rollout.
 */
export function registerLabHybridTrustOrganization(orgId: string): void {
  process.env[RFRF_HYBRID_TRUST_ACTIVATION_MODE_ENV] = 'ALPHA_ALLOWLIST';
  const normalized = orgId.trim().toLowerCase();
  const existing = (process.env[RFRF_HYBRID_TRUST_ALLOWED_ORGANIZATION_IDS_ENV] ?? '')
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  if (!existing.includes(normalized)) {
    existing.push(normalized);
  }
  process.env[RFRF_HYBRID_TRUST_ALLOWED_ORGANIZATION_IDS_ENV] = existing.join(',');
}

export function clearLabHybridTrustActivationEnv(): void {
  delete process.env[RFRF_HYBRID_TRUST_ACTIVATION_MODE_ENV];
  delete process.env[RFRF_HYBRID_TRUST_ALLOWED_ORGANIZATION_IDS_ENV];
  delete process.env[RFRF_HYBRID_TRUST_ALLOWED_VEHICLE_IDS_ENV];
}

export async function ensurePersistedCandidateLabHybridTrustEvidence(
  prisma: PrismaClient,
  candidate: RawRefuelCandidate,
): Promise<RawRefuelCandidate> {
  const existing = readHybridAbsoluteSignalTrustEvidence(candidate.evidenceMeta);
  if (existing?.computedHybridClassification === 'TRUSTED') {
    return candidate;
  }

  registerLabHybridTrustOrganization(candidate.organizationId);

  const materialRiseLiters = RAW_FUEL_RISE_DETECTOR_CONFIG_V1.absolute.materialRiseLiters;
  const materialRisePercent = RAW_FUEL_RISE_DETECTOR_CONFIG_V1.relative.materialRisePercent;
  const hybridBlock = buildHybridAbsoluteSignalTrustEvidence(
    {
      authorityVersion: RFRF_HYBRID_ABSOLUTE_SIGNAL_TRUST_AUTHORITY_VERSION,
      classification: 'TRUSTED',
      reasonCode: 'CORROBORATED_RISE',
      absoluteDetectionAdmissibility: 'ADMISSIBLE',
      relativeSampleCoverage: 'SUFFICIENT',
      baselineRecencyClassification: 'FRESH',
      absoluteDeltaLiters: candidate.deltaAbsoluteLiters ?? materialRiseLiters,
      relativeDeltaPercent: materialRisePercent + 1,
      materialRiseLiters,
      materialRisePercent,
      relativePrePlateauLocal: 'VALID',
      relativePostPlateauLocal: 'VALID',
      absolutePostPlateauLocal: 'VALID',
    },
    {
      relativePrePlateauLocal: 'VALID',
      relativePostPlateauLocal: 'VALID',
      absolutePostPlateauLocal: 'VALID',
    },
  );

  const evidenceRoot =
    candidate.evidenceMeta &&
    typeof candidate.evidenceMeta === 'object' &&
    !Array.isArray(candidate.evidenceMeta)
      ? (candidate.evidenceMeta as Record<string, unknown>)
      : {};

  const evidenceMeta = mergeHybridAbsoluteSignalTrustEvidence(evidenceRoot, hybridBlock);

  return prisma.rawRefuelCandidate.update({
    where: { id: candidate.id },
    data: {
      evidenceMeta: evidenceMeta as never,
    },
  });
}
