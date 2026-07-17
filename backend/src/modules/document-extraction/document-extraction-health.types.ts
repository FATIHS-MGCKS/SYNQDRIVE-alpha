import type { SynqDriveProcessRole } from '@config/process-role.config';

export type DocumentExtractionHealthReadiness = 'ready' | 'degraded' | 'not_ready';

export type DocumentExtractionHealthStatus = 'ok' | 'degraded' | 'error';

export interface DocumentExtractionProcessingEvent {
  extractionId: string;
  at: string;
  status: string;
  processingStage: string | null;
  errorCode?: string | null;
}

export interface DocumentExtractionQueueStats {
  waiting: number;
  active: number;
  failed: number;
  ageSeconds: number | null;
  workerConsumers: number | null;
  source: 'redis' | 'prometheus' | 'unavailable';
}

export interface DocumentExtractionHealthSnapshot {
  /** Legacy aggregate status — maps from readiness. */
  status: DocumentExtractionHealthStatus;
  /** Pipeline readiness (worker must have a consumer for `ready`). */
  readiness: DocumentExtractionHealthReadiness;

  processRole: SynqDriveProcessRole;
  workerSplitEnabled: boolean;
  apiRoleActive: boolean;
  workerRoleActive: boolean;

  queueEnabled: boolean;
  workersEnabled: boolean;
  queueReachable: boolean;

  /** BullMQ worker clients connected to document.extraction (cross-process). */
  workerConsumerPresent: boolean;
  /** True when jobs are actively processing or a consumer is connected. */
  workerActive: boolean;

  recoverySchedulerActive: boolean;

  storageProvider: string;
  storageReachable: boolean;

  mistralConfigured: boolean;
  mistralOcrModel: string | null;
  aiExtractionConfigured: boolean;

  processUptimeSeconds: number;

  lastSuccessfulProcessing: DocumentExtractionProcessingEvent | null;
  lastFailedProcessing: DocumentExtractionProcessingEvent | null;

  queue: DocumentExtractionQueueStats | null;

  /** @deprecated Use workerConsumerPresent */
  workerRegistered: boolean;
  /** @deprecated Use mistralConfigured */
  mistralOcrConfigured: boolean;
  /** @deprecated Use storageReachable */
  storageAvailable: boolean;
  /** @deprecated Use queue.waiting */
  waitingJobs?: number;
  /** @deprecated Use queue.active */
  activeJobs?: number;
  /** @deprecated Use queue.failed */
  failedJobs?: number;
}
