import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { Prisma } from '@prisma/client';

const STATUS_DISPLAY: Record<string, string> = {
  PENDING: 'Pending',
  ACTIVE: 'Active',
  REVOKED: 'Revoked',
  EXPIRED: 'Expired',
};

const SCOPE_DISPLAY: Record<string, string> = {
  ORGANIZATION: 'Organization',
  VEHICLE: 'Vehicle',
};

const ACCESS_PATTERN_DISPLAY: Record<string, string> = {
  ONE_TIME: 'One-time',
  ONGOING: 'Ongoing',
  RECURRING: 'Recurring',
  EVENT_DRIVEN: 'Event-driven',
};

@Injectable()
export class DataAuthorizationsService {
  constructor(private readonly prisma: PrismaService) {}

  private format(auth: Record<string, unknown>) {
    return {
      id: auth.id,
      organizationId: auth.organizationId,
      requestingEntity: auth.requestingEntity,
      moduleOrigin: auth.moduleOrigin,
      purpose: auth.purpose,
      scope: SCOPE_DISPLAY[auth.scope as string] || auth.scope,
      scopeKey: auth.scope,
      dataCategories: auth.dataCategories,
      destination: auth.destination,
      vehicleIds: auth.vehicleIds,
      accessPattern: ACCESS_PATTERN_DISPLAY[auth.accessPattern as string] || auth.accessPattern,
      accessPatternKey: auth.accessPattern,
      status: STATUS_DISPLAY[auth.status as string] || auth.status,
      statusKey: auth.status,
      grantedById: auth.grantedById,
      grantedByName: auth.grantedByName,
      grantedAt: auth.grantedAt,
      revokedById: auth.revokedById,
      revokedByName: auth.revokedByName,
      revokedAt: auth.revokedAt,
      expiresAt: auth.expiresAt,
      notes: auth.notes,
      createdAt: auth.createdAt,
      updatedAt: auth.updatedAt,
    };
  }

  async findByOrg(orgId: string, filters?: { status?: string; moduleOrigin?: string; scope?: string }) {
    const where: Prisma.OrgDataAuthorizationWhereInput = { organizationId: orgId };
    if (filters?.status) where.status = filters.status as any;
    if (filters?.moduleOrigin) where.moduleOrigin = filters.moduleOrigin;
    if (filters?.scope) where.scope = filters.scope as any;

    const rows = await this.prisma.orgDataAuthorization.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.format(r as unknown as Record<string, unknown>));
  }

  async findById(orgId: string, id: string) {
    const row = await this.prisma.orgDataAuthorization.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!row) throw new NotFoundException('Authorization not found');
    return this.format(row as unknown as Record<string, unknown>);
  }

  async create(orgId: string, data: {
    requestingEntity: string;
    moduleOrigin: string;
    purpose: string;
    scope?: string;
    dataCategories: string[];
    destination: string;
    vehicleIds?: string[];
    accessPattern?: string;
    status?: string;
    grantedById?: string;
    grantedByName?: string;
    expiresAt?: string;
    notes?: string;
  }) {
    const row = await this.prisma.orgDataAuthorization.create({
      data: {
        organizationId: orgId,
        requestingEntity: data.requestingEntity,
        moduleOrigin: data.moduleOrigin,
        purpose: data.purpose,
        scope: (data.scope as any) || 'ORGANIZATION',
        dataCategories: data.dataCategories as any,
        destination: data.destination,
        vehicleIds: data.vehicleIds ? (data.vehicleIds as any) : undefined,
        accessPattern: (data.accessPattern as any) || 'ONGOING',
        status: (data.status as any) || 'ACTIVE',
        grantedById: data.grantedById,
        grantedByName: data.grantedByName,
        grantedAt: data.status === 'ACTIVE' ? new Date() : undefined,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
        notes: data.notes,
      },
    });
    return this.format(row as unknown as Record<string, unknown>);
  }

  async grant(orgId: string, id: string, userId: string, userName: string) {
    const existing = await this.prisma.orgDataAuthorization.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) throw new NotFoundException('Authorization not found');

    const row = await this.prisma.orgDataAuthorization.update({
      where: { id },
      data: {
        status: 'ACTIVE',
        grantedById: userId,
        grantedByName: userName,
        grantedAt: new Date(),
      },
    });
    return this.format(row as unknown as Record<string, unknown>);
  }

  async revoke(orgId: string, id: string, userId: string, userName: string) {
    const existing = await this.prisma.orgDataAuthorization.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) throw new NotFoundException('Authorization not found');

    const row = await this.prisma.orgDataAuthorization.update({
      where: { id },
      data: {
        status: 'REVOKED',
        revokedById: userId,
        revokedByName: userName,
        revokedAt: new Date(),
      },
    });
    return this.format(row as unknown as Record<string, unknown>);
  }

  async getStats(orgId: string) {
    const [total, active, revoked, pending, expired] = await Promise.all([
      this.prisma.orgDataAuthorization.count({ where: { organizationId: orgId } }),
      this.prisma.orgDataAuthorization.count({ where: { organizationId: orgId, status: 'ACTIVE' } }),
      this.prisma.orgDataAuthorization.count({ where: { organizationId: orgId, status: 'REVOKED' } }),
      this.prisma.orgDataAuthorization.count({ where: { organizationId: orgId, status: 'PENDING' } }),
      this.prisma.orgDataAuthorization.count({ where: { organizationId: orgId, status: 'EXPIRED' } }),
    ]);
    return { total, active, revoked, pending, expired };
  }
}
