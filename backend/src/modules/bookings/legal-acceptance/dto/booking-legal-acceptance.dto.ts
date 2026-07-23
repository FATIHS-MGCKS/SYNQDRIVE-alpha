import type { BookingLegalAcceptance } from '@prisma/client';
import {
  IsEnum,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import type {
  BookingLegalAcceptanceActorType,
  BookingLegalAcceptanceType,
} from '@prisma/client';

export class RecordBookingLegalAcceptanceBodyDto {
  @IsUUID('4')
  customerId!: string;

  @IsEnum(['CUSTOMER', 'STAFF_USER', 'SYSTEM', 'AUTHORIZED_DRIVER'] as const)
  actorType!: BookingLegalAcceptanceActorType;

  @IsOptional()
  @IsString()
  actorId?: string;

  @IsEnum([
    'TERMS_CONTRACT_ACCEPTANCE',
    'PRIVACY_NOTICE_ACKNOWLEDGMENT',
    'MARKETING_CONSENT',
    'OTHER_CONSENT',
    'RENTAL_CONTRACT_SIGNATURE',
    'HANDOVER_SIGNATURE',
    'RETURN_SIGNATURE',
  ] as const)
  acceptanceType!: BookingLegalAcceptanceType;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  documentType!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  documentVersion!: string;

  @IsString()
  @MinLength(64)
  @MaxLength(128)
  immutableDocumentHash!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(16)
  language!: string;

  @IsOptional()
  @IsEnum([
    'CONTRACT',
    'LEGAL_OBLIGATION',
    'LEGITIMATE_INTEREST',
    'CONSENT',
    'NOTICE_ACKNOWLEDGMENT',
  ] as const)
  legalBasis?: 'CONTRACT' | 'LEGAL_OBLIGATION' | 'LEGITIMATE_INTEREST' | 'CONSENT' | 'NOTICE_ACKNOWLEDGMENT';

  @IsOptional()
  @IsString()
  @MaxLength(512)
  purpose?: string;

  @IsOptional()
  @IsISO8601()
  acceptedAt?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  source!: string;

  @IsOptional()
  @IsUUID('4')
  legalDocumentId?: string;

  @IsOptional()
  @IsUUID('4')
  generatedDocumentId?: string;

  @IsOptional()
  @IsUUID('4')
  handoverProtocolId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  requestId?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class RevokeBookingLegalConsentBodyDto {
  @IsUUID('4')
  customerId!: string;

  @IsEnum(['CUSTOMER', 'STAFF_USER', 'SYSTEM', 'AUTHORIZED_DRIVER'] as const)
  actorType!: BookingLegalAcceptanceActorType;

  @IsOptional()
  @IsString()
  actorId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  source!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  requestId?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export interface BookingLegalAcceptanceDto {
  id: string;
  organizationId: string;
  bookingId: string;
  customerId: string;
  actorType: string;
  actorId: string | null;
  eventKind: string;
  acceptanceType: string;
  documentType: string;
  documentVersion: string;
  immutableDocumentHash: string;
  language: string;
  legalBasis: string;
  purpose: string | null;
  acceptedAt: string;
  source: string;
  revokedAt: string | null;
  relatedAcceptanceId: string | null;
  legalDocumentId: string | null;
  generatedDocumentId: string | null;
  legalDocumentSnapshotId: string | null;
  handoverProtocolId: string | null;
  requestId: string | null;
  metadata: unknown;
  retentionClass: string;
  retainUntil: string | null;
  legalHold: boolean;
  createdAt: string;
}

export function toBookingLegalAcceptanceDto(
  row: BookingLegalAcceptance,
): BookingLegalAcceptanceDto {
  return {
    id: row.id,
    organizationId: row.organizationId,
    bookingId: row.bookingId,
    customerId: row.customerId,
    actorType: row.actorType,
    actorId: row.actorId,
    eventKind: row.eventKind,
    acceptanceType: row.acceptanceType,
    documentType: row.documentType,
    documentVersion: row.documentVersion,
    immutableDocumentHash: row.immutableDocumentHash,
    language: row.language,
    legalBasis: row.legalBasis,
    purpose: row.purpose,
    acceptedAt: row.acceptedAt.toISOString(),
    source: row.source,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    relatedAcceptanceId: row.relatedAcceptanceId,
    legalDocumentId: row.legalDocumentId,
    generatedDocumentId: row.generatedDocumentId,
    legalDocumentSnapshotId: row.legalDocumentSnapshotId,
    handoverProtocolId: row.handoverProtocolId,
    requestId: row.requestId,
    metadata: row.metadata,
    retentionClass: row.retentionClass,
    retainUntil: row.retainUntil?.toISOString() ?? null,
    legalHold: row.legalHold,
    createdAt: row.createdAt.toISOString(),
  };
}
