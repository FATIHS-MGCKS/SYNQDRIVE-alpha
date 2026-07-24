import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  AuthorizationActorType,
  Prisma,
  PrivacyPolicyLifecycleEventType,
  PrivacyPolicyLifecycleStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { AuthorizationDecisionService } from '../../authorization-decision-engine/authorization-decision.service';
import {
  POLICY_EXPIRABLE_STATUSES,
  POLICY_LIFECYCLE_ERROR_CODES,
} from './policy-lifecycle.constants';
import { PolicyLifecycleEventsService } from './policy-lifecycle-events.service';
import { PolicyLifecycleEntityKind } from './policy-lifecycle.service';
import { POLICY_LIFECYCLE_REASON_CODES } from './policy-lifecycle-semantics.constants';
import {
  buildExpiryIdempotencyKey,
  isPolicyPastValidUntil,
  policyLifecycleNow,
} from './policy-lifecycle-time.util';
import { assertPolicyLifecycleTransition } from './policy-lifecycle.transitions';

export interface PolicyExpiryRunResult {
  expired: number;
  skipped: number;
  organizationsInvalidated: string[];
}

type ExpirableRecord = {
  id: string;
  organizationId: string;
  status: PrivacyPolicyLifecycleStatus;
  validUntil: Date | null;
  policyFamilyId: string;
  versionNumber: number;
};

