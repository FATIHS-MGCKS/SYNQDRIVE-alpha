import { Injectable } from '@nestjs/common';
import { MasterAdminAuditService } from './master-admin-audit.service';
import { MasterAdminAuditAction, MasterAdminAuditActionCode } from './master-admin-audit.contract';
import {
  buildPrivilegedRouteLabel,
  resolveCorrelationId,
  resolveMfaAuditFields,
} from './master-admin-audit.util';
import { STEP_UP_ACTION } from '@modules/iam-mfa/iam-mfa.policy';

export type CatalogAdminAuditRequest = {
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

export type CatalogMutationOperation =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'IMPORT'
  | 'CONVERT'
  | 'CONNECTION_TEST';

export type CatalogMutationOutcome = 'SUCCESS' | 'TEST_SUCCEEDED' | 'TEST_FAILED';

export type CatalogAuditDomain = 'PROSPECT' | 'INSURANCE' | 'PARTS';

const DOMAIN_ACTION: Record<CatalogAuditDomain, MasterAdminAuditActionCode> = {
  PROSPECT: MasterAdminAuditAction.MASTER_PROSPECT_CATALOG_MUTATION,
  INSURANCE: MasterAdminAuditAction.MASTER_INSURANCE_CATALOG_MUTATION,
  PARTS: MasterAdminAuditAction.MASTER_PARTS_CATALOG_MUTATION,
};

@Injectable()
export class MasterCatalogAdminAuditService {
  constructor(private readonly masterAdminAudit: MasterAdminAuditService) {}

  recordMutation(input: {
    req: CatalogAdminAuditRequest;
    domain: CatalogAuditDomain;
    operation: CatalogMutationOperation;
    resource: string;
    entityId: string;
    targetOrganizationId?: string | null;
    updatedFieldNames?: string[];
    outcome?: CatalogMutationOutcome;
    extraMetadata?: Record<string, unknown>;
  }): void {
    const outcome = input.outcome ?? 'SUCCESS';
    const changeSummary =
      input.updatedFieldNames && input.updatedFieldNames.length > 0
        ? `Updated fields: ${input.updatedFieldNames.join(', ')}`
        : input.operation === 'IMPORT' && input.extraMetadata?.importCount != null
          ? `Import count: ${String(input.extraMetadata.importCount)}`
          : null;

    const description = `Master admin ${input.domain.toLowerCase()} catalog ${input.operation.toLowerCase()} on ${input.resource}`;

    const mfa = resolveMfaAuditFields(input.req as never);
    const correlationId = resolveCorrelationId(input.req as never);

    void this.masterAdminAudit
      .record({
        auditAction: DOMAIN_ACTION[input.domain],
        actorUserId: input.req.user?.id,
        actorPlatformRole: input.req.user?.platformRole ?? 'MASTER_ADMIN',
        actorPermissions: input.req.user?.platformPermissions ?? [],
        targetOrganizationId: input.targetOrganizationId ?? null,
        entityId: input.entityId,
        description,
        correlationId,
        route: buildPrivilegedRouteLabel(input.req as never),
        httpMethod: input.req.method ?? 'POST',
        httpStatus: resolveCatalogAuditHttpStatus(input.req),
        ipAddress: input.req.ip ?? input.req.connection?.remoteAddress,
        userAgent: input.req.headers?.['user-agent'] as string | undefined,
        mfaStepUpAction: mfa.mfaStepUpAction ?? STEP_UP_ACTION.MASTER_PLATFORM_SETTINGS,
        mfaAssuranceLevel: mfa.mfaAssuranceLevel,
        mfaStepUpUsed: mfa.mfaStepUpUsed,
        permissionGranted: true,
        after: null,
        changeSummary,
        level: outcome === 'TEST_FAILED' ? 'WARN' : 'INFO',
        metadata: {
          catalogDomain: input.domain,
          operation: input.operation,
          resource: input.resource,
          outcome,
          ...(input.extraMetadata ?? {}),
        },
      })
      .catch(() => undefined);
  }
}

export function resolveCatalogAuditHttpStatus(req: CatalogAdminAuditRequest): number {
  const method = (req.method ?? 'POST').toUpperCase();
  if (method === 'POST') return 201;
  if (method === 'PATCH' || method === 'PUT' || method === 'DELETE') return 200;
  return 200;
}

export function catalogMutationFieldNames(body: unknown): string[] {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return [];
  }
  return Object.keys(body as Record<string, unknown>).filter(
    (key) => (body as Record<string, unknown>)[key] !== undefined,
  );
}