import { Injectable } from '@nestjs/common';
import { OrganizationLegalDocument, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { LegalDocumentNotFoundError } from '../legal-documents-api.errors';
import { LegalDocumentEventsService } from '../legal-document-events.service';
import { LEGAL_DOCUMENT_EVENT_TYPE } from '../legal-document-events.constants';

export interface LegalDocumentLegalHoldActor {
  userId?: string | null;
  displayName?: string | null;
  correlationId?: string | null;
}

@Injectable()
export class LegalDocumentLegalHoldService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: LegalDocumentEventsService,
  ) {}

  async setMasterLegalHold(
    organizationId: string,
    legalDocumentId: string,
    reason: string | undefined,
    actor: LegalDocumentLegalHoldActor,
  ): Promise<OrganizationLegalDocument> {
    const trimmedReason = reason?.trim();
    if (!trimmedReason) {
      throw new Error('legalHoldReason is required when setting legal hold');
    }

    return this.prisma.$transaction(async (tx) => {
      const current = await tx.organizationLegalDocument.findFirst({
        where: { id: legalDocumentId, organizationId },
      });
      if (!current) throw new LegalDocumentNotFoundError();

      const now = new Date();
      const updated = await tx.organizationLegalDocument.update({
        where: { id: current.id },
        data: {
          legalHold: true,
          legalHoldReason: trimmedReason,
          legalHoldSetAt: now,
          legalHoldSetByUserId: actor.userId ?? null,
          deletionEligibleAt: null,
        },
      });

      await this.events.appendInTransaction(tx, {
        organizationId,
        legalDocument: updated,
        eventType: LEGAL_DOCUMENT_EVENT_TYPE.LEGAL_HOLD_SET,
        previousStatus: current.status,
        newStatus: current.status,
        actor,
        reason: trimmedReason,
      });

      return updated;
    });
  }

  async clearMasterLegalHold(
    organizationId: string,
    legalDocumentId: string,
    actor: LegalDocumentLegalHoldActor,
  ): Promise<OrganizationLegalDocument> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.organizationLegalDocument.findFirst({
        where: { id: legalDocumentId, organizationId },
      });
      if (!current) throw new LegalDocumentNotFoundError();
      if (!current.legalHold) return current;

      const updated = await tx.organizationLegalDocument.update({
        where: { id: current.id },
        data: {
          legalHold: false,
          legalHoldReason: null,
          legalHoldSetAt: null,
          legalHoldSetByUserId: null,
        },
      });

      await this.events.appendInTransaction(tx, {
        organizationId,
        legalDocument: updated,
        eventType: LEGAL_DOCUMENT_EVENT_TYPE.LEGAL_HOLD_CLEARED,
        previousStatus: current.status,
        newStatus: current.status,
        actor,
      });

      return updated;
    });
  }

  async setGeneratedDocumentLegalHold(
    organizationId: string,
    generatedDocumentId: string,
    reason: string | undefined,
    actor: LegalDocumentLegalHoldActor,
  ) {
    const trimmedReason = reason?.trim();
    if (!trimmedReason) {
      throw new Error('legalHoldReason is required when setting legal hold');
    }

    const current = await this.prisma.generatedDocument.findFirst({
      where: { id: generatedDocumentId, organizationId },
    });
    if (!current) throw new LegalDocumentNotFoundError();

    const now = new Date();
    return this.prisma.generatedDocument.update({
      where: { id: current.id },
      data: {
        legalHold: true,
        legalHoldReason: trimmedReason,
        legalHoldSetAt: now,
        legalHoldSetByUserId: actor.userId ?? null,
        deletionEligibleAt: null,
      },
    });
  }

  async clearGeneratedDocumentLegalHold(
    organizationId: string,
    generatedDocumentId: string,
  ) {
    const current = await this.prisma.generatedDocument.findFirst({
      where: { id: generatedDocumentId, organizationId },
    });
    if (!current) throw new LegalDocumentNotFoundError();
    if (!current.legalHold) return current;

    return this.prisma.generatedDocument.update({
      where: { id: current.id },
      data: {
        legalHold: false,
        legalHoldReason: null,
        legalHoldSetAt: null,
        legalHoldSetByUserId: null,
      },
    });
  }

  async setDeliveryEvidenceLegalHold(
    organizationId: string,
    evidenceId: string,
    reason: string | undefined,
    actor: LegalDocumentLegalHoldActor,
  ) {
    const trimmedReason = reason?.trim();
    if (!trimmedReason) {
      throw new Error('legalHoldReason is required when setting legal hold');
    }

    const current = await this.prisma.legalDocumentDeliveryEvidence.findFirst({
      where: { id: evidenceId, organizationId },
    });
    if (!current) throw new LegalDocumentNotFoundError();

    const now = new Date();
    return this.prisma.legalDocumentDeliveryEvidence.update({
      where: { id: current.id },
      data: {
        legalHold: true,
        legalHoldReason: trimmedReason,
        legalHoldSetAt: now,
        legalHoldSetByUserId: actor.userId ?? null,
        deletionEligibleAt: null,
      },
    });
  }

  async clearDeliveryEvidenceLegalHold(organizationId: string, evidenceId: string) {
    const current = await this.prisma.legalDocumentDeliveryEvidence.findFirst({
      where: { id: evidenceId, organizationId },
    });
    if (!current) throw new LegalDocumentNotFoundError();
    if (!current.legalHold) return current;

    return this.prisma.legalDocumentDeliveryEvidence.update({
      where: { id: current.id },
      data: {
        legalHold: false,
        legalHoldReason: null,
        legalHoldSetAt: null,
        legalHoldSetByUserId: null,
      },
    });
  }

  isRetentionBlockedByHold(entity: { legalHold: boolean; retainUntil?: Date | null }): boolean {
    if (entity.legalHold) return true;
    if (entity.retainUntil && entity.retainUntil.getTime() > Date.now()) {
      return true;
    }
    return false;
  }
}
