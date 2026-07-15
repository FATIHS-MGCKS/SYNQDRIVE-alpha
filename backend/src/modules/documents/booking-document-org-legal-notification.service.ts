import { Injectable, Logger } from '@nestjs/common';
import { NotificationCoreService } from '@modules/notifications/notification-core.service';
import { NotificationEntityType } from '@modules/notifications/notification.enums';
import {
  buildCandidateFromRegistry,
  buildRegistryFingerprint,
} from '@modules/notifications/registry/notification-event-registry';
import { DOCUMENT_TITLE_DE, DOCUMENT_TYPE, type DocumentType } from './documents.constants';

/**
 * Central org-level hint when legal templates (AGB/Widerruf) are not configured.
 * Avoids duplicating the same configuration problem on every booking task.
 */
@Injectable()
export class BookingDocumentOrgLegalNotificationService {
  private readonly logger = new Logger(BookingDocumentOrgLegalNotificationService.name);

  constructor(private readonly notificationCore: NotificationCoreService) {}

  private orgLegalFingerprint(orgId: string): string {
    return buildRegistryFingerprint(
      orgId,
      'REQUIRED_DOCUMENT_MISSING',
      orgId,
      NotificationEntityType.ORGANIZATION,
    ).canonical;
  }

  async syncOrgMissingLegalTemplates(
    orgId: string,
    missingTypes: DocumentType[],
  ): Promise<void> {
    if (!this.notificationCore.isEnabled()) return;

    if (missingTypes.length === 0) {
      try {
        await this.notificationCore.resolveNotificationByFingerprint({
          organizationId: orgId,
          fingerprint: this.orgLegalFingerprint(orgId),
        });
      } catch (err: any) {
        this.logger.debug(
          `resolve org legal notification (${orgId}): ${err?.message ?? err}`,
        );
      }
      return;
    }

    const labels = missingTypes.map((t) => DOCUMENT_TITLE_DE[t] ?? t).join(', ');
    try {
      const candidate = buildCandidateFromRegistry({
        organizationId: orgId,
        eventType: 'REQUIRED_DOCUMENT_MISSING',
        entityType: NotificationEntityType.ORGANIZATION,
        entityId: orgId,
        sourceRef: `org-legal-template:${orgId}`,
        occurredAt: new Date(),
        templateParams: {
          bookingRef: 'Organisation',
          documentType: labels,
        },
        metadata: {
          scope: 'org-legal-template',
          missingTypes,
        },
      });
      await this.notificationCore.ingestCandidate(candidate);
    } catch (err: any) {
      this.logger.warn(
        `syncOrgMissingLegalTemplates(${orgId}) failed: ${err?.message ?? err}`,
      );
    }
  }

  async syncFromOrgLegalState(
    orgId: string,
    orgActiveLegal: Partial<Record<DocumentType, { id: string } | undefined>>,
  ): Promise<void> {
    const missing: DocumentType[] = [];
    if (!orgActiveLegal[DOCUMENT_TYPE.TERMS_AND_CONDITIONS]) {
      missing.push(DOCUMENT_TYPE.TERMS_AND_CONDITIONS);
    }
    if (!orgActiveLegal[DOCUMENT_TYPE.WITHDRAWAL_INFORMATION]) {
      missing.push(DOCUMENT_TYPE.WITHDRAWAL_INFORMATION);
    }
    await this.syncOrgMissingLegalTemplates(orgId, missing);
  }
}
