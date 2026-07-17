export const STATION_TIMEZONE_UTILITIES_VERSION = 1 as const;

export const DEFAULT_STATION_TIMEZONE = 'Europe/Berlin' as const;

export const StationTimezoneValidationCode = {
  INVALID_TIMEZONE: 'STATION_TIMEZONE_INVALID',
  INVALID_INSTANT: 'STATION_TIMEZONE_INVALID_INSTANT',
  INVALID_DATE: 'STATION_TIMEZONE_INVALID_DATE',
  INVALID_TIME: 'STATION_TIMEZONE_INVALID_TIME',
  UNRESOLVABLE_LOCAL_TIME: 'STATION_TIMEZONE_UNRESOLVABLE_LOCAL_TIME',
} as const;

export type StationTimezoneValidationCode =
  (typeof StationTimezoneValidationCode)[keyof typeof StationTimezoneValidationCode];

export interface StationTimezoneContractMetadata {
  version: typeof STATION_TIMEZONE_UTILITIES_VERSION;
  storagePolicy: 'UTC internally; station IANA timezone for business day boundaries';
  forbiddenSources: ['server-local-time', 'browser-local-time'];
  functions: readonly string[];
  reusedLibraries: readonly string[];
}

export function getStationTimezoneContractMetadata(): StationTimezoneContractMetadata {
  return {
    version: STATION_TIMEZONE_UTILITIES_VERSION,
    storagePolicy: 'UTC internally; station IANA timezone for business day boundaries',
    forbiddenSources: ['server-local-time', 'browser-local-time'],
    functions: [
      'stationLocalDate',
      'stationDayBoundsUtc',
      'isSameStationDay',
      'stationNow',
      'formatStationTime',
      'resolveOpeningWindow',
      'overdueRelativeToStation',
    ],
    reusedLibraries: [
      '@modules/pricing/tariff-instant.util',
      'Intl.DateTimeFormat',
    ],
  };
}
