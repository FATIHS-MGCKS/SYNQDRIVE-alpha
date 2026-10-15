import { PhysicalDeviceModelCode } from '@prisma/client';
import { PhysicalDeviceIdentityAttestationKind } from './dto/verify-physical-device-identity.dto';
import type { ProviderSerialReconciliationResult } from './physical-device-provider-reconciliation';

export type IdentityVerificationEvaluationInput = {
  modelCode: PhysicalDeviceModelCode;
  identityStatus: 'VERIFIED' | 'NEEDS_CLARIFICATION';
  serialNumber: string | null;
  serialClarificationReason: string | null;
  attestationKind: PhysicalDeviceIdentityAttestationKind;
  providerReconciliation?: ProviderSerialReconciliationResult | null;
};

export type IdentityVerificationEvaluationResult =
  | { ok: true; evidence: string[]; verificationMethod: string }
  | { ok: false; reasonCode: string; evidence: string[] };

export function evaluateIdentityVerification(
  input: IdentityVerificationEvaluationInput,
): IdentityVerificationEvaluationResult {
  if (input.identityStatus === 'VERIFIED') {
    return { ok: false, reasonCode: 'ALREADY_VERIFIED', evidence: [] };
  }

  if (!input.serialNumber?.trim()) {
    return {
      ok: false,
      reasonCode: 'SERIAL_REQUIRED',
      evidence: ['serial:missing'],
    };
  }

  if (input.serialClarificationReason) {
    return {
      ok: false,
      reasonCode: 'SERIAL_NEEDS_CLARIFICATION',
      evidence: [`serialClarification:${input.serialClarificationReason}`],
    };
  }

  if (
    input.attestationKind ===
    PhysicalDeviceIdentityAttestationKind.PROVIDER_DIMO_SERIAL_RECONCILIATION
  ) {
    if (input.modelCode === PhysicalDeviceModelCode.SMART5) {
      return {
        ok: false,
        reasonCode: 'SMART5_PROVIDER_IDENTITY_UNKNOWN',
        evidence: ['model:SMART5', 'providerIdentity:not_established'],
      };
    }
    if (input.modelCode === PhysicalDeviceModelCode.RUPTELA_AIR_ONE) {
      return {
        ok: false,
        reasonCode: 'AIR_ONE_PROVIDER_IDENTITY_UNKNOWN',
        evidence: ['model:RUPTELA_AIR_ONE', 'providerIdentity:not_established'],
      };
    }
    if (!input.providerReconciliation) {
      return {
        ok: false,
        reasonCode: 'PROVIDER_RECONCILIATION_REQUIRED',
        evidence: ['providerReconciliation:missing'],
      };
    }
    if (!input.providerReconciliation.ok) {
      return {
        ok: false,
        reasonCode: input.providerReconciliation.reasonCode,
        evidence: input.providerReconciliation.evidence,
      };
    }
    return {
      ok: true,
      verificationMethod: 'PROVIDER_DIMO_SERIAL_RECONCILIATION',
      evidence: input.providerReconciliation.evidence,
    };
  }

  return {
    ok: false,
    reasonCode: 'UNSUPPORTED_ATTESTATION',
    evidence: [`attestationKind:${input.attestationKind}`],
  };
}
