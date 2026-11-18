import { Injectable } from '@nestjs/common';
import { MasterAdminAuditService } from '@modules/activity-log/master-admin-audit.service';
import { MasterAdminAuditAction } from '@modules/activity-log/master-admin-audit.contract';
import {
  buildPrivilegedRouteLabel,
  resolveCorrelationId,
  resolveMfaAuditFields,
} from '@modules/activity-log/master-admin-audit.util';
import { STEP_UP_ACTION } from '@modules/iam-mfa/iam-mfa.policy';
import type { PolicyUpdatePayload } from './insight.types';

export type BusinessInsightsAuditRequest = {
  user?: {
    id?: string;
    platformRole?: string;
    platformPermissions?: string[];
    sessionClaims?: { assuranceLevel?: number; mfaAuthenticatedAt?: string | null };
  };
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
  connection?: { remoteAddress?: string };
  requestId?: string;
  originalUrl?: string;
  url?: string;
  method?: string;
};

type AuditSink = Pick<MasterAdminAuditService, 'record'>;

@Injectable()
export class InternalBusinessInsightsAdminAuditService {
  constructor(private readonly masterAdminAudit: MasterAdminAuditService) {}

  recordManualRunAll(input: {
    req: BusinessInsightsAuditRequest;
    organizationCount: number;
    totalPublished: number;
    orgsWithZeroPublished: number;
  }): void {
    const partial =
      input.organizationCount > 0 &&
      input.orgsWithZeroPublished > 0 &&
      input.orgsWithZeroPublished < input.organizationCount;
    const outcome = partial ? 'PARTIAL' : 'FINISHED';
    const description = partial
      ? 'Master admin manual business insights run-all finished with partial organization results'
      : 'Master admin manual business insights run-all finished';

    this.fireRecord(input.req, {
      auditAction: MasterAdminAuditAction.MASTER_BUSINESS_INSIGHTS_RUN_ALL,
      targetOrganizationId: null,
      entityId: null,
      description,
      mfaStepUpAction: STEP_UP_ACTION.MASTER_PLATFORM_SETTINGS,
      metadata: {
        domain: 'business_insights',
        operation: 'RUN_ALL',
        outcome,
        organizationCount: input.organizationCount,
        totalPublished: input.totalPublished,
        orgsWithZeroPublished: input.orgsWithZeroPublished,
      },
    });
  }

  recordManualRunOrg(input: {
    req: BusinessInsightsAuditRequest;
    targetOrganizationId: string;
    trigger: string;
    runId: string;
    published: number;
  }): void {
    const insightsDisabled = !input.runId && input.published === 0;
    const outcome = insightsDisabled ? 'INSIGHTS_DISABLED' : 'EXECUTED';
    const description = insightsDisabled
      ? `Master admin business insights run skipped (insights disabled) for org ${input.targetOrganizationId}`
      : input.published === 0
        ? `Master admin business insights run executed with zero publications for org ${input.targetOrganizationId}`
        : `Master admin business insights run executed for org ${input.targetOrganizationId}`;

    this.fireRecord(input.req, {
      auditAction: MasterAdminAuditAction.MASTER_BUSINESS_INSIGHTS_RUN_ORG,
      targetOrganizationId: input.targetOrganizationId,
      entityId: input.runId || input.targetOrganizationId,
      description,
      mfaStepUpAction: STEP_UP_ACTION.MASTER_ORGANIZATION,
      metadata: {
        domain: 'business_insights',
        operation: 'RUN_ORG',
        outcome,
        trigger: input.trigger,
        runId: input.runId || null,
        publishedCount: input.published,
      },
    });
  }

  recordDebouncedTriggerQueued(input: {
    req: BusinessInsightsAuditRequest;
    targetOrganizationId: string;
    triggerSource: string;
  }): void {
    this.fireRecord(input.req, {
      auditAction: MasterAdminAuditAction.MASTER_BUSINESS_INSIGHTS_TRIGGER_QUEUED,
      targetOrganizationId: input.targetOrganizationId,
      entityId: input.targetOrganizationId,
      description: `Master admin queued debounced business insights rerun for org ${input.targetOrganizationId}`,
      mfaStepUpAction: STEP_UP_ACTION.MASTER_ORGANIZATION,
      metadata: {
        domain: 'business_insights',
        operation: 'TRIGGER_DEBOUNCED',
        outcome: 'QUEUED',
        triggerSource: input.triggerSource,
      },
    });
  }

  recordPolicyUpdate(input: {
    req: BusinessInsightsAuditRequest;
    targetOrganizationId: string;
    updatedFieldNames: string[];
    enabledAfter?: boolean;
  }): void {
    this.fireRecord(input.req, {
      auditAction: MasterAdminAuditAction.MASTER_BUSINESS_INSIGHTS_POLICY_UPDATED,
      targetOrganizationId: input.targetOrganizationId,
      entityId: input.targetOrganizationId,
      description: `Master admin updated business insights policy for org ${input.targetOrganizationId}`,
      mfaStepUpAction: STEP_UP_ACTION.MASTER_ORGANIZATION,
      changeSummary: input.updatedFieldNames.length
        ? `Updated fields: ${input.updatedFieldNames.join(', ')}`
        : null,
      metadata: {
        domain: 'business_insights',
        operation: 'POLICY_UPDATE',
        outcome: 'UPDATED',
        updatedFieldNames: input.updatedFieldNames,
        enabledAfter: input.enabledAfter ?? null,
      },
    });
  }

  private fireRecord(
    req: BusinessInsightsAuditRequest,
    input: {
      auditAction: (typeof MasterAdminAuditAction)[keyof typeof MasterAdminAuditAction];
      targetOrganizationId: string | null;
      entityId: string | null;
      description: string;
      mfaStepUpAction: string;
      metadata: Record<string, unknown>;
      changeSummary?: string | null;
    },
  ): void {
    const mfa = resolveMfaAuditFields(req as never);
    const correlationId = resolveCorrelationId(req as never);
    const sink: AuditSink = this.masterAdminAudit;

    void sink
      .record({
        auditAction: input.auditAction,
        actorUserId: req.user?.id,
        actorPlatformRole: req.user?.platformRole ?? 'MASTER_ADMIN',
        actorPermissions: req.user?.platformPermissions ?? [],
        targetOrganizationId: input.targetOrganizationId,
        entityId: input.entityId,
        description: input.description,
        correlationId,
        route: buildPrivilegedRouteLabel(req as never),
        httpMethod: req.method ?? 'POST',
        httpStatus: 200,
        ipAddress: req.ip ?? req.connection?.remoteAddress,
        userAgent: req.headers?.['user-agent'] as string | undefined,
        mfaStepUpAction: mfa.mfaStepUpAction ?? input.mfaStepUpAction,
        mfaAssuranceLevel: mfa.mfaAssuranceLevel,
        mfaStepUpUsed: mfa.mfaStepUpUsed,
        permissionGranted: true,
        after: null,
        changeSummary: input.changeSummary ?? null,
        metadata: input.metadata,
      })
      .catch(() => undefined);
  }
}

export function policyUpdateFieldNames(payload: PolicyUpdatePayload): string[] {
  return (Object.keys(payload) as (keyof PolicyUpdatePayload)[]).filter(
    (key) => payload[key] !== undefined,
  );
}