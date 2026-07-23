import type {
  BookingLegalAcceptanceActorType,
  BookingLegalAcceptanceEventKind,
  BookingLegalAcceptanceLegalBasis,
  BookingLegalAcceptanceType,
  Prisma,
} from '@prisma/client';
import type { BookingLegalAcceptanceSource } from './booking-legal-acceptance.constants';

export interface BookingLegalAcceptanceActor {
  actorType: BookingLegalAcceptanceActorType;
  actorId?: string | null;
}

export interface RecordBookingLegalAcceptanceInput {
  organizationId: string;
  bookingId: string;
  customerId: string;
  actor: BookingLegalAcceptanceActor;
  eventKind?: BookingLegalAcceptanceEventKind;
  acceptanceType: BookingLegalAcceptanceType;
  documentType: string;
  documentVersion: string;
  immutableDocumentHash: string;
  language: string;
  legalBasis?: BookingLegalAcceptanceLegalBasis;
  purpose?: string | null;
  acceptedAt?: Date;
  source: BookingLegalAcceptanceSource | string;
  revokedAt?: Date | null;
  relatedAcceptanceId?: string | null;
  legalDocumentId?: string | null;
  generatedDocumentId?: string | null;
  handoverProtocolId?: string | null;
  requestId?: string | null;
  metadata?: Prisma.InputJsonValue | null;
}

export interface RevokeBookingLegalConsentInput {
  organizationId: string;
  bookingId: string;
  customerId: string;
  actor: BookingLegalAcceptanceActor;
  acceptanceId: string;
  source: BookingLegalAcceptanceSource | string;
  requestId?: string | null;
  metadata?: Prisma.InputJsonValue | null;
}

export interface ResolvedLegalDocumentRef {
  documentType: string;
  documentVersion: string;
  immutableDocumentHash: string;
  language: string;
  legalDocumentId: string | null;
  generatedDocumentId: string | null;
}
