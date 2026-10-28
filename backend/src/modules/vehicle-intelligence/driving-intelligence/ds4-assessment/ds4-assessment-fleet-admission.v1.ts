/**
 * DS4 Assessment L2 fleet admission (PR-A).
 *
 * Canonical vehicle UUIDs from read-only production cohort evidence:
 * `architecture/tires/evidence/p3-offline-e2e-2026-10-27/production-vehicles-meta.json`
 *
 * Do not match on display names or license plates. This list is code-defined for the four-drive
 * test fleet only — not org-wide enablement and not wired to motion-core shadow env allowlists.
 */

export const DS4_ASSESSMENT_FLEET_ADMISSION_EVIDENCE_REF =
  'architecture/tires/evidence/p3-offline-e2e-2026-10-27/production-vehicles-meta.json';

export type Ds4AssessmentFleetVehicleRoleV1 =
  | 'TESLA_MODEL_3_SOFTWARE_INTEGRATION'
  | 'VW_TIGUAN_R1'
  | 'AUDI_A4_R1'
  | 'VW_ARTEON_R1';

export type Ds4AssessmentFleetVehicleV1 = {
  vehicleId: string;
  organizationId: string;
  role: Ds4AssessmentFleetVehicleRoleV1;
};

/** Fail-closed fixed cohort — four vehicles only. */
export const DS4_ASSESSMENT_FLEET_VEHICLES_V1: readonly Ds4AssessmentFleetVehicleV1[] = [
  {
    vehicleId: '68868291-5478-42cd-b0c4-cc77b2a78e21',
    organizationId: 'faa710c9-6d91-4079-a7d5-91fdccdec14a',
    role: 'TESLA_MODEL_3_SOFTWARE_INTEGRATION',
  },
  {
    vehicleId: '19fedd4b-c4e8-4de8-a125-dab293326e7e',
    organizationId: 'faa710c9-6d91-4079-a7d5-91fdccdec14a',
    role: 'VW_TIGUAN_R1',
  },
  {
    vehicleId: 'c10351f8-b6a2-4258-947f-631aeaa6d359',
    organizationId: 'faa710c9-6d91-4079-a7d5-91fdccdec14a',
    role: 'AUDI_A4_R1',
  },
  {
    vehicleId: '8c850ff1-4201-432b-af2e-2711dbc7ca48',
    organizationId: 'faa710c9-6d91-4079-a7d5-91fdccdec14a',
    role: 'VW_ARTEON_R1',
  },
] as const;

const FLEET_BY_VEHICLE_ID = new Map(
  DS4_ASSESSMENT_FLEET_VEHICLES_V1.map((v) => [v.vehicleId.toLowerCase(), v]),
);

export type Ds4AssessmentFleetAdmissionResultV1 =
  | { admitted: true; fleetVehicle: Ds4AssessmentFleetVehicleV1 }
  | { admitted: false; reason: 'VEHICLE_NOT_IN_ASSESSMENT_FLEET' | 'ORGANIZATION_TENANCY_MISMATCH' };

export function evaluateDs4AssessmentFleetAdmissionV1(scope: {
  organizationId: string;
  vehicleId: string;
}): Ds4AssessmentFleetAdmissionResultV1 {
  const fleetVehicle = FLEET_BY_VEHICLE_ID.get(scope.vehicleId.trim().toLowerCase());
  if (!fleetVehicle) {
    return { admitted: false, reason: 'VEHICLE_NOT_IN_ASSESSMENT_FLEET' };
  }
  if (fleetVehicle.organizationId !== scope.organizationId) {
    return { admitted: false, reason: 'ORGANIZATION_TENANCY_MISMATCH' };
  }
  return { admitted: true, fleetVehicle };
}

export function isVehicleInDs4AssessmentFleetV1(vehicleId: string): boolean {
  return FLEET_BY_VEHICLE_ID.has(vehicleId.trim().toLowerCase());
}
