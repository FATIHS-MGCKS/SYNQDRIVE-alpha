/** Downstream domain entity created (or explicitly archived) by document apply. */
export type DocumentDownstreamEntityType =
  | 'service_event'
  | 'fine'
  | 'invoice'
  | 'damage'
  | 'tire_measurement'
  | 'battery_evidence'
  | 'brake_service'
  | 'archive';

/** Typed apply outcome — minimal provenance gate before APPLIED status. */
export interface DocumentApplyTypedResult {
  success: boolean;
  downstreamEntityType: DocumentDownstreamEntityType | null;
  downstreamEntityId: string | null;
  actionCount: number;
  errors: string[];
  /** Set when a vehicle service event was created (extraction FK). */
  serviceEventId?: string | null;
  detail?: unknown;
}

export interface ProvenApplyAuditDetails {
  success: true;
  downstreamEntityType: DocumentDownstreamEntityType;
  downstreamEntityId: string | null;
  actionCount: number;
  mode?: 'archive_only';
}
