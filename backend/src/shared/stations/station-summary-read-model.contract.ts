import type { StationStatus, StationType } from '@prisma/client';
import type {
  StationOperationsCapabilityView,
  StationOperationsDto,
  StationOperationsLabeledStatus,
  StationOperationsReason,
  StationAfterHoursCapabilityStatus,
  StationKeyboxStatus,
  StationOpeningStatus,
} from './station-operations.contract';
import type { StationKpisResult, StationKpisScopeContext } from './station-kpis.contract';

export const STATION_SUMMARY_READ_MODEL_VERSION = 1 as const;

export interface StationSummaryMasterData {
  id: string;
  organizationId: string;
  name: string;
  code: string | null;
  address: string | null;
  addressLine2: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  managerName: string | null;
  timezone: string;
  capacity: number | null;
}

export interface StationSummaryLifecycle {
  status: StationStatus;
  statusLabel: string;
  type: StationType;
  typeLabel: string;
  isPrimary: boolean;
  archived: boolean;
  archivedAt: string | null;
}

export interface StationSummaryOperationalCapabilities {
  pickup: StationOperationsCapabilityView;
  return: StationOperationsCapabilityView;
  afterHours: StationOperationsLabeledStatus<StationAfterHoursCapabilityStatus>;
  keybox: StationOperationsLabeledStatus<StationKeyboxStatus>;
}

export interface StationSummaryPartialDataStatus {
  complete: boolean;
  unknownMetricNames: string[];
  reasons: Array<{ code: string; message: string }>;
}

export interface StationSummaryReadModel {
  version: typeof STATION_SUMMARY_READ_MODEL_VERSION;
  stationId: string;
  organizationId: string;
  lastCalculatedAt: string;
  masterData: StationSummaryMasterData;
  lifecycle: StationSummaryLifecycle;
  openingStatus: StationOperationsLabeledStatus<StationOpeningStatus>;
  operationalCapabilities: StationSummaryOperationalCapabilities;
  kpis: StationKpisResult;
  configurationProblems: StationOperationsReason[];
  operationalWarnings: StationOperationsReason[];
  partialData: StationSummaryPartialDataStatus;
  scope: StationKpisScopeContext;
  /** Server-side read model — clients must not recompute KPIs or capabilities. */
  frontendRecomputation: false;
}

export interface StationSummaryReadModelAssemblyInput {
  evaluatedAt: string;
  masterData: StationSummaryMasterData;
  lifecycle: StationSummaryLifecycle;
  operations: StationOperationsDto;
  kpis: StationKpisResult;
  scope: StationKpisScopeContext;
}

export interface StationSummaryReadModelContractMetadata {
  version: typeof STATION_SUMMARY_READ_MODEL_VERSION;
  resolver: 'station-summary-read-model.resolver';
  frontendRecomputation: false;
  sections: readonly string[];
}

export function getStationSummaryReadModelContractMetadata(): StationSummaryReadModelContractMetadata {
  return {
    version: STATION_SUMMARY_READ_MODEL_VERSION,
    resolver: 'station-summary-read-model.resolver',
    frontendRecomputation: false,
    sections: [
      'masterData',
      'lifecycle',
      'openingStatus',
      'operationalCapabilities',
      'kpis',
      'configurationProblems',
      'operationalWarnings',
      'partialData',
      'lastCalculatedAt',
    ],
  };
}
