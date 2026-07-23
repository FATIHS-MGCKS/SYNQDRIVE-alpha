// V4.6.75 — Booking Handover Protocol contract (pickup + return).
// V4.9.759 — performedBy* is server-derived from authenticated user; client fields rejected.
// V4.9.792 — Signature blobs removed from API responses; summaries + secure storage only.

import type { HandoverSignatureSummary } from './signature/booking-handover-signature.types';

export type HandoverKind = 'PICKUP' | 'RETURN';

/** Draft technical observation submitted with handover — created transactionally with protocol. */
export interface HandoverTechnicalObservationDraft {
  description: string;
  category?: string;
  affectedArea?: string;
  severity?: string;
  blocksRental?: boolean;
}

export interface HandoverProtocolDto {
  id: string;
  bookingId: string;
  vehicleId: string;
  kind: HandoverKind;
  performedAt: string;
  performedByUserId: string | null;
  performedByName: string | null;
  odometerKm: number;
  fuelPercent: number;
  fuelFull: boolean;
  exteriorClean: boolean;
  interiorClean: boolean;
  tiresSeasonOk: boolean;
  warningLightsOn: boolean;
  warningLightsNotes: string | null;
  notes: string | null;
  customerSignatureName: string | null;
  staffSignatureName: string | null;
  customerSignature: HandoverSignatureSummary;
  staffSignature: HandoverSignatureSummary;
  protocolCompleted: boolean;
  documentsAcknowledged: boolean;
  damageIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateHandoverProtocolPayload {
  // V4.6.81 — Backdate support. When the operator records a pickup that
  // physically happened earlier (customer arrived late, dispatcher logs
  // the handover after the fact, etc.), the UI sends `performedAt` as an
  // ISO-8601 timestamp. Omitted → server uses `now()` via the DB default.
  // The server enforces: not in the future, and not more than 7 days
  // before `booking.startDate` (see BookingsHandoverService).
  performedAt?: string | null;
  /** Mandatory when overriding soft pickup gate failures (requires override_handover permission). */
  pickupGateOverrideReason?: string | null;
  /** Required when rental eligibility gate returns MANUAL_APPROVAL_REQUIRED at pickup. */
  eligibilityApprovalId?: string | null;
  odometerKm: number;
  fuelPercent: number;
  fuelFull?: boolean;
  exteriorClean?: boolean;
  interiorClean?: boolean;
  tiresSeasonOk?: boolean;
  warningLightsOn?: boolean;
  warningLightsNotes?: string | null;
  notes?: string | null;
  customerSignatureName?: string | null;
  /** Accepted on ingest only — never echoed in list/summary responses. */
  customerSignatureDataUrl?: string | null;
  staffSignatureName?: string | null;
  /** Accepted on ingest only — never echoed in list/summary responses. */
  staffSignatureDataUrl?: string | null;
  documentsAcknowledged?: boolean;
  damageIds?: string[];
  /** Actual station where handover occurred (defaults to planned station). */
  actualStationId?: string | null;
  /** Technical observations to persist with the handover protocol (canonical VehicleComplaint rows). */
  technicalObservations?: HandoverTechnicalObservationDraft[];
}
