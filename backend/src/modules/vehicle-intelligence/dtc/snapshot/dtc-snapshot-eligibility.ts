export type DtcPollEligibilityOutcome =
  | { eligible: true }
  | { eligible: false; reason: string };

export interface DtcPollEligibilityInput {
  registryLifecycle: string | null | undefined;
  dimoTokenId: number | null | undefined;
  activeDimoLink: {
    id: string;
    isActive: boolean;
    dimoVehicleId: string | null;
  } | null;
  vehicleDimoVehicleId: string | null;
}

/**
 * Fail-closed poll eligibility — offboarded / inactive bindings must not be polled or re-authorized.
 */
export function evaluateDtcPollEligibility(input: DtcPollEligibilityInput): DtcPollEligibilityOutcome {
  const lifecycle = (input.registryLifecycle ?? 'ACTIVE').toUpperCase();
  if (lifecycle === 'OFFBOARDED' || lifecycle === 'ARCHIVED') {
    return { eligible: false, reason: `REGISTRY_LIFECYCLE_${lifecycle}` };
  }
  if (!input.dimoTokenId) {
    return { eligible: false, reason: 'MISSING_DIMO_TOKEN_ID' };
  }
  if (!input.activeDimoLink || !input.activeDimoLink.isActive) {
    return { eligible: false, reason: 'NO_ACTIVE_DIMO_SOURCE_LINK' };
  }
  if (
    input.vehicleDimoVehicleId &&
    input.activeDimoLink.dimoVehicleId &&
    input.activeDimoLink.dimoVehicleId !== input.vehicleDimoVehicleId
  ) {
    return { eligible: false, reason: 'DIMO_VEHICLE_BINDING_MISMATCH' };
  }
  return { eligible: true };
}
