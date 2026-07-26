import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  AuditLogExportRow,
  normalizeActivityLogForExport,
} from './audit-envelope.util';

export type ActivityLogExportFormat = 'json' | 'csv';

export interface ActivityLogExportQuery {
  format?: ActivityLogExportFormat;
  organizationId?: string;
  entity?: string;
  action?: string;
  level?: string;
  auditDomain?: string;
  from?: string;
  to?: string;
  limit?: number;
}

export interface ActivityLogExportResult {
  format: ActivityLogExportFormat;
  rowCount: number;
  exportedAt: string;
  contentType: string;
  filename: string;
  body: string;
  rows: AuditLogExportRow[];
}

const DEFAULT_EXPORT_LIMIT = 10_000;
const MAX_EXPORT_LIMIT = 50_000;

const CSV_COLUMNS: (keyof AuditLogExportRow | string)[] = [
  'id',
  'recordedAt',
  'action',
  'entity',
  'level',
  'description',
  'route',
  'actor.userId',
  'actor.platformRole',
  'tenant.organizationId',
  'tenant.organizationName',
  'target.entityType',
  'target.entityId',
  'trace.correlationId',
  'trace.requestId',
  'network.ipAddress',
  'network.userAgent',
  'diff.changeSummary',
];

@Injectable()
export class ActivityLogExportService {
  constructor(private readonly prisma: PrismaService) {}

  async export(query: ActivityLogExportQuery): Promise<ActivityLogExportResult> {
    const format = query.format === 'csv' ? 'csv' : 'json';
    const limit = Math.min(
      Math.max(query.limit ?? DEFAULT_EXPORT_LIMIT, 1),
      MAX_EXPORT_LIMIT,
    );
    const where = this.buildWhere(query);

    const entries = await this.prisma.activityLog.findMany({
      where,
      take: limit,
      orderBy: { createdAt: 'asc' },
      include: { user: true, organization: true },
    });

    const rows = entries.map((entry) => normalizeActivityLogForExport(entry));
    const exportedAt = new Date().toISOString();
    const filename = `synqdrive-audit-export-${exportedAt.replace(/[:.]/g, '-')}.${format}`;

    if (format === 'csv') {
      return {
        format,
        rowCount: rows.length,
        exportedAt,
        contentType: 'text/csv; charset=utf-8',
        filename,
        body: this.toCsv(rows),
        rows,
      };
    }

    return {
      format,
      rowCount: rows.length,
      exportedAt,
      contentType: 'application/json; charset=utf-8',
      filename,
      body: JSON.stringify({ exportedAt, rowCount: rows.length, rows }, null, 2),
      rows,
    };
  }

  private buildWhere(query: ActivityLogExportQuery): Prisma.ActivityLogWhereInput {
    const where: Prisma.ActivityLogWhereInput = {};

    if (query.organizationId) {
      where.organizationId = query.organizationId;
    }
    if (query.entity) {
      where.entity = query.entity as Prisma.EnumActivityEntityFilter['equals'];
    }
    if (query.action) {
      where.action = query.action as Prisma.EnumActivityActionFilter['equals'];
    }
    if (query.level) {
      where.level = query.level;
    }
    if (query.auditDomain) {
      where.metaJson = {
        path: ['auditDomain'],
        equals: query.auditDomain,
      };
    }
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) {
        where.createdAt.gte = new Date(query.from);
      }
      if (query.to) {
        where.createdAt.lte = new Date(query.to);
      }
    }

    return where;
  }

  private toCsv(rows: AuditLogExportRow[]): string {
    const header = CSV_COLUMNS.join(',');
    const lines = rows.map((row) =>
      CSV_COLUMNS.map((col) => this.csvCell(this.resolveColumn(row, col))).join(','),
    );
    return [header, ...lines].join('\n');
  }

  private resolveColumn(row: AuditLogExportRow, column: string): unknown {
    const parts = column.split('.');
    let current: unknown = row;
    for (const part of parts) {
      if (!current || typeof current !== 'object') return '';
      current = (current as Record<string, unknown>)[part];
    }
    return current ?? '';
  }

  private csvCell(value: unknown): string {
    const raw =
      value == null
        ? ''
        : typeof value === 'object'
          ? JSON.stringify(value)
          : String(value);
    const escaped = raw.replace(/"/g, '""');
    return `"${escaped}"`;
  }
}
