import type { VsiProfileLifecycleMaterializationMode } from './vsi-profile-materialization.service';

export type VsiProfileRevisionMaterializationTrigger =
  | VsiProfileLifecycleMaterializationMode
  | 'SOURCE_LINK_LIFECYCLE';

export type VsiProfileRevisionSourceLinkLifecycleContextV1 = {
  version: 'vsi-profile-revision-link-context-v1';
  linkId: string;
  isActive: boolean;
  activatedAt: string;
  deactivatedAt: string | null;
  supersededByLinkId: string | null;
  lifecycleLimitationsAppended?: string[];
};

export type VsiProfileRevisionSourceProvenanceV1 = {
  version: 'vsi-profile-revision-provenance-v1';
  declaredCatalogCheckedAt: string | null;
  lastMaterializedSourceTimestamp: string | null;
  lastMaterializedProviderFetchAt: string | null;
  lastProvenStrictSourceAdvanceAt: string | null;
};

export type VsiProfileRevisionHistoryRowV1 = {
  organizationId: string;
  vehicleId: string;
  providerSourceLinkId: string;
  profileRevision: number;
  profileContractVersion: string;
  contentFingerprint: string;
  providerIdentity: string;
  verifiedModality: string | null;
  telemetrySourceFamily: string | null;
  evaluatedAt: Date;
  recordedAt: Date;
  signalsSnapshot: unknown;
  profileLimitations: string[];
  materializationTrigger: VsiProfileRevisionMaterializationTrigger;
  sourceLinkLifecycleContext: VsiProfileRevisionSourceLinkLifecycleContextV1;
  sourceProvenance: VsiProfileRevisionSourceProvenanceV1;
};
