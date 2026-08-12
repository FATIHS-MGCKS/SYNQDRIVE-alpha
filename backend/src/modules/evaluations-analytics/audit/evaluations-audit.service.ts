import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { BusinessAuditService } from '@modules/business-audit/business-audit.service';
import {
  BusinessAuditAction,
  BUSINESS_AUDIT_ENTITY_TYPE,
} from '@modules/business-audit/business-audit.constants';

export type EvaluationsAuditResult = 'SUCCEEDED' | 'DENIED';

export interface EvaluationsPersonAccessAudit {
  readonly organizationId: string;
  /** Authenticated server actor — NEVER a caller-supplied id. */
  readonly actorUserId: string | null;
  readonly result: EvaluationsAuditResult;
  readonly piiTier: 'full' | 'pseudonymous' | 'none';
  readonly stationScoped: boolean;
  readonly factorCount: number;
  readonly calculationVersion: string;
  readonly correlationId?: string | null;
}

/**
 * E5C evaluations audit authority. It REUSES the canonical durable `BusinessAudit`
 * outbox (single audit truth; `PARALLEL_AUDIT_TRUTH_COUNT = 0`) and records only
 * non-PII metadata for sensitive person-level analytics access. It never stores
 * driver identifiers, names, or any source payload. Audit write failures never
 * break the read path (best-effort), but denied/succeeded outcomes are recorded
 * honestly.
 */
@Injectable()
export class EvaluationsAuditService {
  private readonly logger = new Logger(EvaluationsAuditService.name);

  constructor(private readonly audit: BusinessAuditService) {}

  private buildInput(input: EvaluationsPersonAccessAudit) {
    return {
      organizationId: input.organizationId,
      idempotencyKey: `evaluations-driver-access:${input.organizationId}:${randomUUID()}`,
      action:
        input.result === 'DENIED'
          ? BusinessAuditAction.EVALUATIONS_PERSON_ANALYTICS_DENIED
          : BusinessAuditAction.EVALUATIONS_PERSON_ANALYTICS_ACCESSED,
      entityType: BUSINESS_AUDIT_ENTITY_TYPE.EVALUATIONS_DRIVER_ANALYTICS,
      // Scope target only — never a person id.
      entityId: `org:${input.organizationId}:driver-analytics`,
      actorUserId: input.actorUserId ?? null,
      correlationId: input.correlationId ?? null,
      outcome: input.result,
      description: `Evaluations person-level driver analytics ${input.result.toLowerCase()}`,
      // Non-PII metadata only (no driver refs, names, or payloads).
      metadata: {
        piiTier: input.piiTier,
        stationScoped: input.stationScoped,
        factorCount: input.factorCount,
        calculationVersion: input.calculationVersion,
      },
    };
  }

  /**
   * Best-effort audit for non-critical outcomes (denied access, or authorized
   * access that discloses no person data). An enqueue failure never grants access
   * and never fails the request.
   */
  async recordPersonLevelAccess(input: EvaluationsPersonAccessAudit): Promise<void> {
    try {
      await this.audit.enqueue(this.buildInput(input));
    } catch (error) {
      this.logger.warn(
        `Evaluations person-level access audit enqueue failed (org ${input.organizationId}, result ${input.result})`,
      );
      void error;
    }
  }

  /**
   * Durable, audit-critical record for a SUCCESSFUL person-level disclosure. The
   * canonical BusinessAudit critical flush MUST persist the evidence before the
   * sensitive data is released; if it cannot, this throws and the caller fails
   * closed (no person data). Never swallows the failure.
   */
  async recordCriticalPersonLevelDisclosure(input: EvaluationsPersonAccessAudit): Promise<void> {
    const row = await this.audit.enqueue(this.buildInput({ ...input, result: 'SUCCEEDED' }));
    await this.audit.flushCritical([row?.id]);
  }
}
