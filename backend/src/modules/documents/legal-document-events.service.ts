import { Injectable, NotFoundException } from '@nestjs/common';
import {
  OrganizationLegalDocument,
  OrganizationLegalDocumentEvent,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  buildPaginatedResult,
  PaginationParams,
  PaginatedResult,
} from '@shared/utils/pagination';
import {
  deriveJurisdictionFromLanguage,
  resolveLegalDocumentEventType,
  type LegalDocumentEventType,
} from './legal-document-events.constants';

export interface LegalDocumentActorContext {
  userId?: string | null;
  displayName?: string | null;
  correlationId?: string | null;
}

export interface AppendLegalDocumentEventInput {
  organizationId: string;
  legalDocument: OrganizationLegalDocument;
  eventType?: LegalDocumentEventType;
  previousStatus: string | null;
  newStatus: string;
  actor?: LegalDocumentActorContext;
  reason?: string | null;
  changeSummary?: string | null;
  validFrom?: Date | null;
  validUntil?: Date | null;
}

export interface LegalDocumentEventDto {
  id: string;
  organizationId: string;
  legalDocumentId: string;
  eventType: string;
  previousStatus: string | null;
  newStatus: string;
  actorUserId: string | null;
  actorDisplayName: string | null;
  reason: string | null;
  changeSummary: string | null;
  versionLabel: string;
  checksum: string | null;
  language: string;
  jurisdiction: string | null;
  validFrom: string | null;
  validUntil: string | null;
  correlationId: string | null;
  createdAt: string;
}

type Tx = Prisma.TransactionClient;

/**
 * Append-only lifecycle audit for organization legal documents.
 * Writes happen only via {@link appendInTransaction}; no update/delete surface.
 */
@Injectable()
export class LegalDocumentEventsService {
  constructor(private readonly prisma: PrismaService) {}

  async appendInTransaction(
    tx: Tx,
    input: AppendLegalDocumentEventInput,
  ): Promise<OrganizationLegalDocumentEvent> {
    const eventType =
      input.eventType ??
      resolveLegalDocumentEventType(input.previousStatus, input.newStatus);

    return tx.organizationLegalDocumentEvent.create({
      data: {
        organizationId: input.organizationId,
        legalDocumentId: input.legalDocument.id,
        eventType,
        previousStatus: input.previousStatus,
        newStatus: input.newStatus,
        actorUserId: input.actor?.userId ?? null,
        actorDisplayName: input.actor?.displayName?.trim() || null,
        reason: input.reason?.trim() || null,
        changeSummary:
          input.changeSummary?.trim() ?? input.legalDocument.changeSummary ?? null,
        versionLabel: input.legalDocument.versionLabel,
        checksum: input.legalDocument.checksum,
        language: input.legalDocument.language,
        jurisdiction: deriveJurisdictionFromLanguage(input.legalDocument.language),
        validFrom: input.validFrom ?? input.legalDocument.validFrom,
        validUntil: input.validUntil ?? input.legalDocument.validUntil,
        correlationId: input.actor?.correlationId ?? null,
      },
    });
  }

  async listForDocument(
    orgId: string,
    legalDocumentId: string,
    params: PaginationParams = {},
  ): Promise<PaginatedResult<LegalDocumentEventDto>> {
    await this.assertDocumentInOrg(orgId, legalDocumentId);
    return this.listEvents(orgId, { legalDocumentId }, params);
  }

  async listForOrganization(
    orgId: string,
    params: PaginationParams & { legalDocumentId?: string; eventType?: string } = {},
  ): Promise<PaginatedResult<LegalDocumentEventDto>> {
    const { legalDocumentId, eventType, ...pagination } = params;
    if (legalDocumentId) {
      await this.assertDocumentInOrg(orgId, legalDocumentId);
    }
    return this.listEvents(
      orgId,
      {
        legalDocumentId,
        eventType,
      },
      pagination,
    );
  }

  toDto(event: OrganizationLegalDocumentEvent): LegalDocumentEventDto {
    return {
      id: event.id,
      organizationId: event.organizationId,
      legalDocumentId: event.legalDocumentId,
      eventType: event.eventType,
      previousStatus: event.previousStatus,
      newStatus: event.newStatus,
      actorUserId: event.actorUserId,
      actorDisplayName: event.actorDisplayName,
      reason: event.reason,
      changeSummary: event.changeSummary,
      versionLabel: event.versionLabel,
      checksum: event.checksum,
      language: event.language,
      jurisdiction: event.jurisdiction,
      validFrom: event.validFrom ? event.validFrom.toISOString() : null,
      validUntil: event.validUntil ? event.validUntil.toISOString() : null,
      correlationId: event.correlationId,
      createdAt: event.createdAt.toISOString(),
    };
  }

  private async listEvents(
    orgId: string,
    filters: { legalDocumentId?: string; eventType?: string },
    params: PaginationParams,
  ): Promise<PaginatedResult<LegalDocumentEventDto>> {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.OrganizationLegalDocumentEventWhereInput = {
      organizationId: orgId,
      ...(filters.legalDocumentId ? { legalDocumentId: filters.legalDocumentId } : {}),
      ...(filters.eventType ? { eventType: filters.eventType } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.organizationLegalDocumentEvent.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.organizationLegalDocumentEvent.count({ where }),
    ]);

    return buildPaginatedResult(rows.map((row) => this.toDto(row)), total, { page, limit });
  }

  private async assertDocumentInOrg(orgId: string, legalDocumentId: string): Promise<void> {
    const doc = await this.prisma.organizationLegalDocument.findFirst({
      where: { id: legalDocumentId, organizationId: orgId },
      select: { id: true },
    });
    if (!doc) throw new NotFoundException('Legal document not found');
  }
}
