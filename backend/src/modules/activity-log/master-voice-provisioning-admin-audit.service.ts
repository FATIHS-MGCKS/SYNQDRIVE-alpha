import { Injectable } from '@nestjs/common';
import { MasterAdminAuditService } from './master-admin-audit.service';
import { MasterAdminAuditAction } from './master-admin-audit.contract';
import {
  buildPrivilegedRouteLabel,
  resolveCorrelationId,
  resolveMfaAuditFields,
} from './master-admin-audit.util';
import { STEP_UP_ACTION } from '@modules/iam-mfa/iam-mfa.policy';

export type VoiceProvisioningAuditRequest = {
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

export type VoiceProvisioningAuditDomain = 'TWILIO' | 'ELEVENLABS' | 'VOICE_ASSISTANT';

const DOMAIN_ACTION: Record<VoiceProvisioningAuditDomain, string> = {
  TWILIO: MasterAdminAuditAction.MASTER_VOICE_TWILIO_PROVISIONING,
  ELEVENLABS: MasterAdminAuditAction.MASTER_VOICE_ELEVENLABS_IMPORT,
  VOICE_ASSISTANT: MasterAdminAuditAction.MASTER_VOICE_ASSISTANT_ADMIN_SYNC,
};

type JobView = { status?: string } | null | undefined;

@Injectable()
export class MasterVoiceProvisioningAdminAuditService {
  constructor(private readonly masterAdminAudit: MasterAdminAuditService) {}

  recordProvisioningMutation(input: {
    req: VoiceProvisioningAuditRequest;
    domain: VoiceProvisioningAuditDomain;
    operation: string;
    targetOrganizationId: string;
    entityId: string;
    outcome: string;
    extraMetadata?: Record<string, unknown>;
  }): void {
    const mfa = resolveMfaAuditFields(input.req as never);
    const correlationId = resolveCorrelationId(input.req as never);

    void this.masterAdminAudit
      .record({
        auditAction: DOMAIN_ACTION[input.domain] as (typeof MasterAdminAuditAction)[keyof typeof MasterAdminAuditAction],
        actorUserId: input.req.user?.id,
        actorPlatformRole: input.req.user?.platformRole ?? 'MASTER_ADMIN',
        actorPermissions: input.req.user?.platformPermissions ?? [],
        targetOrganizationId: input.targetOrganizationId,
        entityId: input.entityId,
        description: `Master admin voice ${input.domain.toLowerCase()} ${input.operation.toLowerCase()}`,
        correlationId,
        route: buildPrivilegedRouteLabel(input.req as never),
        httpMethod: input.req.method ?? 'POST',
        httpStatus: resolveVoiceAuditHttpStatus(input.req),
        ipAddress: input.req.ip ?? input.req.connection?.remoteAddress,
        userAgent: input.req.headers?.['user-agent'] as string | undefined,
        mfaStepUpAction: mfa.mfaStepUpAction ?? STEP_UP_ACTION.MASTER_INTEGRATIONS,
        mfaAssuranceLevel: mfa.mfaAssuranceLevel,
        mfaStepUpUsed: mfa.mfaStepUpUsed,
        permissionGranted: true,
        after: null,
        metadata: {
          voiceDomain: input.domain,
          operation: input.operation,
          outcome: input.outcome,
          ...(input.extraMetadata ?? {}),
        },
      })
      .catch(() => undefined);
  }
}

export function resolveVoiceAuditHttpStatus(req: VoiceProvisioningAuditRequest): number {
  const method = (req.method ?? 'POST').toUpperCase();
  if (method === 'POST') return 201;
  return 200;
}

/** Observable outcome from handler response — never labels dry-run as COMPLETED. */
export function deriveVoiceProvisioningJobOutcome(result: {
  dryRun?: boolean;
  mutating?: boolean;
  job?: JobView;
  deactivated?: boolean;
  synced?: number;
  message?: string;
}): string {
  if (typeof result.synced === 'number') {
    return result.message ? 'SYNC_NO_AGENT' : 'SYNC_COMPLETED';
  }
  if (result.deactivated === true) return 'DEACTIVATE_COMPLETED';
  if (result.deactivated === false) return 'DEACTIVATE_NO_OP';

  const jobStatus = result.job?.status;
  if (jobStatus === 'FAILED') return 'PROVISIONING_FAILED';

  const nonMutating = result.dryRun === true || result.mutating === false;
  if (nonMutating) {
    if (jobStatus === 'COMPLETED') return 'ALREADY_COMPLETED';
    return 'PROVISIONING_REQUESTED';
  }

  if (jobStatus === 'COMPLETED') return 'PROVISIONING_COMPLETED';
  if (jobStatus === 'IN_PROGRESS' || jobStatus === 'PENDING') {
    return 'PROVISIONING_IN_PROGRESS';
  }
  return 'PROVISIONING_REPORTED';
}