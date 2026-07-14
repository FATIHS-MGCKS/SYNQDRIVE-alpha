import type {
  OrgInvoiceProcess,
  OrgInvoiceProcessEntityType,
  OrgInvoiceProcessStatus,
  OrgInvoiceProcessType,
  Prisma,
} from '@prisma/client';

export interface EnqueueInvoiceProcessInput {
  organizationId: string;
  processType: OrgInvoiceProcessType;
  entityType: OrgInvoiceProcessEntityType;
  entityId: string;
  idempotencyKey: string;
  correlationId?: string | null;
  payloadJson?: Prisma.InputJsonValue;
  nextRetryAt?: Date | null;
}

export interface RecordInvoiceProcessFailureInput {
  organizationId: string;
  processType: OrgInvoiceProcessType;
  entityType: OrgInvoiceProcessEntityType;
  entityId: string;
  error: unknown;
  correlationId?: string | null;
  payloadJson?: Prisma.InputJsonValue;
  idempotencyKey?: string;
}

export interface InvoiceProcessDto {
  id: string;
  organizationId: string;
  processType: OrgInvoiceProcessType;
  processTypeLabel: string;
  entityType: OrgInvoiceProcessEntityType;
  entityId: string;
  status: OrgInvoiceProcessStatus;
  statusLabel: string;
  userMessage: string;
  attemptCount: number;
  lastAttemptAt: string | null;
  nextRetryAt: string | null;
  lastErrorCode: string | null;
  correlationId: string | null;
  resolvedAt: string | null;
  resolvedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceProcessReconciliationReport {
  organizationId: string | null;
  findingsCount: number;
  processesEnqueued: number;
  findings: Array<{
    kind: string;
    entityType: OrgInvoiceProcessEntityType;
    entityId: string;
    message: string;
  }>;
}

export type InvoiceProcessRow = OrgInvoiceProcess;
