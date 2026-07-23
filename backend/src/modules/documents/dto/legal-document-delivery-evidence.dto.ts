import { Type } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import type { LegalDocumentDeliveryEvidence } from '@prisma/client';
import {
  LEGAL_ACKNOWLEDGMENT_METHOD,
  LEGAL_DELIVERY_CHANNEL,
  LEGAL_DELIVERY_STATUS,
} from '../legal-document-delivery-evidence.constants';
import type { LegalDocumentRecipientSnapshot } from '../legal-document-delivery-evidence.types';

export class LegalDocumentRecipientSnapshotDto {
  @IsUUID()
  customerId!: string;

  @IsOptional()
  @IsString()
  displayName?: string | null;

  @IsOptional()
  @IsString()
  email?: string | null;

  @IsOptional()
  @IsString()
  language?: string | null;

  @IsOptional()
  @IsString()
  country?: string | null;
}

export class RecordLegalDocumentPresentationBodyDto {
  @IsUUID()
  customerId!: string;

  @IsUUID()
  legalDocumentId!: string;

  @IsUUID()
  generatedDocumentId!: string;

  @IsIn(Object.values(LEGAL_DELIVERY_CHANNEL))
  deliveryChannel!: string;

  @ValidateNested()
  @Type(() => LegalDocumentRecipientSnapshotDto)
  recipientSnapshot!: LegalDocumentRecipientSnapshotDto;

  @IsOptional()
  @IsString()
  requestId?: string | null;

  @IsOptional()
  @IsUUID()
  outboundEmailId?: string | null;
}

export class UpdateLegalDocumentDeliveryStatusBodyDto {
  @IsIn(Object.values(LEGAL_DELIVERY_STATUS))
  deliveryStatus!: string;

  @IsOptional()
  @IsUUID()
  outboundEmailId?: string | null;
}

export class RecordLegalDocumentAcknowledgmentBodyDto {
  @IsIn(Object.values(LEGAL_ACKNOWLEDGMENT_METHOD))
  acknowledgmentMethod!: string;

  @IsOptional()
  @IsString()
  signatureReference?: string | null;
}

export interface LegalDocumentDeliveryEvidenceDto {
  id: string;
  organizationId: string;
  bookingId: string;
  customerId: string;
  legalDocumentId: string;
  generatedDocumentId: string;
  documentType: string;
  versionLabel: string;
  language: string;
  checksum: string | null;
  presentedAt: string;
  deliveryChannel: string;
  deliveryStatus: string;
  deliveredAt: string | null;
  acknowledgedAt: string | null;
  acknowledgmentMethod: string | null;
  signatureReference: string | null;
  actorUserId: string | null;
  recipientSnapshot: LegalDocumentRecipientSnapshot;
  requestId: string | null;
  outboundEmailId: string | null;
  createdAt: string;
  immutable: boolean;
}

export function toLegalDocumentDeliveryEvidenceDto(
  row: LegalDocumentDeliveryEvidence,
): LegalDocumentDeliveryEvidenceDto {
  const immutable =
    row.acknowledgedAt != null ||
    row.deliveryStatus === LEGAL_DELIVERY_STATUS.DELIVERED ||
    row.deliveryStatus === LEGAL_DELIVERY_STATUS.FAILED ||
    row.deliveryStatus === LEGAL_DELIVERY_STATUS.BOUNCED;

  return {
    id: row.id,
    organizationId: row.organizationId,
    bookingId: row.bookingId,
    customerId: row.customerId,
    legalDocumentId: row.legalDocumentId,
    generatedDocumentId: row.generatedDocumentId,
    documentType: row.documentType,
    versionLabel: row.versionLabel,
    language: row.language,
    checksum: row.checksum,
    presentedAt: row.presentedAt.toISOString(),
    deliveryChannel: row.deliveryChannel,
    deliveryStatus: row.deliveryStatus,
    deliveredAt: row.deliveredAt ? row.deliveredAt.toISOString() : null,
    acknowledgedAt: row.acknowledgedAt ? row.acknowledgedAt.toISOString() : null,
    acknowledgmentMethod: row.acknowledgmentMethod,
    signatureReference: row.signatureReference,
    actorUserId: row.actorUserId,
    recipientSnapshot: row.recipientSnapshot as unknown as LegalDocumentRecipientSnapshot,
    requestId: row.requestId,
    outboundEmailId: row.outboundEmailId,
    createdAt: row.createdAt.toISOString(),
    immutable,
  };
}
