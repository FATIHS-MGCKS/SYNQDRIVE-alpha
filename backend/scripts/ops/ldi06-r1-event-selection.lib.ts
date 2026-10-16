/**
 * LDI-06 — R1 event-first trip selection (single vehicle scope).
 */
export const LDI06_TARGET_VEHICLE_ID = '8c850ff1-4201-432b-af2e-2711dbc7ca48';
export const LDI06_EXCLUDED_VEHICLE_ID = '19fedd4b-c4e8-4de8-a125-dab293326e7e';
export const LDI06_ORG_ID = 'faa710c9-6d91-4079-a7d5-91fdccdec14a';

export const BRAKE_TYPES = new Set(['HARSH_BRAKING', 'EXTREME_BRAKING']);
export const ACCEL_TYPES = new Set(['HARSH_ACCELERATION', 'EXTREME_ACCELERATION']);
export const CORNER_TYPES = new Set(['HARSH_CORNERING']);

export function buildLdi06ResultLines(input: {
  nativeTotal: number;
  accelCount: number;
  brakeCount: number;
  candidateCount: number;
  selectedTripId: string | null;
  gpsL3: string;
  hf: string;
  obd: string;
  fourStream: string;
  fusionReady: string;
}): string[] {
  return [
    'LDI06_RESULT=EVENT_FIRST_SELECTION_COMPLETE',
    `TARGET_VEHICLE=${LDI06_TARGET_VEHICLE_ID}`,
    `NATIVE_EVENT_COUNT_VERIFIED=${input.nativeTotal}`,
    `ACCEL_EVENT_COUNT=${input.accelCount}`,
    `BRAKE_EVENT_COUNT=${input.brakeCount}`,
    `CANDIDATE_TRIPS=${input.candidateCount}`,
    `SELECTED_TRIP=${input.selectedTripId ?? 'NONE'}`,
    `GPS_L3_COVERAGE=${input.gpsL3}`,
    `HF_COVERAGE=${input.hf}`,
    `OBD_COVERAGE=${input.obd}`,
    `FOUR_STREAM_OVERLAP=${input.fourStream}`,
    `FUSION_READY=${input.fusionReady}`,
    'PRODUCTION_MUTATIONS=NONE',
    'NEXT_SAFE_ACTION=Run_LDI03_combined_pin_on_fusionCapableAlternate_or_backfill_S4_for_event_rich_trips',
  ];
}
