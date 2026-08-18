import { Injectable, NotFoundException } from '@nestjs/common';
import { ActivityAction, ActivityEntity, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  parsePagination,
  buildPaginatedResult,
  PaginationParams,
} from '@shared/utils/pagination';
import { normalizeActivityLogForExport } from './audit-envelope.util';
import { MASTER_ADMIN_AUDIT_DOMAIN } from './master-admin-audit.contract';

const ACTION_DISPLAY: Record<string, string> = {
  CREATE: 'Created',
  UPDATE: 'Updated',
  DELETE: 'Deleted',
  LOGIN: 'Logged In',
  LOGOUT: 'Logged Out',
  CONNECT: 'Connected',
  DISCONNECT: 'Disconnected',
  REGISTER: 'Registered',
  IMPORT: 'Imported',
  CONVERT: 'Converted',
  SYNC: 'Synced',
  CANCEL: 'Cancelled',
  SEND: 'Sent',
};

const ENTITY_DISPLAY: Record<string, string> = {
  ORGANIZATION: 'Organization',
  USER: 'User',
  VEHICLE: 'Vehicle',
  BOOKING: 'Booking',
  CUSTOMER: 'Customer',
  PROSPECT: 'Prospect',
  INTEGRATION: 'Integration',
  SUBSCRIPTION: 'Subscription',
  STATION: 'Station',
  PRODUCT: 'Product',
  DIMO_VEHICLE: 'DIMO Vehicle',
  SUPPORT_TICKET: 'Support Ticket',
  OUTBOUND_EMAIL: 'Outbound Email',
};

@Injectable()
export class ActivityLogService {
  constructor(private readonly prisma: PrismaService) {}

  async log(data: {
    organizationId?: string;
    userId?: string;
    action: ActivityAction;
    entity: ActivityEntity;
    entityId?: string;
    description: string;
    metaJson?: any;
    ipAddress?: string;
  }) {
    return this.prisma.activityLog.create({
      data: {
        organizationId: data.organizationId,
        userId: data.userId,
        action: data.action,
        entity: data.entity,
        entityId: data.entityId,
        // Activity descriptions are written by many callers and sometimes
        // include raw values (e.g. "Updated user email to foo@bar.com"). Scrub
        // obvious PII keyed by well-known field names so audit trails stay
        // ISO 27001 / GDPR compliant.
        description: scrubPiiString(data.description),
        metaJson: scrubPiiJson(data.metaJson) ?? undefined,
        ipAddress: data.ipAddress,
      },
    });
  }

