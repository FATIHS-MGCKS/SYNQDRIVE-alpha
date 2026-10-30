import type { Ds4SpeedAuthorityPartitionV1 } from '../ds4-trip-assessment-v1.contract';

/** Pilot org scope — pinned from production feasibility audit (read-only). */
export const DS4_LAYER2_P2_OFFLINE_PILOT_ORGANIZATION_ID_V1 =
  'faa710c9-6d91-4079-a7d5-91fdccdec14a' as const;

export type Ds4Layer2P2OfflinePilotVehicleLineV1 = 'AUDI_A4' | 'VW_TIGUAN' | 'TESLA_MODEL_3';

export type Ds4Layer2P2OfflinePilotCohortEntryV1 = {
  tripId: string;
  vehicleLine: Ds4Layer2P2OfflinePilotVehicleLineV1;
  expectedSpeedAuthority: Ds4SpeedAuthorityPartitionV1;
  feasibilityAuditClass: 'RECONSTRUCTABLE_V2';
};

/**
 * Eight motion-only trips from the 11 RECONSTRUCTABLE_V2 feasibility cohort.
 * Source: DS4_LAYER2_P2_HISTORICAL_RECONSTRUCTION_FEASIBILITY @ production SHA 7ab55a0d…
 */
export const DS4_LAYER2_P2_OFFLINE_PILOT_COHORT_V1: readonly Ds4Layer2P2OfflinePilotCohortEntryV1[] = [
  {
    tripId: 'ba66e2ad-a824-4944-83c9-4472a5508e82',
    vehicleLine: 'AUDI_A4',
    expectedSpeedAuthority: 'C4_ONLY',
    feasibilityAuditClass: 'RECONSTRUCTABLE_V2',
  },
  {
    tripId: 'd06f1e85-cf2f-4d7f-88d7-13e5c0a24ac1',
    vehicleLine: 'AUDI_A4',
    expectedSpeedAuthority: 'C4_ONLY',
    feasibilityAuditClass: 'RECONSTRUCTABLE_V2',
  },
  {
    tripId: '3c8827e9-7dd0-46a8-ae7c-eb5c7495c65b',
    vehicleLine: 'AUDI_A4',
    expectedSpeedAuthority: 'C4_ONLY',
    feasibilityAuditClass: 'RECONSTRUCTABLE_V2',
  },
  {
    tripId: '004f9579-2875-42f2-8aa7-e82c343c954e',
    vehicleLine: 'AUDI_A4',
    expectedSpeedAuthority: 'C4_ONLY',
    feasibilityAuditClass: 'RECONSTRUCTABLE_V2',
  },
  {
    tripId: '4dcc7cbf-9d1c-4efa-b395-6ad540091143',
    vehicleLine: 'VW_TIGUAN',
    expectedSpeedAuthority: 'C5_1_PREFERRED',
    feasibilityAuditClass: 'RECONSTRUCTABLE_V2',
  },
  {
    tripId: 'dbdded5c-ee72-40f3-91bb-62d5a1b7f7ff',
    vehicleLine: 'VW_TIGUAN',
    expectedSpeedAuthority: 'C5_1_PREFERRED',
    feasibilityAuditClass: 'RECONSTRUCTABLE_V2',
  },
  {
    tripId: '2ccf0d2a-d5b8-4612-aabe-b4c1f387d9af',
    vehicleLine: 'VW_TIGUAN',
    expectedSpeedAuthority: 'C5_1_PREFERRED',
    feasibilityAuditClass: 'RECONSTRUCTABLE_V2',
  },
  {
    tripId: 'b304e9ad-0dcb-4b69-a93e-5364078a20a1',
    vehicleLine: 'TESLA_MODEL_3',
    expectedSpeedAuthority: 'C5_1_PREFERRED',
    feasibilityAuditClass: 'RECONSTRUCTABLE_V2',
  },
] as const;

export function assertDs4Layer2P2PilotCohortIntegrityV1(): void {
  if (DS4_LAYER2_P2_OFFLINE_PILOT_COHORT_V1.length !== 8) {
    throw new Error('P2 pilot cohort must contain exactly 8 trips');
  }
  const tripIds = new Set<string>();
  for (const entry of DS4_LAYER2_P2_OFFLINE_PILOT_COHORT_V1) {
    if (tripIds.has(entry.tripId)) {
      throw new Error(`Duplicate P2 pilot tripId: ${entry.tripId}`);
    }
    tripIds.add(entry.tripId);
  }
  const audi = DS4_LAYER2_P2_OFFLINE_PILOT_COHORT_V1.filter((e) => e.vehicleLine === 'AUDI_A4');
  const tiguan = DS4_LAYER2_P2_OFFLINE_PILOT_COHORT_V1.filter((e) => e.vehicleLine === 'VW_TIGUAN');
  const tesla = DS4_LAYER2_P2_OFFLINE_PILOT_COHORT_V1.filter((e) => e.vehicleLine === 'TESLA_MODEL_3');
  if (audi.length !== 4 || tiguan.length !== 3 || tesla.length !== 1) {
    throw new Error('P2 pilot cohort vehicle-line counts must be Audi 4 / Tiguan 3 / Tesla 1');
  }
}
