import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import documentsConfig from '@config/documents.config';
import {
  DOCUMENTS_STORAGE,
  type DocumentStorageHealthStatus,
  type DocumentStoragePort,
} from './document-storage.interface';

@Injectable()
export class DocumentStorageHealthService {
  private readonly logger = new Logger(DocumentStorageHealthService.name);
  private consecutiveFailures = 0;
  private lastStatus: DocumentStorageHealthStatus | null = null;
  private alertEmitted = false;

  constructor(
    @Inject(documentsConfig.KEY)
    private readonly config: ConfigType<typeof documentsConfig>,
    @Inject(DOCUMENTS_STORAGE)
    private readonly storage: DocumentStoragePort,
  ) {}

  async checkHealth(): Promise<DocumentStorageHealthStatus> {
    const status = await this.storage.checkHealth();
    if (status.healthy) {
      this.consecutiveFailures = 0;
      this.alertEmitted = false;
    } else {
      this.consecutiveFailures += 1;
      if (this.consecutiveFailures >= this.config.storageHealthAlertThreshold) {
        this.emitPersistentFailureAlert(status);
      }
    }
    this.lastStatus = status;
    return status;
  }

  getLastStatus(): DocumentStorageHealthStatus | null {
    return this.lastStatus;
  }

  private emitPersistentFailureAlert(status: DocumentStorageHealthStatus): void {
    if (this.alertEmitted) return;
    this.alertEmitted = true;
    this.logger.error(
      `ALERT: Document storage unhealthy for ${this.consecutiveFailures} consecutive checks — provider=${status.provider} detail=${status.detail ?? 'n/a'}`,
    );
  }
}
