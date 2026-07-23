import type { BookingCancellationReasonCode } from './booking-cancellation-reason.codes';

export interface BookingCancellationRequestContext {
  ipTruncated?: string | null;
  userAgent?: string | null;
}

export interface BookingCancellationInput {
  organizationId: string;
  bookingId: string;
  reasonCode: BookingCancellationReasonCode;
  description?: string | null;
  effectiveAt: Date;
  actor: {
    userId?: string | null;
    displayName?: string | null;
  };
  requestContext?: BookingCancellationRequestContext;
  correlationId?: string | null;
  statusCommandId?: string | null;
}

export type BookingCancellationProcessState =
  | 'NOT_APPLICABLE'
  | 'COMPLETED'
  | 'PARTIAL'
  | 'PENDING'
  | 'REQUIRES_MANUAL_ACTION';

export interface BookingCancellationProcessStatus {
  documents: {
    state: BookingCancellationProcessState;
    voidedCount: number;
    pendingCount: number;
  };
  invoice: {
    state: BookingCancellationProcessState;
    invoiceId: string | null;
    previousStatus: string | null;
    nextStatus: string | null;
    requiresManualRefund: boolean;
  };
  payment: {
    state: BookingCancellationProcessState;
    cancelledRequestIds: string[];
    activeRequestIds: string[];
    requiresManualRefund: boolean;
  };
  followUpProcessesRunning: boolean;
}

export interface BookingCancellationFeeResult {
  feeCents: number;
  currency: string;
  percentBps: number | null;
  freeHoursBeforePickup: number | null;
  baseTotalGrossCents: number | null;
  waived: boolean;
  waiverReason: string | null;
}

export interface BookingCancellationResult {
  fee: BookingCancellationFeeResult;
  processStatus: BookingCancellationProcessStatus;
  auditEventId: string;
}
