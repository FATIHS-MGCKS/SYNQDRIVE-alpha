// V4.6.75 — Booking Handover Protocol contract (pickup + return).
// Payloads are intentionally lean: the operator workflow is
//   booking (CONFIRMED) → pickup handover → ACTIVE → return handover → COMPLETED
// so only the two POST payloads are exposed here; queries are served via
// the existing bookings list/detail routes.

import type { HandoverStationRulesResult } from '@shared/stations/handover-station-rules.contract';

export type HandoverKind = 'PICKUP' | 'RETURN';

export interface HandoverStationRulesRequest {
  manualOverride?: {
    reason: string;
    expiresAt?: string | null;
  } | null;
}

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
  customerSignatureDataUrl: string | null;
  staffSignatureName: string | null;
  staffSignatureDataUrl: string | null;
  documentsAcknowledged: boolean;
  damageIds: string[];
  actualStationId: string | null;
  stationRules: HandoverStationRulesResult | null;
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
  performedByUserId?: string | null;
  performedByName?: string | null;
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
  customerSignatureDataUrl?: string | null;
  staffSignatureName?: string | null;
  staffSignatureDataUrl?: string | null;
  documentsAcknowledged?: boolean;
  damageIds?: string[];
  /** Actual station where handover occurred (defaults to planned station). */
  actualStationId?: string | null;
  /** Technical observations to persist with the handover protocol (canonical VehicleComplaint rows). */
  technicalObservations?: HandoverTechnicalObservationDraft[];
  /** Server-validated station rules override for WARNING / MANUAL_CONFIRMATION at handover time. */
  stationBookingRules?: HandoverStationRulesRequest | null;
}
