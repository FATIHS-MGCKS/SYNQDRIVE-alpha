import type { HandoverKind } from '@prisma/client';

export const HANDOVER_DRAFT_SCHEMA_VERSION = 1;

/** Default abandoned-draft retention — 7 days from last update. */
export const HANDOVER_DRAFT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export const HANDOVER_DRAFT_STEPS = [
  'vehicle',
  'condition',
  'damages',
  'documents',
  'signatures',
  'review',
] as const;

export type HandoverDraftStepId = (typeof HANDOVER_DRAFT_STEPS)[number];

export interface HandoverDraftUploadRef {
  extractionId: string;
  documentType?: string | null;
  confirmedAt?: string | null;
}

export interface HandoverDraftTechnicalObservation {
  id: string;
  description: string;
  category?: string | null;
  affectedArea?: string | null;
  severity?: string | null;
  blocksRental?: boolean;
}

export interface HandoverDraftFormData {
  odometerKm: string;
  fuelPercent: number;
  fuelFull: boolean;
  performedAtLocal: string;
  checks: {
    exteriorClean: boolean;
    interiorClean: boolean;
    tiresSeasonOk: boolean;
    warningLightsOn: boolean;
    documentsAcknowledged: boolean;
  };
  warningLightsNotes: string;
  notes: string;
  staffId: string;
  staffName: string;
  actualStationId: string;
  selectedDamageIds: string[];
  tireMeasurementCaptured: boolean;
  technicalObservationDrafts: HandoverDraftTechnicalObservation[];
}

export interface HandoverDraftSignatureStatus {
  customer: { name: string | null; captured: boolean };
  staff: { name: string | null; captured: boolean };
}

export interface HandoverSessionDraftPayload {
  schemaVersion: number;
  currentStep: HandoverDraftStepId;
  form: HandoverDraftFormData;
  uploadRefs: HandoverDraftUploadRef[];
  signatureStatus: HandoverDraftSignatureStatus;
}

export interface HandoverDraftDto {
  id: string;
  organizationId: string;
  stationId: string | null;
  bookingId: string;
  vehicleId: string;
  kind: HandoverKind;
  status: string;
  currentStep: HandoverDraftStepId | null;
  version: number;
  draft: HandoverSessionDraftPayload | null;
  blockingRequirements: Array<{ code: string; message: string }>;
  startedByUserId: string | null;
  assignedToUserId: string | null;
  updatedByUserId: string | null;
  lockedByUserId: string | null;
  lockedAt: string | null;
  expiresAt: string | null;
  retentionExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  expired: boolean;
  editable: boolean;
}

export interface HandoverDraftView {
  lifecycleStatus: string;
  draft: HandoverDraftDto | null;
}
