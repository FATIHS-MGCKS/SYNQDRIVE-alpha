/**
 * Canonical audit envelope stored in ActivityLog.metaJson.
 * Ensures actor, target, tenant, trace IDs, network metadata, and before/after diff
 * are present in a consistent shape for master-admin and general audit consumers.
 */
export interface AuditEnvelopeInput {
  auditDomain?: string;
  auditAction?: string;
  actorUserId?: string | null;
  actorPlatformRole?: string | null;
  actorPermissions?: string[];
  targetOrganizationId?: string | null;
  targetEntityType?: string | null;
  targetEntityId?: string | null;
  correlationId?: string | null;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  before?: unknown;
  after?: unknown;
  changeSummary?: string | null;
  recordedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditLogExportRow {
  id: string;
  recordedAt: string;
  action: string;
  entity: string;
  level: string | null;
  description: string;
  route: string | null;
  actor: {
    userId: string | null;
    name: string | null;
    email: string | null;
    platformRole: string | null;
    permissions: string[];
  };
  target: {
    entityType: string;
    entityId: string | null;
  };
  tenant: {
    organizationId: string | null;
    organizationName: string | null;
  };
  trace: {
    correlationId: string | null;
    requestId: string | null;
  };
  network: {
    ipAddress: string | null;
    userAgent: string | null;
  };
  diff: {
    before: unknown;
    after: unknown;
    changeSummary: string | null;
  };
  meta: Record<string, unknown>;
}

export function buildAuditEnvelope(input: AuditEnvelopeInput): Record<string, unknown> {
  const recordedAt = input.recordedAt ?? new Date().toISOString();
  const correlationId = input.correlationId ?? input.requestId ?? null;
  const requestId = input.requestId ?? correlationId;

  return {
    auditDomain: input.auditDomain,
    auditAction: input.auditAction,
    actor: {
      userId: input.actorUserId ?? null,
      platformRole: input.actorPlatformRole ?? null,
      permissions: input.actorPermissions ?? [],
    },
    target: {
      organizationId: input.targetOrganizationId ?? null,
      entityType: input.targetEntityType ?? null,
      entityId: input.targetEntityId ?? null,
    },
    tenant: {
      organizationId: input.targetOrganizationId ?? null,
    },
    trace: {
      correlationId,
      requestId,
    },
    network: {
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    },
    diff: {
      before: input.before ?? null,
      after: input.after ?? null,
      changeSummary: input.changeSummary ?? null,
    },
    recordedAt,
    // Legacy flat fields for backward-compatible queries
    correlationId,
    requestId,
    actorUserId: input.actorUserId ?? null,
    actorPlatformRole: input.actorPlatformRole ?? null,
    actorPermissions: input.actorPermissions ?? [],
    targetOrganizationId: input.targetOrganizationId ?? null,
    ...(input.metadata ?? {}),
  };
}

type ActivityLogExportSource = {
  id: string;
  organizationId: string | null;
  userId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  description: string;
  changeSummary: string | null;
  route: string | null;
  userAgent: string | null;
  level: string | null;
  metaJson: unknown;
  ipAddress: string | null;
  createdAt: Date;
  user?: { name: string | null; email: string | null } | null;
  organization?: { companyName: string | null } | null;
};

function readMetaString(meta: Record<string, unknown>, key: string): string | null {
  const value = meta[key];
  return typeof value === 'string' ? value : null;
}

function readNested(
  meta: Record<string, unknown>,
  path: string[],
): unknown {
  let current: unknown = meta;
  for (const key of path) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

/** Normalize a DB row (legacy or envelope) into the export contract. */
export function normalizeActivityLogForExport(entry: ActivityLogExportSource): AuditLogExportRow {
  const meta = (entry.metaJson ?? {}) as Record<string, unknown>;
  const actorBlock = (meta.actor ?? {}) as Record<string, unknown>;
  const targetBlock = (meta.target ?? {}) as Record<string, unknown>;
  const tenantBlock = (meta.tenant ?? {}) as Record<string, unknown>;
  const traceBlock = (meta.trace ?? {}) as Record<string, unknown>;
  const networkBlock = (meta.network ?? {}) as Record<string, unknown>;
  const diffBlock = (meta.diff ?? {}) as Record<string, unknown>;

  const correlationId =
    readMetaString(traceBlock, 'correlationId') ??
    readMetaString(meta, 'correlationId');
  const requestId =
    readMetaString(traceBlock, 'requestId') ??
    readMetaString(meta, 'requestId') ??
    correlationId;

  const targetOrgId =
    readMetaString(tenantBlock, 'organizationId') ??
    readMetaString(targetBlock, 'organizationId') ??
    readMetaString(meta, 'targetOrganizationId') ??
    entry.organizationId;

  return {
    id: entry.id,
    recordedAt:
      readMetaString(meta, 'recordedAt') ?? entry.createdAt.toISOString(),
    action: entry.action,
    entity: entry.entity,
    level: entry.level,
    description: entry.description,
    route: entry.route,
    actor: {
      userId:
        readMetaString(actorBlock, 'userId') ??
        readMetaString(meta, 'actorUserId') ??
        entry.userId,
      name: entry.user?.name ?? null,
      email: entry.user?.email ?? null,
      platformRole:
        readMetaString(actorBlock, 'platformRole') ??
        readMetaString(meta, 'actorPlatformRole'),
      permissions: Array.isArray(actorBlock.permissions)
        ? (actorBlock.permissions as string[])
        : Array.isArray(meta.actorPermissions)
          ? (meta.actorPermissions as string[])
          : [],
    },
    target: {
      entityType:
        readMetaString(targetBlock, 'entityType') ?? entry.entity,
      entityId:
        readMetaString(targetBlock, 'entityId') ??
        entry.entityId,
    },
    tenant: {
      organizationId: targetOrgId,
      organizationName: entry.organization?.companyName ?? null,
    },
    trace: {
      correlationId,
      requestId,
    },
    network: {
      ipAddress:
        readMetaString(networkBlock, 'ipAddress') ??
        entry.ipAddress,
      userAgent:
        readMetaString(networkBlock, 'userAgent') ??
        entry.userAgent,
    },
    diff: {
      before: readNested(diffBlock, ['before']) ?? meta.before ?? null,
      after: readNested(diffBlock, ['after']) ?? meta.after ?? null,
      changeSummary:
        readMetaString(diffBlock, 'changeSummary') ?? entry.changeSummary,
    },
    meta,
  };
}