@Injectable()
export class PolicyLifecycleExpiryService {
  private readonly logger = new Logger(PolicyLifecycleExpiryService.name);
  private readonly processedKeys = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: PolicyLifecycleEventsService,
    @Optional() private readonly decisionService?: AuthorizationDecisionService,
  ) {}

  async expireDuePolicies(params?: {
    organizationId?: string;
    now?: Date;
    limit?: number;
    reasonCode?: string;
  }): Promise<PolicyExpiryRunResult> {
    const now = params?.now ?? policyLifecycleNow();
    const limit = params?.limit ?? 200;
    const reasonCode =
      params?.reasonCode ?? POLICY_LIFECYCLE_REASON_CODES.EXPIRED.VALID_UNTIL_REACHED;

    let expired = 0;
    let skipped = 0;
    const organizationsInvalidated = new Set<string>();

    const batches: Array<{
      entityKind: PolicyLifecycleEntityKind;
      records: ExpirableRecord[];
    }> = [
      {
        entityKind: 'PROCESSING_ACTIVITY',
        records: await this.findDueProcessingActivities(params?.organizationId, now, limit),
      },
      {
        entityKind: 'LEGAL_BASIS_ASSESSMENT',
        records: await this.findDueLegalBasisAssessments(params?.organizationId, now, limit),
      },
      {
        entityKind: 'ENFORCEMENT_POLICY',
        records: await this.findDueEnforcementPolicies(params?.organizationId, now, limit),
      },
    ];

    for (const batch of batches) {
      for (const record of batch.records) {
        const result = await this.expireSingle({
          entityKind: batch.entityKind,
          record,
          now,
          reasonCode,
        });
        if (result === 'expired') {
          expired++;
          organizationsInvalidated.add(record.organizationId);
        } else {
          skipped++;
        }
      }
    }

    for (const orgId of organizationsInvalidated) {
      this.decisionService?.invalidateOrganizationCache(orgId);
    }

    if (expired > 0) {
      this.logger.log(
        `Policy expiry run: expired=${expired} skipped=${skipped} orgs=${organizationsInvalidated.size}`,
      );
    }

    return {
      expired,
      skipped,
      organizationsInvalidated: [...organizationsInvalidated],
    };
  }

  private async findDueProcessingActivities(
    organizationId: string | undefined,
    now: Date,
    limit: number,
  ): Promise<ExpirableRecord[]> {
    return this.prisma.processingActivity.findMany({
      where: {
        status: { in: [...POLICY_EXPIRABLE_STATUSES] },
        validUntil: { lte: now },
        ...(organizationId ? { organizationId } : {}),
      },
      select: {
        id: true,
        organizationId: true,
        status: true,
        validUntil: true,
        policyFamilyId: true,
        versionNumber: true,
      },
      take: limit,
      orderBy: { validUntil: 'asc' },
    });
  }

  private async findDueLegalBasisAssessments(
    organizationId: string | undefined,
    now: Date,
    limit: number,
  ): Promise<ExpirableRecord[]> {
    return this.prisma.legalBasisAssessment.findMany({
      where: {
        status: { in: [...POLICY_EXPIRABLE_STATUSES] },
        validUntil: { lte: now },
        ...(organizationId ? { organizationId } : {}),
      },
      select: {
        id: true,
        organizationId: true,
        status: true,
        validUntil: true,
        policyFamilyId: true,
        versionNumber: true,
      },
      take: limit,
      orderBy: { validUntil: 'asc' },
    });
  }

  private async findDueEnforcementPolicies(
    organizationId: string | undefined,
    now: Date,
    limit: number,
  ): Promise<ExpirableRecord[]> {
    return this.prisma.enforcementPolicy.findMany({
      where: {
        status: { in: [...POLICY_EXPIRABLE_STATUSES] },
        validUntil: { lte: now },
        ...(organizationId ? { organizationId } : {}),
      },
      select: {
        id: true,
        organizationId: true,
        status: true,
        validUntil: true,
        policyFamilyId: true,
        versionNumber: true,
      },
      take: limit,
      orderBy: { validUntil: 'asc' },
    });
  }

  private async expireSingle(params: {
    entityKind: PolicyLifecycleEntityKind;
    record: ExpirableRecord;
    now: Date;
    reasonCode: string;
  }): Promise<'expired' | 'skipped'> {
    const { entityKind, record, now, reasonCode } = params;

    if (!record.validUntil || !isPolicyPastValidUntil(record.validUntil, now)) {
      return 'skipped';
    }

    if (!POLICY_EXPIRABLE_STATUSES.has(record.status)) {
      return 'skipped';
    }

    const idempotencyKey = buildExpiryIdempotencyKey({
      entityKind,
      policyId: record.id,
      validUntil: record.validUntil,
    });

    if (this.processedKeys.has(idempotencyKey)) {
      return 'skipped';
    }

    try {
      assertPolicyLifecycleTransition(record.status, PrivacyPolicyLifecycleStatus.EXPIRED);
    } catch {
      return 'skipped';
    }

    const previousStatus = record.status;

    await this.prisma.$transaction(async (tx) => {
      const current = await this.loadCurrent(tx, entityKind, record.id, record.organizationId);
      if (!current || current.status !== previousStatus) {
        return;
      }
      if (!current.validUntil || current.validUntil.getTime() > now.getTime()) {
        return;
      }

      await this.applyExpired(tx, entityKind, record.id, now);

      await this.recordExpiredEvent(tx, entityKind, record, {
        previousStatus,
        reasonCode,
        correlationId: idempotencyKey,
      });
    });

    this.processedKeys.add(idempotencyKey);
    return 'expired';
  }

  private async loadCurrent(
    tx: Prisma.TransactionClient,
    entityKind: PolicyLifecycleEntityKind,
    id: string,
    organizationId: string,
  ): Promise<ExpirableRecord | null> {
    const select = {
      id: true,
      organizationId: true,
      status: true,
      validUntil: true,
      policyFamilyId: true,
      versionNumber: true,
    };

    switch (entityKind) {
      case 'PROCESSING_ACTIVITY':
        return tx.processingActivity.findFirst({ where: { id, organizationId }, select });
      case 'LEGAL_BASIS_ASSESSMENT':
        return tx.legalBasisAssessment.findFirst({ where: { id, organizationId }, select });
      case 'ENFORCEMENT_POLICY':
        return tx.enforcementPolicy.findFirst({ where: { id, organizationId }, select });
      default:
        return null;
    }
  }

  private async applyExpired(
    tx: Prisma.TransactionClient,
    entityKind: PolicyLifecycleEntityKind,
    id: string,
    now: Date,
  ): Promise<void> {
    const data = {
      status: PrivacyPolicyLifecycleStatus.EXPIRED,
      isCurrentVersion: false,
      validUntil: undefined as Date | undefined,
    };

    switch (entityKind) {
      case 'PROCESSING_ACTIVITY':
        await tx.processingActivity.update({
          where: { id },
          data: { status: data.status, isCurrentVersion: data.isCurrentVersion },
        });
        break;
      case 'LEGAL_BASIS_ASSESSMENT':
        await tx.legalBasisAssessment.update({
          where: { id },
          data: { status: data.status, isCurrentVersion: data.isCurrentVersion },
        });
        break;
      case 'ENFORCEMENT_POLICY':
        await tx.enforcementPolicy.update({
          where: { id },
          data: { status: data.status, isCurrentVersion: data.isCurrentVersion },
        });
        break;
    }

    void now;
  }

  private async recordExpiredEvent(
    tx: Prisma.TransactionClient,
    entityKind: PolicyLifecycleEntityKind,
    record: ExpirableRecord,
    event: {
      previousStatus: PrivacyPolicyLifecycleStatus;
      reasonCode: string;
      correlationId: string;
    },
  ): Promise<void> {
    const base = {
      organizationId: record.organizationId,
      eventType: PrivacyPolicyLifecycleEventType.EXPIRED,
      previousStatus: event.previousStatus,
      newStatus: PrivacyPolicyLifecycleStatus.EXPIRED,
      actorType: AuthorizationActorType.SYSTEM,
      reason: event.reasonCode,
      validUntil: record.validUntil,
      correlationId: event.correlationId,
    };

    switch (entityKind) {
      case 'PROCESSING_ACTIVITY':
        await this.events.recordProcessingActivityEvent(tx, record.id, base);
        break;
      case 'LEGAL_BASIS_ASSESSMENT':
        await this.events.recordLegalBasisAssessmentEvent(tx, record.id, base);
        break;
      case 'ENFORCEMENT_POLICY':
        await this.events.recordEnforcementPolicyEvent(tx, record.id, base);
        break;
    }
  }

  clearInMemoryIdempotencyCache(): void {
    this.processedKeys.clear();
  }
}
