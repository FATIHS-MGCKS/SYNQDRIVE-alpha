import { Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import documentsConfig from '@config/documents.config';
import { LEGAL_NOTIFICATION_EVENT } from '../notifications/legal-document-operational-notification.constants';
import { LegalDocumentOperationalNotificationService } from '../notifications/legal-document-operational-notification.service';
import type { LegalDocumentIntegrityStatus } from './legal-document-integrity.constants';

export interface LegalDocumentIntegrityAlertPayload {
  organizationId: string;
  legalDocumentId?: string;
  objectKey: string;
  status: LegalDocumentIntegrityStatus | 'UNEXPECTED_OBJECT';
  detail?: string;
  source: string;
}

@Injectable()
export class LegalDocumentIntegrityAlertService {
  private readonly logger = new Logger(LegalDocumentIntegrityAlertService.name);
  private consecutiveAlerts = 0;

  constructor(
    @Inject(documentsConfig.KEY)
    private readonly config: ConfigType<typeof documentsConfig>,
    private readonly operationalNotifications: LegalDocumentOperationalNotificationService,
  ) {}

  async emitDriftAlert(payload: LegalDocumentIntegrityAlertPayload): Promise<void> {
    this.consecutiveAlerts += 1;
    this.logger.error(
      `ALERT: Legal document storage integrity — org=${payload.organizationId} doc=${payload.legalDocumentId ?? 'n/a'} status=${payload.status} key=${payload.objectKey} source=${payload.source} detail=${payload.detail ?? 'n/a'}`,
    );
    if (this.consecutiveAlerts >= this.config.integrityAlertThreshold) {
      this.logger.error(
        `ALERT: Legal document integrity sustained drift — ${this.consecutiveAlerts} alerts in this process`,
      );
    }

    await this.operationalNotifications.syncIntegrityTechnicalAlert({
      organizationId: payload.organizationId,
      legalDocumentId: payload.legalDocumentId,
      objectKey: payload.objectKey,
      status: payload.status,
      detail: payload.detail,
      source: payload.source,
    });

    if (payload.legalDocumentId) {
      void this.operationalNotifications
        .loadAndSyncOrgReadiness(payload.organizationId)
        .catch(() => undefined);
    }
  }

  async emitUnexpectedObjectAlert(payload: {
    organizationId: string;
    objectKey: string;
    detail?: string;
  }): Promise<void> {
    await this.emitDriftAlert({
      organizationId: payload.organizationId,
      objectKey: payload.objectKey,
      status: 'UNEXPECTED_OBJECT',
      detail: payload.detail ?? 'Object exists in storage without database reference',
      source: 'reconciliation',
    });
  }

  async emitReconciliationFailed(input: {
    organizationId?: string | null;
    detail: string;
    runId: string;
  }): Promise<void> {
    if (!input.organizationId) return;
    await this.operationalNotifications.syncTechnicalAlert({
      organizationId: input.organizationId,
      eventType: LEGAL_NOTIFICATION_EVENT.TECH_RECONCILIATION_FAILED,
      detail: input.detail,
      sourceRef: `reconciliation-run:${input.runId}`,
    });
  }

  resetAlertCounter(): void {
    this.consecutiveAlerts = 0;
  }
}
