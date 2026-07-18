export const STATION_VEHICLE_WORKFLOW_CONTRACT_VERSION = 1 as const;

export const STATION_VEHICLE_WORKFLOW_DEFAULT_PAGE_SIZE = 25 as const;
export const STATION_VEHICLE_WORKFLOW_MAX_PAGE_SIZE = 100 as const;

export const StationVehicleWorkflowType = {
  CHANGE_HOME: 'change_home',
  REMOVE_HOME: 'remove_home',
  CORRECT_CURRENT: 'correct_current',
  PLAN_TRANSFER: 'plan_transfer',
  CHECK_IN: 'check_in',
} as const;

export type StationVehicleWorkflowType =
  (typeof StationVehicleWorkflowType)[keyof typeof StationVehicleWorkflowType];

export interface StationVehicleWorkflowStationRef {
  id: string;
  name: string;
  code: string | null;
  status: string;
}

export interface StationVehicleWorkflowVehicleRow {
  id: string;
  licensePlate: string | null;
  make: string;
  model: string;
  vehicleName: string | null;
  rentalStatus: string;
  homeStation: StationVehicleWorkflowStationRef | null;
  currentStation: StationVehicleWorkflowStationRef | null;
  expectedStation: StationVehicleWorkflowStationRef | null;
  stationPositionVersion: number;
  isRented: boolean;
}

export interface StationVehicleWorkflowVehicleLookupResult {
  version: typeof STATION_VEHICLE_WORKFLOW_CONTRACT_VERSION;
  organizationId: string;
  contextStationId: string | null;
  search: string | null;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  vehicles: StationVehicleWorkflowVehicleRow[];
  frontendRecomputation: false;
}

export interface StationVehicleWorkflowIssue {
  code: string;
  message: string;
}

export interface StationVehicleWorkflowPreviewResult {
  workflow: StationVehicleWorkflowType;
  allowed: boolean;
  idempotent: boolean;
  command: string;
  vehicleId: string;
  licensePlate: string | null;
  vehicleLabel: string | null;
  rentalStatus: string;
  from: {
    homeStation: StationVehicleWorkflowStationRef | null;
    currentStation: StationVehicleWorkflowStationRef | null;
    expectedStation: StationVehicleWorkflowStationRef | null;
  };
  to: {
    homeStation: StationVehicleWorkflowStationRef | null;
    currentStation: StationVehicleWorkflowStationRef | null;
    expectedStation: StationVehicleWorkflowStationRef | null;
  };
  warnings: StationVehicleWorkflowIssue[];
  blockingReasons: StationVehicleWorkflowIssue[];
  concurrency: {
    stationPositionVersion: number;
  };
  manualOverrideRequired?: boolean;
}

export function getStationVehicleWorkflowContractMetadata() {
  return {
    version: STATION_VEHICLE_WORKFLOW_CONTRACT_VERSION,
    workflows: Object.values(StationVehicleWorkflowType),
    limits: {
      defaultPageSize: STATION_VEHICLE_WORKFLOW_DEFAULT_PAGE_SIZE,
      maxPageSize: STATION_VEHICLE_WORKFLOW_MAX_PAGE_SIZE,
    },
    frontendRecomputation: false as const,
  };
}
