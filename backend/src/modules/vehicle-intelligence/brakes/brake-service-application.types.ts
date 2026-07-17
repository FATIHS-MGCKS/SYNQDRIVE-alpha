import type {
  BrakeLifecycleKind,
  BrakeLifecycleScope,
  BrakeLifecycleSource,
} from './brake-lifecycle.service';

export type BrakeServiceApplicationAuditEntry = {
  at: string;
  action: string;
  details?: string;
  serviceEventId?: string;
  installationId?: string;
  evidenceId?: string;
};

export type ApplyBrakeServiceInput = {
  organizationId: string;
  vehicleId: string;
  serviceDate: string;
  odometerKm?: number;
  workshopName?: string;
  notes?: string;
  documentUrl?: string;
  source?: BrakeLifecycleSource;
  kind?: BrakeLifecycleKind;
  scope?: BrakeLifecycleScope[];
  measured?: {
    frontPadMm?: number;
    rearPadMm?: number;
    frontDiscMm?: number;
    rearDiscMm?: number;
  };
  initializeIfPossible?: boolean;
  idempotencyKey?: string;
  clientRequestId?: string;
  externalDocumentId?: string;
  actorUserId?: string;
};

export type ApplyBrakeServiceResult = {
  applicationId: string;
  serviceEventId: string;
  replayed: boolean;
  lifecycleApplied: boolean;
  initialized: boolean;
  status: 'initialized' | 'history_only';
  applicationStatus: 'APPLIED' | 'HISTORY_ONLY' | 'FAILED';
  message: string;
  auditLog: BrakeServiceApplicationAuditEntry[];
  installationIds: string[];
  evidenceIds: string[];
  outboxProcessed: boolean;
};
