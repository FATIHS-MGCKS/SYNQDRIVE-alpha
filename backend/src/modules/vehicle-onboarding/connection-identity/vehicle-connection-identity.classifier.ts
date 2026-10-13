import type { VehicleOnboardingCaseSourceRef } from '@prisma/client';
import type { OnboardingSourceSnapshotV1 } from '../contracts/onboarding-source-snapshot.v1';
import { parseValidatedSourceSnapshot } from '../policy/persisted-contract.validation';
import {
  VO_CONNECTION_IDENTITY_CONTRACT_VERSION,
  VehicleConnectionModality,
  type VoConnectionIdentityBindingMetadataV1,
  type VehicleConnectionModality as Modality,
} from './vehicle-connection-identity.contract';

export type ConnectionIdentityReadinessVerdict =
  | { ok: true; modality: Modality; evidence: string[] }
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

/** Default modality proposals at snapshot capture — operator may override before seal. */
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
    const make = snap.make?.toLowerCase() ?? '';
    if (make.includes('tesla')) {
      return VehicleConnectionModality.SOFTWARE_INTEGRATION;
    }
    return VehicleConnectionModality.HARDWARE_DEVICE;
  }
  return VehicleConnectionModality.UNKNOWN_REQUIRES_REVIEW;
}

export function mergeConnectionIdentityIntoBindingMetadata(
  snap: OnboardingSourceSnapshotV1,
  modality: Modality,
  evidence: string[],
): OnboardingSourceSnapshotV1 {
  const existing = readBindingIdentity(snap);
  const providerVehicleReference = snap.externalVehicleIdentity;
  return {
    ...snap,
    bindingMetadata: {
      ...snap.bindingMetadata,
      connectionIdentity: {
        contractVersion: VO_CONNECTION_IDENTITY_CONTRACT_VERSION,
        classifiedModality: existing?.classifiedModality ?? modality,
        provider: snap.providerType,
        providerVehicleReference,
        physicalDeviceReference:
          modality === VehicleConnectionModality.HARDWARE_DEVICE ? 'UNKNOWN' : 'NOT_APPLICABLE',
        deviceBindingRequired: modality === VehicleConnectionModality.HARDWARE_DEVICE,
        deviceBindingPresent: modality === VehicleConnectionModality.HARDWARE_DEVICE
          ? 'UNKNOWN'
          : false,
        verificationEvidence: evidence,
        classifiedAt: existing?.classifiedAt ?? new Date().toISOString(),
      },
    },
  };
}

export function assessTelemetryConnectionIdentityForActivation(
  sourceRefs: VehicleOnboardingCaseSourceRef[],
): ConnectionIdentityReadinessVerdict {
  if (isManualOnlySourceSet(sourceRefs)) {
    return {
      ok: true,
      modality: VehicleConnectionModality.MANUAL_NO_TELEMETRY,
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

  const modalities: Modality[] = [];
  const evidence: string[] = [];

  for (const ref of telemetryRefs) {
    try {
      const snap = parseValidatedSourceSnapshot(ref);
      const binding = readBindingIdentity(snap);
      const modality =
        binding?.classifiedModality ?? proposeDefaultConnectionModality(snap);
      modalities.push(modality);
      evidence.push(`${ref.provider}:${modality}`);
      if (modality === VehicleConnectionModality.UNKNOWN_REQUIRES_REVIEW) {
        return {
          ok: false,
          reasonCode: 'CONNECTION_MODALITY_UNKNOWN',
          evidence,
        };
      }
    } catch {
      return {
        ok: false,
        reasonCode: 'SOURCE_SNAPSHOT_INVALID',
        evidence: [`provider:${ref.provider}`],
      };
    }
  }

  return { ok: true, modality: modalities[0]!, evidence };
}

export function assertHardwareDeviceBindingForActivation(
  binding: VoConnectionIdentityBindingMetadataV1['connectionIdentity'] | null | undefined,
): ConnectionIdentityReadinessVerdict {
  if (!binding) {
    return {
      ok: false,
      reasonCode: 'PHYSICAL_DEVICE_BINDING_MISSING',
      evidence: ['NO_CONNECTION_IDENTITY_BINDING'],
    };
  }
  if (binding.classifiedModality !== VehicleConnectionModality.HARDWARE_DEVICE) {
    return { ok: true, modality: binding.classifiedModality, evidence: ['NOT_HARDWARE_MODALITY'] };
  }
  if (binding.deviceBindingPresent !== true) {
    return {
      ok: false,
      reasonCode: 'PHYSICAL_DEVICE_BINDING_MISSING',
      evidence: [`deviceBindingPresent=${String(binding.deviceBindingPresent)}`],
    };
  }
  return { ok: true, modality: binding.classifiedModality, evidence: ['DEVICE_BINDING_PRESENT'] };
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
