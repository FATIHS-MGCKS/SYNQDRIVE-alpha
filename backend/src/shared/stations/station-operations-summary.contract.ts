export const STATION_OPERATIONS_SUMMARY_VERSION = 1 as const;

export const StationOperationsTaskCategory = {
  STATION_LINKED: 'stationLinked',
  VEHICLE_ON_SITE: 'vehicleOnSite',
  BOOKING_PICKUP_RETURN: 'bookingPickupReturn',
  OVERDUE_PICKUP_RETURN: 'overduePickupReturn',
  TRANSFER: 'transfer',
} as const;

export type StationOperationsTaskCategory =
  (typeof StationOperationsTaskCategory)[keyof typeof StationOperationsTaskCategory];

export const StationOperationsNotificationCategory = {
  STATION_LINKED: 'stationLinked',
  VEHICLE_ON_SITE: 'vehicleOnSite',
  BOOKING_PICKUP_RETURN: 'bookingPickupReturn',
  TRANSFER: 'transfer',
} as const;

export type StationOperationsNotificationCategory =
  (typeof StationOperationsNotificationCategory)[keyof typeof StationOperationsNotificationCategory];

export interface StationOperationsCategoryCount {
  count: number;
}

export interface StationOperationsTaskSummary {
  total: number;
  categories: Record<StationOperationsTaskCategory, StationOperationsCategoryCount>;
}

export interface StationOperationsNotificationSummary {
  total: number;
  categories: Record<StationOperationsNotificationCategory, StationOperationsCategoryCount>;
}

export interface StationOperationsProblemsSummary {
  configurationProblems: number;
  operationalWarnings: number;
  total: number;
}

export interface StationOperationsSummary {
  version: typeof STATION_OPERATIONS_SUMMARY_VERSION;
  stationId: string;
  evaluatedAt: string;
  tasks: StationOperationsTaskSummary;
  notifications: StationOperationsNotificationSummary;
  operationalProblems: StationOperationsProblemsSummary;
}

export const STATION_OPERATIONS_BOOKING_TASK_TYPES = [
  'BOOKING_PREPARATION',
  'BOOKING_PICKUP',
  'BOOKING_RETURN',
] as const;

export type StationOperationsBookingTaskType =
  (typeof STATION_OPERATIONS_BOOKING_TASK_TYPES)[number];
