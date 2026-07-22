import { Injectable, Logger } from '@nestjs/common';
import { OrganizationLegalDocument } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { LegalDocumentEventsService } from '../legal-document-events.service';
import {
  integrityEventTypeForStatus,
  isLegalDocumentIntegrityBlocking,
} from './legal-document-integrity.constants';
import type { LegalDocumentIntegrityCheckResult } from './legal-document-integrity.types';
import { LegalDocumentIntegrityAlertService } from './legal-document-integrity-alert.service';

@Injectable()
export class LegalDocumentIntegrityPersistenceService {
  private readonly logger = new Logger(LegalDocumentIntegrityPersistenceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: LegalDocumentEventsService,
    private readonly alerts: LegalDocumentIntegrityAlertService,
  ) {}

  async applyVerificationResult(
    doc: OrganizationLegalDocument,
    result: LegalDocumentIntegrityCheckResult,
    options: { source: 'download' | 'reconciliation' | 'manual'; dryRun?: boolean } = {
      source: 'manual',
    },
  ): Promise<OrganizationLegalDocument> {
    const previousStatus = doc.integrityStatus;
    const blocking = isLegalDocumentIntegrityBlocking(result.status);
    const shouldEmitEvent =
      previousStatus !== result.status ||
      (blocking && !doc.integrityUnavailable);

    if (options.dryRun) {
      if (shouldEmitEvent && blocking) {
        await this.alerts.emitDriftAlert({
          organizationId: doc.organizationId,
          legalDocumentId: doc.id,
          objectKey: doc.objectKey,
          status: result.status,
          detail: result.detail,
          source: options.source,
        });
      }
      return doc;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.organizationLegalDocument.update({
        where: { id: doc.id },
        data: {
          integrityStatus: result.status,
          integrityCheckedAt: result.checkedAt,
          integrityDetail: result.detail ?? null,
          integrityUnavailable: blocking,
          ...(blocking
            ? {
                statusReason:
                  doc.statusReason ??
                  `Storage integrity issue: ${result.status}${result.detail ? ` — ${result.detail}` : ''}`,
              }
            : {}),
        },
      });

      if (shouldEmitEvent) {
        const eventType = integrityEventTypeForStatus(result.status);
        if (eventType) {
          await this.events.appendIntegrityEventInTransaction(tx, {
            organizationId: doc.organizationId,
            legalDocument: row,
            eventType,
            reason: result.detail ?? null,
            correlationId: `${options.source}:${result.status}`,
          });
        }
      }

      return row;
    });

    if (blocking) {
      await this.alerts.emitDriftAlert({
        organizationId: doc.organizationId,
        legalDocumentId: doc.id,
        objectKey: doc.objectKey,
        status: result.status,
        detail: result.detail,
        source: options.source,
      });
      this.logger.error(
        `ALERT: Legal document integrity drift — org=${doc.organizationId} doc=${doc.id} status=${result.status} source=${options.source}`,
      );
    }

    return updated;
  }

  async markUnexpectedObject(input: {
    organizationId: string;
    objectKey: string;
    detail?: string;
    dryRun?: boolean;
  }): Promise<void> {
    if (input.dryRun) {
      this.logger.warn(
        `[dry-run] Unexpected storage object org=${input.organizationId} key=${input.objectKey}`,
      );
      return;
    }
    await this.alerts.emitUnexpectedObjectAlert(input);
  }
}
