import type { VehicleOnboardingCaseSourceRef } from '@prisma/client';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';
import { parseValidatedSourceSnapshot } from '../policy/persisted-contract.validation';

function normalizeVin(vin: string | null | undefined): string | null {
  const trimmed = vin?.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.toUpperCase();
}

export function assertSnapshotVinContinuityWithCurrentMirror(
  snapshotVin: string | null | undefined,
  currentMirrorVin: string | null | undefined,
): void {
  const sealed = normalizeVin(snapshotVin);
  const current = normalizeVin(currentMirrorVin);
  if (sealed && current && sealed !== current) {
    throw new VehicleOnboardingError(
      'IDENTITY_REVIEW_REQUIRED',
      'Provider mirror VIN no longer matches governed source snapshot',
    );
  }
}

function resolveDimoExternalVehicleIdentity(dimo: {
  id: string;
  externalId: string | null;
}): string {
  return dimo.externalId?.trim() || dimo.id;
}

export function assertDimoSourceIdentityContinuity(
  ref: VehicleOnboardingCaseSourceRef,
  dimo: { id: string; externalId: string | null; vin: string | null },
): void {
  const snapshot = parseValidatedSourceSnapshot(ref);
  if (dimo.id !== ref.sourceMirrorId) {
    throw new VehicleOnboardingError(
      'IDENTITY_REVIEW_REQUIRED',
      'DIMO mirror identity no longer matches governed source ref',
    );
  }
  const currentExternal = resolveDimoExternalVehicleIdentity(dimo);
  const expectedExternal = ref.externalVehicleIdentity.trim();
  if (currentExternal !== expectedExternal) {
    throw new VehicleOnboardingError(
      'IDENTITY_REVIEW_REQUIRED',
      'DIMO external identity no longer matches governed source snapshot',
    );
  }
  if (snapshot.externalVehicleIdentity.trim() !== currentExternal) {
    throw new VehicleOnboardingError(
      'IDENTITY_REVIEW_REQUIRED',
      'DIMO external identity no longer matches governed source snapshot',
    );
  }
  assertSnapshotVinContinuityWithCurrentMirror(snapshot.vin, dimo.vin);
}

function readHmEvidenceField(
  evidence: Record<string, unknown>,
  key: string,
): string | null {
  const value = evidence[key];
  if (value === null || value === undefined) {
    return null;
  }
  return String(value);
}

export function assertHighMobilitySourceIdentityContinuity(
  ref: VehicleOnboardingCaseSourceRef,
  hm: {
    id: string;
    vin: string | null;
    sourceMode: string;
    packageType: string;
    appContainerType: string | null;
  },
): void {
  const snapshot = parseValidatedSourceSnapshot(ref);
  if (hm.id !== ref.sourceMirrorId) {
    throw new VehicleOnboardingError(
      'IDENTITY_REVIEW_REQUIRED',
      'High Mobility mirror identity no longer matches governed source ref',
    );
  }

  assertSnapshotVinContinuityWithCurrentMirror(snapshot.vin, hm.vin);

  const evidence = snapshot.sourceEvidence;
  const sealedSourceMode = readHmEvidenceField(evidence, 'sourceMode');
  const sealedPackageType = readHmEvidenceField(evidence, 'packageType');
  const sealedAppContainer = readHmEvidenceField(evidence, 'appContainerType');

  if (sealedSourceMode !== null && hm.sourceMode !== sealedSourceMode) {
    throw new VehicleOnboardingError(
      'READINESS_SEAL_STALE',
      'High Mobility source mode no longer matches sealed source evidence',
    );
  }
  if (sealedPackageType !== null && hm.packageType !== sealedPackageType) {
    throw new VehicleOnboardingError(
      'READINESS_SEAL_STALE',
      'High Mobility package type no longer matches sealed source evidence',
    );
  }
  const currentApp = hm.appContainerType ?? null;
  if (sealedAppContainer !== currentApp) {
    throw new VehicleOnboardingError(
      'READINESS_SEAL_STALE',
      'High Mobility app container no longer matches sealed source evidence',
    );
  }
}
