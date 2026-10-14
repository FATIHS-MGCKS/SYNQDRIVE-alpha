/**
 * Future APDS read-only consumer boundary (VSI-03 P1 — contract only).
 *
 * APDS shadow decision path MUST NOT import this until explicitly authorized.
 * Tesla SOFTWARE_INTEGRATION evidence and Ruptela R1 HARDWARE_DEVICE evidence
 * require separate stratification — never merge solely on vehicles.hardwareType.
 */

import type { VsiReadonlyComposerResult } from './vsi-readonly-composer.types';
import type { VsiVehicleSignalEvidenceDescriptorV1 } from './vehicle-signal-evidence.contract';

export const VSI_APDS_ADAPTER_CONTRACT_VERSION = 'vsi-apds-readonly-adapter-v0' as const;

export type VsiApdsReadonlyStratificationKey = {
  organizationId: string;
  vehicleId: string;
  providerSourceLinkId: string;
  verifiedModality: string;
  telemetrySourceFamily: string;
};

export type VsiApdsReadonlyAdapterInput = {
  composerResult: VsiReadonlyComposerResult;
  shadowDecisionAt: Date;
  /** APDS opportunity id for correlation only — no mutation. */
  opportunityId?: string;
};

export type VsiApdsReadonlyAdapterView = {
  contractVersion: typeof VSI_APDS_ADAPTER_CONTRACT_VERSION;
  stratificationKey: VsiApdsReadonlyStratificationKey;
  /** Subset of composer signals safe for shadow-side correlation (read-only). */
  signalEvidence: VsiVehicleSignalEvidenceDescriptorV1[];
  limitations: readonly string[];
};

/**
 * Pure projection for future wiring — not registered in Nest DI in P1.
 */
export function projectVsiEvidenceForApdsReadonlyCorrelation(
  input: VsiApdsReadonlyAdapterInput,
): VsiApdsReadonlyAdapterView[] {
  const { composerResult } = input;
  return composerResult.identityProjections.map((identity) => {
    const linkId = identity.providerSourceLinkId;
    const signalEvidence = composerResult.signals.filter((s) => {
      const ref = s.identity.providerSourceLinkRef;
      return (
        ref.kind === 'resolved' &&
        linkId !== 'UNRESOLVED' &&
        ref.providerSourceLinkId === linkId
      );
    });
    return {
      contractVersion: VSI_APDS_ADAPTER_CONTRACT_VERSION,
      stratificationKey: {
        organizationId: composerResult.organizationId,
        vehicleId: composerResult.vehicleId,
        providerSourceLinkId: linkId,
        verifiedModality: identity.verifiedModality,
        telemetrySourceFamily: identity.telemetrySourceFamily,
      },
      signalEvidence,
      limitations: [
        ...identity.confidenceLimitations,
        'NOT_WIRED_TO_APDS_SHADOW_DECISION_PATH',
        'POLL_SUCCESS_DOES_NOT_IMPLY_STRICT_SOURCE_ADVANCE',
      ],
    };
  });
}
