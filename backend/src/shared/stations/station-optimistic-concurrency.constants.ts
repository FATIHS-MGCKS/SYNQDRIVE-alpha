export const StationConcurrencyErrorCode = {
  STATION_UPDATED_AT_CONFLICT: 'STATION_UPDATED_AT_CONFLICT',
  STATION_POSITION_VERSION_CONFLICT: 'STATION_POSITION_VERSION_CONFLICT',
} as const;

export type StationConcurrencyErrorCode =
  (typeof StationConcurrencyErrorCode)[keyof typeof StationConcurrencyErrorCode];
