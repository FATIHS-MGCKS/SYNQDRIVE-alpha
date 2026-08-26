export type DimoConsentBackfillAction =
  | 'CREATE'
  | 'WIRE_CONSENT_ID'
  | 'NOOP'
  | 'CONFLICT'
  | 'SKIP';

export interface DimoConsentBackfillProposedConsent {
  vehicleId: string;
  organizationId: string;
  provider: 'DIMO';
  grantType: 'DIMO_DIRECT';
  status: 'ACTIVE';
  scopes: string[];
  providerVehicleRef: string;
  metadataJson: Record<string, unknown>;
  grantedAt: string;
  expiresAt: null;
  revokedAt: null;
  grantedByUserId: null;
}

export interface DimoConsentBackfillProposedLinkUpdate {
  linkId: string;
  currentConsentId: string | null;
  proposedConsentIdBinding: 'new-consent-id' | 'existing-active-consent-id';
}

export interface DimoConsentBackfillVehiclePlan {
  vehicleId: string;
  vehicleRef: string;
  organizationId: string;
  dimoVehicleId: string;
  dimoTokenId: number;
  dimoExternalId: string;
  activeDimoLinkId: string;
  currentConsentCount: number;
  currentActiveConsentId: string | null;
  currentLinkConsentId: string | null;
  plannedAction: DimoConsentBackfillAction;
  plannedLinkAction: 'WIRE_CONSENT_ID' | 'NOOP' | 'CONFLICT' | null;
  reason: string;
  proposedConsent: DimoConsentBackfillProposedConsent | null;
  proposedLinkUpdate: DimoConsentBackfillProposedLinkUpdate | null;
  identityChecks: {
    vehicleInOrg: boolean;
    linkInOrg: boolean;
    linkIsDimo: boolean;
    linkHasDimoVehicleId: boolean;
    tokenMapsToVehicle: boolean;
    dimoVehicleIdUnique: boolean;
    tokenIdUnique: boolean;
  };
}

export interface DimoConsentBackfillApplyResult {
  createdConsents: number;
  wiredConsentIds: number;
  mutatedVehicles: number;
  noopVehicles: number;
}

export interface DimoConsentBackfillSummary extends DimoConsentBackfillApplyResult {
  mode: 'dry-run' | 'apply';
  organizationId: string;
  runId: string;
  scanned: number;
  create: number;
  wireConsentId: number;
  noop: number;
  conflict: number;
  skip: number;
  /** @deprecated Use mutatedVehicles — kept for backward compatibility */
  applied: number;
  /** Apply executes all mutation targets in one DB transaction; any failure rolls back all. */
  atomicApply: boolean;
  /** False when atomicApply is enabled for mutation batches. */
  partialWritePossible: boolean;
  vehicles: DimoConsentBackfillVehiclePlan[];
}
