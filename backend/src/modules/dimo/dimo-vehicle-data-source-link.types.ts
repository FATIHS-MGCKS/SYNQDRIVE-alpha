import type { DimoLinkProvenance } from './dimo-vehicle-data-source-link.contract';

export type DimoVehicleDataSourceLinkAction =
  | 'CREATE'
  | 'NOOP'
  | 'REACTIVATE'
  | 'CONFLICT'
  | 'SKIP';

export interface EnsureDimoVehicleDataSourceLinkInput {
  organizationId: string;
  vehicleId: string;
  dimoVehicleId: string;
  consentId?: string | null;
  linkedByUserId?: string | null;
  now?: Date;
  provenance?: DimoLinkProvenance;
  runId?: string;
}

export interface EnsureDimoVehicleDataSourceLinkResult {
  action: DimoVehicleDataSourceLinkAction;
  linkId: string | null;
  reason: string;
  dimoVehicleId: string;
  consentId: string | null;
}

export interface DimoConsentProvenance {
  consentId: string | null;
  consentStatus: string;
  selection: 'active' | 'latest_inactive' | 'none';
}

export interface DimoBackfillVehicleReport {
  vehicleId: string;
  vehicleRef: string;
  organizationId: string;
  dimoVehicleRelationValid: boolean;
  existingActiveDimoLink: boolean;
  existingInactiveDimoLink: boolean;
  candidateDimoVehicleId: string | null;
  consentProvenance: DimoConsentProvenance;
  plannedAction: DimoVehicleDataSourceLinkAction;
  reason: string;
}

export interface DimoBackfillSummary {
  mode: 'dry-run' | 'apply';
  organizationId: string | null;
  runId: string;
  scanned: number;
  plannedCreate: number;
  plannedReactivate: number;
  plannedNoop: number;
  plannedConflict: number;
  plannedSkip: number;
  applied: number;
  vehicles: DimoBackfillVehicleReport[];
}

export interface DimoProviderLinkDriftItem {
  vehicleId: string;
  vehicleRef: string;
  organizationId: string;
  dimoVehicleId: string;
  hasActiveDimoLink: boolean;
  classification: 'missing_link' | 'healthy' | 'ambiguous';
  reason: string;
}

export interface DimoProviderLinkDriftReport {
  scanned: number;
  missingLink: number;
  healthy: number;
  ambiguous: number;
  items: DimoProviderLinkDriftItem[];
}
