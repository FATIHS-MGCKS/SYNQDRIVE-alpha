import { createHash } from 'node:crypto';
import type { OnboardingSourceSnapshotV1 } from '../contracts/onboarding-source-snapshot.v1';
import type { VehicleOnboardingCaseSourceRef } from '@prisma/client';
import { parseValidatedSourceSnapshot } from '../policy/persisted-contract.validation';
import { stableCanonicalJson } from './readiness-input-fingerprint.v1';

/** Readiness-relevant projection of governed source snapshot (excludes volatile observedAt). */
export function readinessRelevantSourceSnapshotProjection(
  snap: OnboardingSourceSnapshotV1,
): Record<string, unknown> {
  return {
    version: snap.version,
    providerType: snap.providerType,
    connectionScope: snap.connectionScope,
    externalVehicleIdentity: snap.externalVehicleIdentity,
    sourceMirrorTable: snap.sourceMirrorTable,
    sourceMirrorId: snap.sourceMirrorId,
    vin: snap.vin,
    vinProvenance: snap.vinProvenance,
    vinVerificationState: snap.vinVerificationState,
    make: snap.make,
    model: snap.model,
    year: snap.year,
    fuelTypeHint: snap.fuelTypeHint,
    capabilityHints: [...(snap.capabilityHints ?? [])].sort(),
    sourceEvidence: snap.sourceEvidence,
    bindingMetadata: snap.bindingMetadata,
  };
}

export function normalizeSourceRefsForReadinessFingerprint(
  refs: VehicleOnboardingCaseSourceRef[],
): unknown[] {
  return refs
    .map((r) => {
      const snap = parseValidatedSourceSnapshot(r);
      return {
        provider: r.provider,
        connectionScopeKey: r.connectionScopeKey,
        externalVehicleIdentity: r.externalVehicleIdentity,
        isPrimary: r.isPrimary,
        snapshot: readinessRelevantSourceSnapshotProjection(snap),
      };
    })
    .sort((a, b) =>
      `${a.provider}:${a.externalVehicleIdentity}`.localeCompare(
        `${b.provider}:${b.externalVehicleIdentity}`,
      ),
    );
}

export function hashReadinessRelevantSourceSnapshotProjection(snap: OnboardingSourceSnapshotV1): string {
  const payload = readinessRelevantSourceSnapshotProjection(snap);
  return createHash('sha256').update(stableCanonicalJson(payload), 'utf8').digest('hex');
}
