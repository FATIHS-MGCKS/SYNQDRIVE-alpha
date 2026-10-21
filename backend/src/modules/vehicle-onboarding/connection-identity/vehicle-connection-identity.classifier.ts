import type { VehicleOnboardingCaseSourceRef } from '@prisma/client';
import type { OnboardingSourceSnapshotV1 } from '../contracts/onboarding-source-snapshot.v1';
import { parseValidatedSourceSnapshot } from '../policy/persisted-contract.validation';
import {
  VehicleConnectionModality,
  type VoConnectionIdentityBindingMetadataV1,
  type VehicleConnectionModality as Modality,
} from './vehicle-connection-identity.contract';
import { getVerifiedModalityFromSnapshot } from './connection-modality-verification';

export type ConnectionIdentityReadinessVerdict =
  | { ok: true; perProvider: Array<{ provider: string; verifiedModality: Modality }>; evidence: string[] }
  | { ok: false; reasonCode: string; evidence: string[] };

function readBindingIdentity(
  snap: OnboardingSourceSnapshotV1,
): VoConnectionIdentityBindingMetadataV1['connectionIdentity'] | null {
  const meta = snap.bindingMetadata as VoConnectionIdentityBindingMetadataV1 | undefined;
  return meta?.connectionIdentity ?? null;
}

export function isTelemetryConnectedSourceRef(ref: VehicleOnboardingCaseSourceRef): boolean {
  return ref.provider === 'DIMO' || ref.provider === 'HIGH_MOBILITY';
}

export function isManualOnlySourceSet(sourceRefs: VehicleOnboardingCaseSourceRef[]): boolean {
  const telemetry = sourceRefs.filter(isTelemetryConnectedSourceRef);
  const manual = sourceRefs.filter((r) => r.provider === 'MANUAL');
  return telemetry.length === 0 && manual.length > 0;
}

/** Proposed modality only — never treated as verified (no make/model/fuel inference). */
export function proposeDefaultConnectionModality(
  snap: OnboardingSourceSnapshotV1,
): Modality {
  if (snap.providerType === 'MANUAL') {
    return VehicleConnectionModality.MANUAL_NO_TELEMETRY;
  }
  if (snap.providerType === 'HIGH_MOBILITY') {
    return VehicleConnectionModality.OEM_CLOUD;
  }
  if (snap.providerType === 'DIMO') {
    return VehicleConnectionModality.UNKNOWN_REQUIRES_REVIEW;
  }
  return VehicleConnectionModality.UNKNOWN_REQUIRES_REVIEW;
}

export function assessTelemetryConnectionIdentityForActivation(
  sourceRefs: VehicleOnboardingCaseSourceRef[],
): ConnectionIdentityReadinessVerdict {
  if (isManualOnlySourceSet(sourceRefs)) {
    return {
      ok: true,
      perProvider: [{ provider: 'MANUAL', verifiedModality: VehicleConnectionModality.MANUAL_NO_TELEMETRY }],
      evidence: ['MANUAL_ONLY_SOURCE_SET'],
    };
  }

  const telemetryRefs = sourceRefs.filter(isTelemetryConnectedSourceRef);
  if (telemetryRefs.length === 0) {
    return {
      ok: false,
      reasonCode: 'TELEMETRY_SOURCE_MISSING',
      evidence: ['NO_DIMO_OR_HM_SOURCE_REF'],
    };
  }

  const conflict = detectConflictingProviderIdentity(telemetryRefs);
  if (conflict) {
    return { ok: false, reasonCode: 'DUPLICATE_PROVIDER_BINDING', evidence: [conflict] };
  }

  const perProvider: Array<{ provider: string; verifiedModality: Modality }> = [];
  const evidence: string[] = [];

  for (const ref of telemetryRefs) {
    try {
      const snap = parseValidatedSourceSnapshot(ref);
      const verified = getVerifiedModalityFromSnapshot(snap);
      if (!verified || verified === VehicleConnectionModality.UNKNOWN_REQUIRES_REVIEW) {
        return {
          ok: false,
          reasonCode: 'CONNECTION_MODALITY_UNVERIFIED',
          evidence: [...evidence, `${ref.provider}:unverified`],
        };
      }
      perProvider.push({ provider: ref.provider, verifiedModality: verified });
      evidence.push(`${ref.provider}:${verified}`);
    } catch {
      return {
        ok: false,
        reasonCode: 'SOURCE_SNAPSHOT_INVALID',
        evidence: [`provider:${ref.provider}`],
      };
    }
  }

  return { ok: true, perProvider, evidence };
}

/** @deprecated P0 — use activation-connection-identity.assertions device evidence path. */
export function assertHardwareDeviceBindingForActivation(
  binding: VoConnectionIdentityBindingMetadataV1['connectionIdentity'] | null | undefined,
): { ok: true } | { ok: false; reasonCode: string } {
  if (!binding?.deviceBindingEvidence?.deviceSerial?.trim()) {
    return { ok: false, reasonCode: 'PHYSICAL_DEVICE_BINDING_MISSING' };
  }
  return { ok: true };
}

export function detectConflictingProviderIdentity(
  sourceRefs: VehicleOnboardingCaseSourceRef[],
): string | null {
  const byProvider = new Map<string, Set<string>>();
  for (const ref of sourceRefs) {
    if (!ref.provider || !ref.externalVehicleIdentity) continue;
    const set = byProvider.get(ref.provider) ?? new Set<string>();
    set.add(ref.externalVehicleIdentity);
    byProvider.set(ref.provider, set);
  }
  for (const [provider, ids] of byProvider) {
    if (ids.size > 1) {
      return `CONFLICTING_PROVIDER_IDENTITY:${provider}`;
    }
  }
  return null;
}
