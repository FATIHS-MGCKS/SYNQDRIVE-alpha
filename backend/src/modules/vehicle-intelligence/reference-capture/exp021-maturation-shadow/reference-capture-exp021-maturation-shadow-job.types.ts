/** BullMQ job payload — deterministic identity excludes enrollmentEventId. */
export type Exp021MaturationShadowJobData = {
  observationSlotId: string;
  windowFamilyId: string;
  windowStratumId: string;
  plannedAgeMs: number;
  organizationId: string;
  vehicleId: string;
  tokenId: number;
  /** Application-level transport retry ordinal (0 = primary schedule). */
  transportRetryOrdinal: number;
};
