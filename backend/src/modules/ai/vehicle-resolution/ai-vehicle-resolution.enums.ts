export const AI_VEHICLE_MATCH_TYPES = [
  'internal_id',
  'license_plate_exact',
  'license_plate_in_message',
  'vin_exact',
  'dimo_token_id',
  'vehicle_name_exact',
  'make_model_exact',
  'make_model_partial',
  'booking_assignment',
  'none',
] as const;

export type AiVehicleMatchType = (typeof AI_VEHICLE_MATCH_TYPES)[number];

/** Minimum confidence to accept a non-exact identifier match. */
export const AI_VEHICLE_MIN_CONFIDENCE = 0.55;

/** Confidence gap below top candidate that still counts as ambiguous. */
export const AI_VEHICLE_AMBIGUITY_DELTA = 0.1;

export const AI_VEHICLE_MATCH_BASE_SCORE: Readonly<Record<AiVehicleMatchType, number>> = {
  internal_id: 1,
  license_plate_exact: 0.95,
  license_plate_in_message: 0.72,
  vin_exact: 0.98,
  dimo_token_id: 0.95,
  vehicle_name_exact: 0.88,
  make_model_exact: 0.78,
  make_model_partial: 0.55,
  booking_assignment: 0.9,
  none: 0,
};
