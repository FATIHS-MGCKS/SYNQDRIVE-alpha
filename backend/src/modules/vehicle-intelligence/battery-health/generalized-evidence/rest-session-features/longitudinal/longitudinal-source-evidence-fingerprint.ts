import type { BatteryRestSession, BatteryRestSessionFeature } from '@prisma/client';
import {
  canonicalFeatureInputUtf8,
  compareUtf16CodeUnitLexicographic,
  sha256HexLowercaseUtf8,
} from '../feature-input-canonical.serializer';
import { selectCanonicalRestSessionFeatureShadowRow } from '../rest-session-feature-canonical-row.policy';
import {
  REST_SESSION_CHARGE_OPPORTUNITY_POLICY_VERSION,
  REST_SESSION_FEATURE_MODEL_VERSION,
  REST_SESSION_RETENTION_POLICY_VERSION,
} from '../rest-session-feature.constants';
import { groupCanonicalCandidatesByRestSessionId } from './longitudinal-input.repository';
import { REST_SESSION_LONGITUDINAL_INPUT_CONTRACT_VERSION } from './longitudinal-input.constants';

export type LongitudinalSourceEvidenceSnapshot = {
  organizationId: string;
  vehicleId: string;
  appliedSessionLimit: number;
  sessions: BatteryRestSession[];
  canonicalCandidates: BatteryRestSessionFeature[];
};

export type LongitudinalSourceEvidenceFingerprintMeta = {
  /** Earliest computedAt among selected canonical rows — candidate ordering hint. */
  oldestSelectedCanonicalComputedAtMs: number | null;
};

function toIso(date: Date): string {
  return date.toISOString();
}

/**
 * Canonical D1 source-evidence projection for durable D3 freshness (M3.3F F4.1).
 * Includes session lifecycle fields and canonical C3 row identity (VALID and INVALIDATED).
 */
export function buildLongitudinalSourceEvidenceCanonicalPayload(
  snapshot: LongitudinalSourceEvidenceSnapshot,
): unknown {
  const candidatesBySession = groupCanonicalCandidatesByRestSessionId(
    snapshot.canonicalCandidates,
  );

  const sessionsChronological = [...snapshot.sessions].sort((a, b) => {
    const anchorDiff = a.anchorAt.getTime() - b.anchorAt.getTime();
    if (anchorDiff !== 0) return anchorDiff;
    return compareUtf16CodeUnitLexicographic(a.id, b.id);
  });

  const sessionEntries = sessionsChronological.map((session) => {
    const candidates = candidatesBySession.get(session.id) ?? [];
    const canonicalRow = selectCanonicalRestSessionFeatureShadowRow({
      sessionStatus: session.sessionStatus,
      endReason: session.endReason,
      rows: candidates,
    });

    return {
      restSessionId: session.id,
      anchorAt: toIso(session.anchorAt),
      sessionStatus: session.sessionStatus,
      endReason: session.endReason,
      canonical: canonicalRow
        ? {
            canonicalFeatureRowId: canonicalRow.id,
            semanticRevision: canonicalRow.semanticRevision,
            computationPhase: canonicalRow.computationPhase,
            sessionTrust: canonicalRow.sessionTrust,
            inputDigest: canonicalRow.inputDigest,
            computedAt: toIso(canonicalRow.computedAt),
          }
        : null,
    };
  });

  return {
    longitudinalInputContractVersion: REST_SESSION_LONGITUDINAL_INPUT_CONTRACT_VERSION,
    featureModelVersion: REST_SESSION_FEATURE_MODEL_VERSION,
    retentionPolicyVersion: REST_SESSION_RETENTION_POLICY_VERSION,
    chargeOpportunityPolicyVersion: REST_SESSION_CHARGE_OPPORTUNITY_POLICY_VERSION,
    organizationId: snapshot.organizationId,
    vehicleId: snapshot.vehicleId,
    appliedSessionLimit: snapshot.appliedSessionLimit,
    sessions: sessionEntries,
  };
}

export function computeLongitudinalSourceEvidenceFingerprint(
  snapshot: LongitudinalSourceEvidenceSnapshot,
): { fingerprint: string; meta: LongitudinalSourceEvidenceFingerprintMeta } {
  const payload = buildLongitudinalSourceEvidenceCanonicalPayload(snapshot);
  const canonicalUtf8 = canonicalFeatureInputUtf8(payload);
  const fingerprint = sha256HexLowercaseUtf8(canonicalUtf8);

  let oldestSelectedCanonicalComputedAtMs: number | null = null;
  const candidatesBySession = groupCanonicalCandidatesByRestSessionId(
    snapshot.canonicalCandidates,
  );
  for (const session of snapshot.sessions) {
    const candidates = candidatesBySession.get(session.id) ?? [];
    const canonicalRow = selectCanonicalRestSessionFeatureShadowRow({
      sessionStatus: session.sessionStatus,
      endReason: session.endReason,
      rows: candidates,
    });
    if (!canonicalRow) continue;
    const ms = canonicalRow.computedAt.getTime();
    if (
      oldestSelectedCanonicalComputedAtMs == null ||
      ms < oldestSelectedCanonicalComputedAtMs
    ) {
      oldestSelectedCanonicalComputedAtMs = ms;
    }
  }

  return { fingerprint, meta: { oldestSelectedCanonicalComputedAtMs } };
}