  async findAll(
    params: PaginationParams & {
      entity?: string;
      action?: string;
      organizationId?: string;
      auditDomain?: string;
      securityOnly?: string;
      from?: string;
      to?: string;
      actorUserId?: string;
      search?: string;
    },
  ) {
    const { skip, take } = parsePagination(params);
    const where = this.buildAuditWhere(params);

    const [data, total] = await Promise.all([
      this.prisma.activityLog.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { user: true, organization: true },
      }),
      this.prisma.activityLog.count({ where }),
    ]);

    const mapped = data.map((entry) => this.mapAuditListRow(entry));

    return buildPaginatedResult(mapped, total, params);
  }

  async findOneDetail(id: string) {
    const entry = await this.prisma.activityLog.findUnique({
      where: { id },
      include: { user: true, organization: true },
    });
    if (!entry) throw new NotFoundException('Audit entry not found');

    const normalized = normalizeActivityLogForExport(entry);
    const meta = (entry.metaJson ?? {}) as Record<string, unknown>;
    const reason =
      typeof meta.reasonCode === 'string'
        ? meta.reasonCode
        : typeof meta.reason === 'string'
          ? meta.reason
          : null;

    return {
      ...normalized,
      summary: this.buildAuditSummary(normalized),
      reason,
      result:
        typeof meta.httpStatus === 'number'
          ? meta.httpStatus >= 200 && meta.httpStatus < 300
            ? 'success'
            : 'failure'
          : 'success',
      auditDomain:
        typeof meta.auditDomain === 'string' ? meta.auditDomain : null,
      auditAction:
        typeof meta.auditAction === 'string' ? meta.auditAction : null,
      immutable: true,
    };
  }

  private buildAuditWhere(
    params: PaginationParams & {
      entity?: string;
      action?: string;
      organizationId?: string;
      auditDomain?: string;
      securityOnly?: string;
      from?: string;
      to?: string;
      actorUserId?: string;
      search?: string;
    },
  ): Prisma.ActivityLogWhereInput {
    const where: Prisma.ActivityLogWhereInput = {};
    const and: Prisma.ActivityLogWhereInput[] = [];

    if (params.entity) where.entity = params.entity as ActivityEntity;
    if (params.action) where.action = params.action as ActivityAction;
    if (params.organizationId) where.organizationId = params.organizationId;
    if (params.actorUserId) where.userId = params.actorUserId;

    if (params.from || params.to) {
      where.createdAt = {};
      if (params.from) where.createdAt.gte = new Date(params.from);
      if (params.to) where.createdAt.lte = new Date(params.to);
    }

    if (params.auditDomain) {
      and.push({
        metaJson: { path: ['auditDomain'], equals: params.auditDomain },
      });
    }

    if (params.securityOnly === 'true' || params.securityOnly === '1') {
      and.push({
        OR: [
          { entity: ActivityEntity.AUTH_EVENT },
          { entity: ActivityEntity.ADMIN_OPERATION },
          {
            metaJson: {
              path: ['auditDomain'],
              equals: MASTER_ADMIN_AUDIT_DOMAIN,
            },
          },
        ],
      });
    }

    if (params.search?.trim()) {
      and.push({
        description: { contains: params.search.trim(), mode: 'insensitive' },
      });
    }

    if (and.length > 0) {
      where.AND = and;
    }

    return where;
  }

  private mapAuditListRow(entry: {
    id: string;
    action: string;
    entity: string;
    entityId: string | null;
    description: string;
    level: string | null;
    metaJson: unknown;
    user?: { name: string | null; email: string | null } | null;
    organization?: { companyName: string | null } | null;
    createdAt: Date;
  }) {
    const meta = (entry.metaJson ?? {}) as Record<string, unknown>;
    const reason =
      typeof meta.reasonCode === 'string'
        ? meta.reasonCode
        : typeof meta.reason === 'string'
          ? meta.reason
          : null;
    const result =
      typeof meta.httpStatus === 'number'
        ? meta.httpStatus >= 200 && meta.httpStatus < 300
          ? 'success'
          : 'failure'
        : 'success';

    return {
      id: entry.id,
      action: ACTION_DISPLAY[entry.action] || entry.action,
      actionRaw: entry.action,
      entity: ENTITY_DISPLAY[entry.entity] || entry.entity,
      entityRaw: entry.entity,
      entityId: entry.entityId || '',
      description: entry.description,
      userName: entry.user?.name || entry.user?.email || 'System',
      actorUserId: entry.user?.email ? undefined : undefined,
      organizationName: entry.organization?.companyName || 'Plattform',
      organizationId: entry.organization?.companyName ? undefined : null,
      createdAt: entry.createdAt.toISOString(),
      reason,
      result,
      auditDomain: typeof meta.auditDomain === 'string' ? meta.auditDomain : null,
      level: entry.level,
    };
  }

  private buildAuditSummary(row: ReturnType<typeof normalizeActivityLogForExport>): string {
    const actor = row.actor.name || row.actor.email || 'System';
    const target = row.target.entityType + (row.target.entityId ? ` ${row.target.entityId.slice(0, 8)}` : '');
    return `${actor} — ${row.action} — ${target}`;
  }

  async findByOrganization(
    orgId: string,
    params?: PaginationParams & { entity?: string; action?: string },
  ) {
    return this.findAll({ ...params, organizationId: orgId });
  }

  async getRecentActivity(limit: number = 20) {
    const data = await this.prisma.activityLog.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { user: true, organization: true },
    });

    return data.map((entry) => ({
      id: entry.id,
      action: ACTION_DISPLAY[entry.action] || entry.action,
      entity: ENTITY_DISPLAY[entry.entity] || entry.entity,
      entityId: entry.entityId || '',
      description: entry.description,
      userName: entry.user?.name || entry.user?.email || '',
      organizationName: entry.organization?.companyName || '',
      createdAt: entry.createdAt.toISOString(),
    }));
  }
}

// ── PII scrubbing helpers ─────────────────────────────────────────────────────

/**
 * Best-effort key-based scrubber for nested metadata objects. Any key whose
 * name matches a known sensitive fragment is replaced with `[REDACTED]`.
 * Arrays and nested objects are walked recursively. Non-object input is
 * returned unchanged.
 */
const SENSITIVE_META_KEY_FRAGMENTS = [
  'password',
  'token',
  'secret',
  'apikey',
  'api_key',
  'authorization',
  'auth_header',
  'refresh',
  'otp',
  'pin',
  'signature',
  'iban',
  'bic',
  'creditcard',
  'credit_card',
  'cvv',
  'ssn',
  'tax_id',
  'taxid',
];

function isSensitiveMetaKey(key: string): boolean {
  const k = key.toLowerCase();
  return SENSITIVE_META_KEY_FRAGMENTS.some((f) => k.includes(f));
}

function scrubPiiJson<T = any>(input: T): T {
  if (input == null) return input;
  if (Array.isArray(input)) {
    return input.map((v) => scrubPiiJson(v)) as unknown as T;
  }
  if (typeof input !== 'object') return input;

  const out: any = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (isSensitiveMetaKey(k)) {
      out[k] = '[REDACTED]';
    } else if (v && typeof v === 'object') {
      out[k] = scrubPiiJson(v);
    } else {
      out[k] = v;
    }
  }
  return out as T;
}

/**
 * Redact likely PII embedded in a free-text description. Focused on email
 * addresses + long digit sequences which are the common carriers (IBAN,
 * phone, driver-license, credit-card). The goal is defense-in-depth, not
 * perfect PII detection — callers should prefer structured metaJson fields.
 */
function scrubPiiString(input: string): string {
  if (!input) return input;
  return input
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
    .replace(/\b\d{7,}\b/g, (m) => '[' + m.length + '-digit]');
}
