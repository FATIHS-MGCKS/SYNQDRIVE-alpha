import { Injectable, Logger } from '@nestjs/common';
import type { BookingEligibilityGateResult } from './booking-eligibility-gatekeeper.types';
import type { BookingEligibilityCorrelationIds } from './booking-eligibility-correlation.util';

export type BookingEligibilityAuditLogInput = {
  correlation: BookingEligibilityCorrelationIds;
  organizationId: string;
  bookingId?: string;
  vehicleId: string;
  stage: string;
  command: string;
  policyMode?: string | null;
  intent: 'preview' | 'enforce';
  outcome: 'allowed' | 'blocked' | 'technical_error' | 'preview_only';
  gateResult?: Pick<
    BookingEligibilityGateResult,
    'status' | 'engineVersion' | 'evaluatedAt' | 'reasonCodes'
  >;
  errorCode?: string;
  domain?: string;
  retryable?: boolean;
};

@Injectable()
export class BookingEligibilityAuditLogger {
  private readonly logger = new Logger('BookingEligibilityAudit');

  logEvaluation(input: BookingEligibilityAuditLogInput): void {
    this.logger.log(
      JSON.stringify({
        event: 'booking_eligibility_evaluation',
        evaluationId: input.correlation.evaluationId,
        commandId: input.correlation.commandId,
        transitionId: input.correlation.transitionId,
        auditEventId: input.correlation.auditEventId,
        organizationId: input.organizationId,
        bookingId: input.bookingId ?? null,
        vehicleId: input.vehicleId,
        stage: input.stage,
        command: input.command,
        policyMode: input.policyMode ?? null,
        intent: input.intent,
        outcome: input.outcome,
        status: input.gateResult?.status ?? null,
        engineVersion: input.gateResult?.engineVersion ?? null,
        evaluatedAt: input.gateResult?.evaluatedAt ?? null,
        reasonCodeCount: input.gateResult?.reasonCodes?.length ?? 0,
        errorCode: input.errorCode ?? null,
        domain: input.domain ?? null,
        retryable: input.retryable ?? false,
      }),
    );
  }
}
