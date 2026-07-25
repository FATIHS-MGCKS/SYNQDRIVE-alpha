import { Injectable, NotFoundException } from '@nestjs/common';
import type { HandoverKind } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { currentHandoverCompletionRecordWhere } from './handover-protocol.query';

export interface HandoverCompletionRecordDto {
  id: string;
  bookingId: string;
  vehicleId: string;
  customerId: string | null;
  stationId: string | null;
  protocolId: string;
  kind: HandoverKind;
  documentVersion: number;
  version: number;
  payloadHash: string;
  signedContentHash: string;
  completedAt: string;
  completedByUserId: string | null;
  completedByName: string | null;
  previousVersionId: string | null;
  supersededById: string | null;
  supersededAt: string | null;
  correctionReason: string | null;
  overrideUserId: string | null;
  isCurrent: boolean;
  createdAt: string;
}

@Injectable()
export class HandoverCompletionRecordQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async listForBooking(
    orgId: string,
    bookingId: string,
    kind: HandoverKind,
  ): Promise<HandoverCompletionRecordDto[]> {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, organizationId: orgId },
      select: { id: true },
    });
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const rows = await this.prisma.bookingHandoverCompletionRecord.findMany({
      where: { organizationId: orgId, bookingId, kind },
      orderBy: { version: 'asc' },
    });

    return rows.map((row) => ({
      id: row.id,
      bookingId: row.bookingId,
      vehicleId: row.vehicleId,
      customerId: row.customerId,
      stationId: row.stationId,
      protocolId: row.protocolId,
      kind: row.kind,
      documentVersion: row.documentVersion,
      version: row.version,
      payloadHash: row.payloadHash,
      signedContentHash: row.signedContentHash,
      completedAt: row.completedAt.toISOString(),
      completedByUserId: row.completedByUserId,
      completedByName: row.completedByName,
      previousVersionId: row.previousVersionId,
      supersededById: row.supersededById,
      supersededAt: row.supersededAt?.toISOString() ?? null,
      correctionReason: row.correctionReason,
      overrideUserId: row.overrideUserId,
      isCurrent: row.isCurrent,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async getCurrent(
    orgId: string,
    bookingId: string,
    kind: HandoverKind,
  ): Promise<HandoverCompletionRecordDto | null> {
    const row = await this.prisma.bookingHandoverCompletionRecord.findFirst({
      where: {
        organizationId: orgId,
        ...currentHandoverCompletionRecordWhere(bookingId, kind),
      },
    });
    if (!row) return null;
    return {
      id: row.id,
      bookingId: row.bookingId,
      vehicleId: row.vehicleId,
      customerId: row.customerId,
      stationId: row.stationId,
      protocolId: row.protocolId,
      kind: row.kind,
      documentVersion: row.documentVersion,
      version: row.version,
      payloadHash: row.payloadHash,
      signedContentHash: row.signedContentHash,
      completedAt: row.completedAt.toISOString(),
      completedByUserId: row.completedByUserId,
      completedByName: row.completedByName,
      previousVersionId: row.previousVersionId,
      supersededById: row.supersededById,
      supersededAt: row.supersededAt?.toISOString() ?? null,
      correctionReason: row.correctionReason,
      overrideUserId: row.overrideUserId,
      isCurrent: row.isCurrent,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
