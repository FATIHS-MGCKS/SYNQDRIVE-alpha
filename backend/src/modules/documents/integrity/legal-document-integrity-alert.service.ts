import { Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import documentsConfig from '@config/documents.config';
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

  resetAlertCounter(): void {
    this.consecutiveAlerts = 0;
  }
}
