export const STATION_OPERATIONS_TIMELINE_VERSION = 1 as const;

export const STATION_OPERATIONS_TIMELINE_DEFAULT_PAGE_SIZE = 50 as const;
export const STATION_OPERATIONS_TIMELINE_MAX_PAGE_SIZE = 200 as const;
export const STATION_OPERATIONS_TIMELINE_DEFAULT_RANGE_DAYS = 14 as const;

export const StationOperationsTimelineEntryType = {
  PICKUP: 'PICKUP',
  RETURN: 'RETURN',
  OVERDUE_RETURN: 'OVERDUE_RETURN',
  ONE_WAY_ARRIVAL: 'ONE_WAY_ARRIVAL',
  TRANSFER_ARRIVAL: 'TRANSFER_ARRIVAL',
  TRANSFER_DEPARTURE: 'TRANSFER_DEPARTURE',
  AFTER_HOURS_EVENT: 'AFTER_HOURS_EVENT',
  OPERATIONAL_TASK: 'OPERATIONAL_TASK',
} as const;

export type StationOperationsTimelineEntryType =
  (typeof StationOperationsTimelineEntryType)[keyof typeof StationOperationsTimelineEntryType];

export const StationOperationsTimelineSortOrder = {
  ASC: 'asc',
  DESC: 'desc',
} as const;

export type StationOperationsTimelineSortOrder =
  (typeof StationOperationsTimelineSortOrder)[keyof typeof StationOperationsTimelineSortOrder];

export interface StationOperationsTimelineReference {
  bookingId: string | null;
  vehicleId: string | null;
  transferId: string | null;
  taskId: string | null;
  bookingLabel: string | null;
  vehicleLabel: string | null;
}

export interface StationOperationsTimelineEntry {
  id: string;
  type: StationOperationsTimelineEntryType;
  status: string;
  instantUtc: string;
  stationLocalTime: string;
  stationLocalDate: string;
  references: StationOperationsTimelineReference;
  actionRequired: boolean;
  ruleWarning: boolean;
  ruleWarningCodes: string[];
  deepLink: string;
}

export interface StationOperationsTimelinePagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface StationOperationsTimelineWindow {
  fromUtc: string;
  toUtc: string;
  timezone: string;
}

export interface StationOperationsTimelineReadModel {
  version: typeof STATION_OPERATIONS_TIMELINE_VERSION;
  stationId: string;
  organizationId: string;
  evaluatedAt: string;
  window: StationOperationsTimelineWindow;
  sortOrder: StationOperationsTimelineSortOrder;
  pagination: StationOperationsTimelinePagination;
  entries: StationOperationsTimelineEntry[];
  scope: {
    applied: boolean;
    mode: 'ALL_STATIONS' | 'SCOPED_STATIONS';
  };
  frontendRecomputation: false;
}

export interface StationOperationsTimelineContractMetadata {
  version: typeof STATION_OPERATIONS_TIMELINE_VERSION;
  resolver: 'station-operations-timeline.resolver';
  entryTypes: readonly StationOperationsTimelineEntryType[];
  defaultPageSize: number;
  maxPageSize: number;
  defaultRangeDays: number;
  frontendRecomputation: false;
}

export function getStationOperationsTimelineContractMetadata(): StationOperationsTimelineContractMetadata {
  return {
    version: STATION_OPERATIONS_TIMELINE_VERSION,
    resolver: 'station-operations-timeline.resolver',
    entryTypes: Object.values(StationOperationsTimelineEntryType),
    defaultPageSize: STATION_OPERATIONS_TIMELINE_DEFAULT_PAGE_SIZE,
    maxPageSize: STATION_OPERATIONS_TIMELINE_MAX_PAGE_SIZE,
    defaultRangeDays: STATION_OPERATIONS_TIMELINE_DEFAULT_RANGE_DAYS,
    frontendRecomputation: false,
  };
}
