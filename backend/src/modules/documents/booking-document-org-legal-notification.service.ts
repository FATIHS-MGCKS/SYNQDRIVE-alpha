import { Injectable, Logger } from '@nestjs/common';
import { NotificationCoreService } from '@modules/notifications/notification-core.service';
import { buildRegistryFingerprint } from '@modules/notifications/registry/notification-event-registry';
import { NotificationEntityType } from '@modules/notifications/notification.enums';
import { DOCUMENT_TYPE, legalDocumentTitleDe, type DocumentType } from './documents.constants';
import { LegalDocumentOperationalNotificationService } from './notifications/legal-document-operational-notification.service';
import { LegalDocumentOrgReadinessLoader } from './notifications/legal-document-org-readiness.loader';

/**
 * @deprecated Use LegalDocumentOperationalNotificationService — thin compatibility bridge.
 */
@Injectable()
export class BookingDocumentOrgLegalNotificationService {
  private readonly logger = new Logger(BookingDocumentOrgLegalNotificationService.name);

  constructor(
    private readonly operationalNotifications: LegalDocumentOperationalNotificationService,
    private readonly orgReadinessLoader: LegalDocumentOrgReadinessLoader,
    private readonly notificationCore: NotificationCoreService,
  ) {}

  async syncOrgMissingLegalTemplates(
    orgId: string,
    missingTypes: DocumentType[],
  ): Promise<void> {
    if (missingTypes.length === 0) {
      await this.resolveLegacyOrgNotification(orgId);
      await this.operationalNotifications.loadAndSyncOrgReadiness(orgId);
      return;
    }

    await this.operationalNotifications.loadAndSyncOrgReadiness(orgId);
  }

  async syncFromOrgLegalState(
    orgId: string,
    orgActiveLegal: Partial<Record<DocumentType, { id: string } | undefined>>,
  ): Promise<void> {
    const { orgMissingLegalTemplateTypes } = await import('./booking-document-missing-slots.util');
    await this.syncOrgMissingLegalTemplates(orgId, orgMissingLegalTemplateTypes(orgActiveLegal));
  }

  private async resolveLegacyOrgNotification(orgId: string): Promise<void> {
    if (!this.notificationCore.isEnabled()) return;
    try {
      const legacyFingerprint = buildRegistryFingerprint(
        orgId,
        'REQUIRED_DOCUMENT_MISSING',
        orgId,
        NotificationEntityType.ORGANIZATION,
      ).canonical;
      await this.notificationCore.resolveNotificationByFingerprint({
        organizationId: orgId,
        fingerprint: legacyFingerprint,
      });
    } catch (err: unknown) {
      this.logger.debug(
        `resolve legacy org legal notification (${orgId}): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
