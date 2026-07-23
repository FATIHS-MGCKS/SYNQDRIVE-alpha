import type { HandoverKind } from '@prisma/client';

export interface HandoverTechnicalObservationCommand {
  description: string;
  category?: string;
  affectedArea?: string;
  severity?: string;
  blocksRental?: boolean;
}

/**
 * Domain command for handover protocol creation — no client actor fields.
 */
export interface CreateHandoverCommand {
  performedAt?: string | null;
  pickupGateOverrideReason?: string | null;
  odometerOverrideReason?: string | null;
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
  actualStationId?: string | null;
  technicalObservations?: HandoverTechnicalObservationCommand[];
  keysHandedOver?: boolean;
  idDocumentVerified?: boolean;
  licenseVerified?: boolean;
}

export interface HandoverValidationContext {
  organizationId: string;
  bookingId: string;
  kind: HandoverKind;
  vehicleId: string;
  bookingStatus: string;
  scheduledStartDate: Date;
  pickupOdometerKm?: number | null;
  hasOverridePermission: boolean;
}
