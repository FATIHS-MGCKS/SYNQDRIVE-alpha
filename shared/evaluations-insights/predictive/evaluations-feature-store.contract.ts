/**
 * Predictive feature store contracts (Prompt 41/54).
 * Point-in-time, tenant-scoped, versioned feature snapshots for forecasting.
 */

export const FEATURE_SET_VERSION = 'feature-store-v1';
export const FEATURE_SNAPSHOT_RETENTION_MONTHS = 24;

export type PredictiveFeatureGrain = 'DAILY';

export type PredictiveFeatureScopeType = 'FLEET' | 'STATION' | 'VEHICLE_CLASS';

export type PredictiveFeatureValueStatus = 'ACTUAL' | 'MISSING' | 'ESTIMATED' | 'DELAYED';

export type PredictiveFeatureDataQualityStatus =
  | 'COMPLETE'
  | 'PARTIAL'
  | 'DELAYED'
  | 'INSUFFICIENT';

export type PredictiveFeatureValueType = 'integer' | 'float' | 'percent' | 'boolean' | 'string';

export interface PredictiveFeatureScope {
  type: PredictiveFeatureScopeType;
  stationId?: string | null;
  vehicleClassId?: string | null;
}

export interface PredictiveFeatureDefinition {
  key: string;
  version: number;
  valueType: PredictiveFeatureValueType;
  pii: false;
  timeReference: 'observation_date_local' | 'as_of_utc';
  description: string;
  /** Max days after observation date that late-arriving data may update this feature. */
  maxLateArrivalDays: number;
  sources: string[];
}

export interface PredictiveFeatureValue {
  value: number | string | boolean | null;
  status: PredictiveFeatureValueStatus;
}

export interface PredictiveFeatureSnapshotLineage {
  featureSetVersion: string;
  asOfUtc: string;
  timezone: string;
  observationDate: string;
  scope: PredictiveFeatureScope;
  sources: string[];
  recordsIncluded: {
    bookings: number;
    serviceCases: number;
    invoices: number;
    vehicles: number;
  };
  recordsExcluded: {
    futureLeakage: number;
    outOfScope: number;
  };
  buildFingerprint: string;
}

export interface PredictiveFeatureDataQuality {
  status: PredictiveFeatureDataQualityStatus;
  coveragePercent: number;
  missingFeatureKeys: string[];
  delayedFeatureKeys: string[];
  notes: string[];
}

export interface PredictiveFeatureSnapshotPayload {
  featureSetVersion: string;
  grain: PredictiveFeatureGrain;
  observationDate: string;
  asOfUtc: string;
  timezone: string;
  scope: PredictiveFeatureScope;
  features: Record<string, PredictiveFeatureValue>;
  dataQuality: PredictiveFeatureDataQuality;
  lineage: PredictiveFeatureSnapshotLineage;
}

export interface PredictiveFeatureBookingRow {
  id: string;
  status: string;
  createdAt: string;
  startDate: string;
  endDate: string;
  cancelledAt: string | null;
  completedAt: string | null;
  totalPriceCents: number | null;
  kmDriven: number | null;
  pickupStationId: string | null;
  vehicleId: string;
  vehicleRentalCategoryId: string | null;
}

export interface PredictiveFeatureServiceCaseRow {
  id: string;
  vehicleId: string;
  category: string;
  openedAt: string;
  completedAt: string | null;
  downtimeStart: string | null;
  downtimeEnd: string | null;
  blocksRental: boolean;
  actualCostCents: number | null;
}

export interface PredictiveFeatureInvoiceRow {
  id: string;
  type: string;
  invoiceDate: string;
  totalCents: number;
  paidAt: string | null;
  vehicleId: string | null;
  currency: string;
}

export interface PredictiveFeatureFleetContext {
  vehicleCount: number;
  vehicleIds: string[];
}

export interface PredictiveFeatureExtractionInput {
  organizationId: string;
  timezone: string;
  observationDate: string;
  asOfUtc: string;
  periodStartUtc: string;
  periodEndUtc: string;
  scope: PredictiveFeatureScope;
  bookings: PredictiveFeatureBookingRow[];
  serviceCases: PredictiveFeatureServiceCaseRow[];
  invoices: PredictiveFeatureInvoiceRow[];
  fleet: PredictiveFeatureFleetContext;
  /** When true, treat records with event timestamps after asOfUtc as delayed (not future leakage). */
  allowDelayedSameDay?: boolean;
}
