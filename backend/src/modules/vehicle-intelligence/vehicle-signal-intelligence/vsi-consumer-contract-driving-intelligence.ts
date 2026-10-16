/**
 * P4 read-only Driving Intelligence consumer contract surface.
 * Does not invoke DI algorithms or alter EXP021 GPS-speed QC paths.
 */
export const VSI_DI_CONSUMER_CONTRACT_VERSION = 'vsi-consumer-di-v1' as const;

export const VSI_DI_CONSUMER_FEATURES = {
  EXP021_TRIP_SPEED_QC: 'exp021_trip_speed_qc',
  EXP021_POSITION_CONTEXT: 'exp021_position_context',
  BEHAVIOR_ACCELERATOR: 'behavior_accelerator_evidence',
  BEHAVIOR_BRAKE: 'behavior_brake_evidence',
} as const;
