import type {
  BusinessAuditActionCode,
  BusinessAuditEntityType,
} from '@modules/business-audit/business-audit.constants';

export type OperatorAuditOutcome = 'SUCCESS' | 'FAILURE' | 'DENIED' | 'PARTIAL';

export interface OperatorAuditRecordInput {
  organizationId: string;
  action: BusinessAuditActionCode;
  entityType: BusinessAuditEntityType;
  entityId: string;
  actorUserId?: string | null;
  outcome: OperatorAuditOutcome;
  description: string;
  correlationId?: string | null;
  requestId?: string | null;
  stationId?: string | null;
  changeReason?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
  /** When true, blocks until audit outbox row is flushed (completion actions). */
  critical?: boolean;
}

export interface OperatorAuditListQuery {
  bookingId?: string;
  action?: string;
  limit?: number;
  offset?: number;
}
