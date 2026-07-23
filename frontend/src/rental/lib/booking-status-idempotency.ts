/** Stable idempotency keys for booking status commands (Prompt 9). */
export function createBookingStatusIdempotencyKey(
  action: string,
  bookingId: string,
  nonce?: string,
): string {
  const id =
    nonce ??
    (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
  return `${action}:${bookingId}:${id}`;
}

export type BookingStatusCommandApiResponse = {
  booking: {
    id: string;
    organizationId: string;
    status: string;
    startDate: string;
    endDate: string;
    cancelledAt: string | null;
    completedAt: string | null;
    notes: string | null;
    updatedAt: string;
    vehicleId: string;
    customerId: string;
  };
  transition: {
    command: string;
    from: string | null;
    to: string;
    trigger: string;
    reasonCode: string;
    idempotent: boolean;
    replayed: boolean;
  };
  cancellation?: {
    reasonCode: string;
    description: string | null;
    effectiveAt: string;
    fee: {
      feeCents: number;
      currency: string;
      percentBps: number | null;
      freeHoursBeforePickup: number | null;
      baseTotalGrossCents: number | null;
      waived: boolean;
      waiverReason: string | null;
    };
    processStatus: {
      documents: { state: string; voidedCount: number; pendingCount: number };
      invoice: {
        state: string;
        invoiceId: string | null;
        previousStatus: string | null;
        nextStatus: string | null;
        requiresManualRefund: boolean;
      };
      payment: {
        state: string;
        cancelledRequestIds: string[];
        activeRequestIds: string[];
        requiresManualRefund: boolean;
      };
      followUpProcessesRunning: boolean;
    };
    auditEventId: string;
  };
  overrideAudit?: {
    reason: string;
    affectedInvariants: string[];
    approvalRequestId: string | null;
    auditEventId: string;
  };
};
