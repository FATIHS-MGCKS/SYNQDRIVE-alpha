import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DataAuthorizationScope,
  DataAuthorizationSourceType,
  DataAuthorizationStatus,
  OrgDataAuthorization,
  Prisma,
} from '@prisma/client';
import { AuditService } from '@modules/activity-log/audit.service';
import { PrismaService } from '@shared/database/prisma.service';
import {
  DIMO_TELEMETRY_AUTHORIZATION,
  DIMO_TELEMETRY_SYSTEM_KEY,
} from './data-authorization.constants';
import {
  calculateAuthorizationRiskLevel,
  normalizeDataCategories,
} from './data-authorization-risk.util';
import {
  assertFutureExpiresAt,
  validateScopeEntityIds,
} from './data-authorization-validation.util';
import type { CreateDataAuthorizationDto } from './dto/create-data-authorization.dto';
import type { GrantDataAuthorizationDto } from './dto/grant-data-authorization.dto';
import type { ListDataAuthorizationsQueryDto } from './dto/list-data-authorizations-query.dto';
import type { RevokeDataAuthorizationDto } from './dto/revoke-data-authorization.dto';
import type { UpdateDataAuthorizationDto } from './dto/update-data-authorization.dto';

const STATUS_DISPLAY: Record<string, string> = {
  PENDING: 'Pending',
  ACTIVE: 'Active',
  REVOKED: 'Revoked',
  EXPIRED: 'Expired',
};

const SCOPE_DISPLAY: Record<string, string> = {
  ORGANIZATION: 'Organization',
  CONNECTED_VEHICLES: 'Connected Vehicles',
  VEHICLE: 'Vehicle',
  CUSTOMER: 'Customer',
  BOOKING: 'Booking',
};

const ACCESS_PATTERN_DISPLAY: Record<string, string> = {
  ONE_TIME: 'One-time',
  ONGOING: 'Ongoing',
  RECURRING: 'Recurring',
  EVENT_DRIVEN: 'Event-driven',
};

const RISK_DISPLAY: Record<string, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  CRITICAL: 'Critical',
};

export interface DataAuthorizationStats {
  total: number;
  active: number;
  pending: number;
  revoked: number;
  expired: number;
  highRisk: number;
  expiringSoon: number;
}

@Injectable()
export class DataAuthorizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private jsonStringArray(value: Prisma.JsonValue | null | undefined): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((v): v is string => typeof v === 'string');
  }

  private effectiveStatus(
    row: Pick<OrgDataAuthorization, 'status' | 'expiresAt'>,
    now = new Date(),
  ): DataAuthorizationStatus {
    if (
      row.status === 'ACTIVE' &&
      row.expiresAt &&
      row.expiresAt.getTime() <= now.getTime()
    ) {
      return 'EXPIRED';
    }
    return row.status;
  }

  private format(auth: OrgDataAuthorization, now = new Date()) {
    const statusKey = this.effectiveStatus(auth, now);
    const purposes = this.resolvePurposes(auth);
    const vehicleIds = this.jsonStringArray(auth.vehicleIds);

    return {
      id: auth.id,
      organizationId: auth.organizationId,
      title: auth.title ?? auth.requestingEntity,
      description: auth.description,
      requestingEntity: auth.requestingEntity,
      moduleOrigin: auth.moduleOrigin,
      purpose: auth.purpose,
      purposes,
      sourceType: auth.sourceType,
      processorType: auth.processorType,
      processorName: auth.processorName,
      scope: SCOPE_DISPLAY[auth.scope] || auth.scope,
      scopeKey: auth.scope,
      dataCategories: this.jsonStringArray(auth.dataCategories),
      destination: auth.destination,
      vehicleIds: vehicleIds.length > 0 ? vehicleIds : null,
      vehicleCount: vehicleIds.length,
      customerIds: this.jsonStringArray(auth.customerIds),
      bookingIds: this.jsonStringArray(auth.bookingIds),
      accessPattern:
        ACCESS_PATTERN_DISPLAY[auth.accessPattern] || auth.accessPattern,
      accessPatternKey: auth.accessPattern,
      status: STATUS_DISPLAY[statusKey] || statusKey,
      statusKey,
      riskLevel: RISK_DISPLAY[auth.riskLevel] || auth.riskLevel,
      riskLevelKey: auth.riskLevel,
      systemKey: auth.systemKey,
      isSystemGenerated: auth.isSystemGenerated,
      lastAccessAt: auth.lastAccessAt,
      accessCount: auth.accessCount,
      revokeReason: auth.revokeReason,
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

  private resolvePurposes(auth: OrgDataAuthorization): string[] {
    const fromJson = this.jsonStringArray(auth.purposes);
    if (fromJson.length > 0) return fromJson;
    return auth.purpose ? [auth.purpose] : [];
  }

  async findDimoConnectedVehicleIds(orgId: string): Promise<string[]> {
    const rows = await this.prisma.vehicle.findMany({
      where: {
        organizationId: orgId,
        dimoVehicleId: { not: null },
      },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    return rows.map((r) => r.id);
  }

  /**
   * Idempotent system authorization for DIMO-connected fleet vehicles.
   */
  async ensureDimoTelemetryAuthorization(orgId: string): Promise<void> {
    const vehicleIds = await this.findDimoConnectedVehicleIds(orgId);
    const spec = DIMO_TELEMETRY_AUTHORIZATION;
    const normalizedCategories = normalizeDataCategories([
      ...spec.dataCategories,
    ]);

    const existing = await this.prisma.orgDataAuthorization.findUnique({
      where: {
        organizationId_systemKey: {
          organizationId: orgId,
          systemKey: DIMO_TELEMETRY_SYSTEM_KEY,
        },
      },
    });

    if (!existing) {
      if (vehicleIds.length === 0) return;

      await this.prisma.orgDataAuthorization.create({
        data: {
          organizationId: orgId,
          systemKey: DIMO_TELEMETRY_SYSTEM_KEY,
          isSystemGenerated: true,
          title: spec.title,
          description: spec.description,
          requestingEntity: spec.processorName,
          moduleOrigin: spec.moduleOrigin,
          purpose: spec.purposes[0],
          purposes: [...spec.purposes],
          sourceType: spec.sourceType,
          processorType: spec.processorType,
          processorName: spec.processorName,
          scope: spec.scope,
          dataCategories: normalizedCategories,
          destination: spec.destination,
          accessPattern: spec.accessPattern,
          vehicleIds,
          riskLevel: spec.riskLevel,
          status: 'ACTIVE',
          grantedAt: new Date(),
          grantedByName: 'System',
        },
      });
      return;
    }

    const updateData: Prisma.OrgDataAuthorizationUpdateInput = {
      title: spec.title,
      description: spec.description,
      moduleOrigin: spec.moduleOrigin,
      purposes: [...spec.purposes],
      purpose: spec.purposes[0],
      sourceType: spec.sourceType,
      processorType: spec.processorType,
      processorName: spec.processorName,
      scope: spec.scope,
      dataCategories: normalizedCategories,
      destination: spec.destination,
      vehicleIds,
      riskLevel: spec.riskLevel,
    };

    if (existing.status !== 'REVOKED') {
      if (vehicleIds.length > 0 && existing.status !== 'ACTIVE') {
        updateData.status = 'ACTIVE';
        updateData.grantedAt = existing.grantedAt ?? new Date();
        updateData.grantedByName = existing.grantedByName ?? 'System';
      }
    }

    await this.prisma.orgDataAuthorization.update({
      where: { id: existing.id },
      data: updateData,
    });
  }

  async syncSystemAuthorizations(orgId: string) {
    await this.ensureDimoTelemetryAuthorization(orgId);
    return this.findByOrg(orgId);
  }

  async findByOrg(
    orgId: string,
    filters?: ListDataAuthorizationsQueryDto,
  ) {
    await this.ensureDimoTelemetryAuthorization(orgId);

    const where: Prisma.OrgDataAuthorizationWhereInput = {
      organizationId: orgId,
    };

    if (filters?.status) {
      if (
        filters.status !== 'ACTIVE' &&
        filters.status !== 'EXPIRED'
      ) {
        where.status = filters.status as DataAuthorizationStatus;
      } else if (filters.status === 'ACTIVE') {
        where.status = 'ACTIVE';
      }
      // EXPIRED: post-filter includes ACTIVE rows past expiresAt
    }
    if (filters?.moduleOrigin) {
      where.moduleOrigin = filters.moduleOrigin;
    }
    if (filters?.scope) {
      where.scope = filters.scope as DataAuthorizationScope;
    }
    if (filters?.sourceType) {
      where.sourceType = filters.sourceType as DataAuthorizationSourceType;
    }
    if (filters?.q?.trim()) {
      const q = filters.q.trim();
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { requestingEntity: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { moduleOrigin: { contains: q, mode: 'insensitive' } },
        { processorName: { contains: q, mode: 'insensitive' } },
      ];
    }

    const rows = await this.prisma.orgDataAuthorization.findMany({
      where,
      orderBy: [{ isSystemGenerated: 'desc' }, { createdAt: 'desc' }],
    });

    const now = new Date();
    const filtered =
      filters?.status === 'ACTIVE'
        ? rows.filter(
            (r) =>
              this.effectiveStatus(r, now) === 'ACTIVE',
          )
        : filters?.status === 'EXPIRED'
          ? rows.filter(
              (r) =>
                this.effectiveStatus(r, now) === 'EXPIRED',
            )
          : rows;

    return filtered.map((r) => this.format(r, now));
  }

  async findById(orgId: string, id: string) {
    await this.ensureDimoTelemetryAuthorization(orgId);
    const row = await this.prisma.orgDataAuthorization.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!row) throw new NotFoundException('Authorization not found');
    return this.format(row);
  }

  async create(
    orgId: string,
    dto: CreateDataAuthorizationDto,
    actor?: { id?: string; name?: string },
  ) {
    const title =
      dto.title?.trim() || dto.requestingEntity?.trim();
    if (!title) {
      throw new BadRequestException('title is required');
    }

    const purposes =
      dto.purposes?.length ? dto.purposes : dto.purpose ? [dto.purpose] : [];
    if (purposes.length === 0) {
      throw new BadRequestException('purposes must be a non-empty array');
    }

    validateScopeEntityIds({
      scope: dto.scope,
      vehicleIds: dto.vehicleIds,
      customerIds: dto.customerIds,
      bookingIds: dto.bookingIds,
    });
    assertFutureExpiresAt(dto.expiresAt);

    if (dto.vehicleIds?.length) {
      await this.assertVehiclesBelongToOrg(orgId, dto.vehicleIds);
    }

    const normalizedCategories = normalizeDataCategories(dto.dataCategories);
    const riskLevel = calculateAuthorizationRiskLevel({
      dataCategories: normalizedCategories,
      purposes,
      processorType: dto.processorType ?? 'SYNQDRIVE',
      scope: dto.scope,
    });

    const row = await this.prisma.orgDataAuthorization.create({
      data: {
        organizationId: orgId,
        title,
        description: dto.description,
        requestingEntity: dto.requestingEntity?.trim() || title,
        moduleOrigin: dto.moduleOrigin,
        purpose: purposes[0],
        purposes,
        sourceType: (dto.sourceType as any) ?? 'MANUAL_UPLOAD',
        processorType: (dto.processorType as any) ?? 'SYNQDRIVE',
        processorName: dto.processorName ?? 'SynqDrive',
        scope: dto.scope as DataAuthorizationScope,
        dataCategories: normalizedCategories,
        destination: dto.destination,
        vehicleIds: dto.vehicleIds ?? undefined,
        customerIds: dto.customerIds ?? undefined,
        bookingIds: dto.bookingIds ?? undefined,
        accessPattern: (dto.accessPattern as any) ?? 'ONGOING',
        status: 'PENDING',
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
        notes: dto.notes,
        riskLevel,
        isSystemGenerated: false,
      },
    });

    void this.audit.record({
      actorUserId: actor?.id,
      actorOrganizationId: orgId,
      action: 'CREATE',
      entity: 'DATA_AUTHORIZATION',
      entityId: row.id,
      description: `Data authorization created: ${title}`,
      changeSummary: `scope=${dto.scope}; risk=${riskLevel}`,
      metaJson: {
        sourceType: dto.sourceType ?? 'MANUAL_UPLOAD',
        purposes,
        dataCategories: normalizedCategories,
      },
    });

    return this.format(row);
  }

  async update(
    orgId: string,
    id: string,
    dto: UpdateDataAuthorizationDto,
    actor?: { id?: string; name?: string },
  ) {
    const existing = await this.prisma.orgDataAuthorization.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) throw new NotFoundException('Authorization not found');
    if (existing.isSystemGenerated) {
      throw new ForbiddenException(
        'System-generated authorizations cannot be edited manually',
      );
    }
    if (existing.status === 'REVOKED') {
      throw new BadRequestException(
        'Revoked authorizations cannot be updated',
      );
    }

    const scope = dto.scope ?? existing.scope;
    validateScopeEntityIds({
      scope,
      vehicleIds: dto.vehicleIds,
      customerIds: dto.customerIds,
      bookingIds: dto.bookingIds,
    });
    if (dto.expiresAt) assertFutureExpiresAt(dto.expiresAt);

    const vehicleIds = dto.vehicleIds ?? this.jsonStringArray(existing.vehicleIds);
    if (vehicleIds.length) {
      await this.assertVehiclesBelongToOrg(orgId, vehicleIds);
    }

    const purposes = dto.purposes?.length
      ? dto.purposes
      : dto.purpose
        ? [dto.purpose]
        : this.resolvePurposes(existing);

    const dataCategories = dto.dataCategories
      ? normalizeDataCategories(dto.dataCategories)
      : this.jsonStringArray(existing.dataCategories);

    const riskLevel = calculateAuthorizationRiskLevel({
      dataCategories,
      purposes,
      processorType: dto.processorType ?? existing.processorType,
      scope,
    });

    const row = await this.prisma.orgDataAuthorization.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        requestingEntity: dto.requestingEntity,
        moduleOrigin: dto.moduleOrigin,
        purpose: purposes[0],
        purposes,
        sourceType: dto.sourceType as any,
        processorType: dto.processorType as any,
        processorName: dto.processorName,
        scope: scope as DataAuthorizationScope,
        dataCategories,
        destination: dto.destination,
        vehicleIds: dto.vehicleIds ?? undefined,
        customerIds: dto.customerIds ?? undefined,
        bookingIds: dto.bookingIds ?? undefined,
        accessPattern: dto.accessPattern as any,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
        notes: dto.notes,
        riskLevel,
      },
    });

    void this.audit.record({
      actorUserId: actor?.id,
      actorOrganizationId: orgId,
      action: 'UPDATE',
      entity: 'DATA_AUTHORIZATION',
      entityId: row.id,
      description: `Data authorization updated: ${row.title ?? row.requestingEntity}`,
      metaJson: { riskLevel },
    });

    return this.format(row);
  }

  async grant(
    orgId: string,
    id: string,
    userId: string,
    userName: string,
    dto?: GrantDataAuthorizationDto,
  ) {
    const existing = await this.prisma.orgDataAuthorization.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) throw new NotFoundException('Authorization not found');

    if (existing.status === 'REVOKED') {
      throw new BadRequestException(
        'Revoked authorizations must be recreated instead of re-granted',
      );
    }

    const purposes = this.resolvePurposes(existing);
    const riskLevel = calculateAuthorizationRiskLevel({
      dataCategories: this.jsonStringArray(existing.dataCategories),
      purposes,
      processorType: existing.processorType,
      scope: existing.scope,
    });

    const row = await this.prisma.orgDataAuthorization.update({
      where: { id },
      data: {
        status: 'ACTIVE',
        grantedById: userId,
        grantedByName: userName,
        grantedAt: new Date(),
        riskLevel,
        notes: dto?.notes
          ? [existing.notes, dto.notes].filter(Boolean).join('\n')
          : existing.notes,
        revokedById: null,
        revokedByName: null,
        revokedAt: null,
        revokeReason: null,
      },
    });

    void this.audit.record({
      actorUserId: userId,
      actorOrganizationId: orgId,
      action: 'GRANT',
      entity: 'DATA_AUTHORIZATION',
      entityId: row.id,
      description: `Data authorization granted: ${row.title ?? row.requestingEntity}`,
      changeSummary: `risk=${riskLevel}; systemKey=${row.systemKey ?? 'manual'}`,
      metaJson: {
        systemKey: row.systemKey,
        isSystemGenerated: row.isSystemGenerated,
      },
    });

    return this.format(row);
  }

  async revoke(
    orgId: string,
    id: string,
    userId: string,
    userName: string,
    dto?: RevokeDataAuthorizationDto,
  ) {
    const existing = await this.prisma.orgDataAuthorization.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) throw new NotFoundException('Authorization not found');

    if (existing.status === 'REVOKED') {
      return this.format(existing);
    }

    const row = await this.prisma.orgDataAuthorization.update({
      where: { id },
      data: {
        status: 'REVOKED',
        revokedById: userId,
        revokedByName: userName,
        revokedAt: new Date(),
        revokeReason: dto?.reason ?? null,
      },
    });

    void this.audit.critical({
      actorUserId: userId,
      actorOrganizationId: orgId,
      action: 'REVOKE',
      entity: 'DATA_AUTHORIZATION',
      entityId: row.id,
      description: `Data authorization revoked: ${row.title ?? row.requestingEntity}`,
      changeSummary: dto?.reason ?? undefined,
      metaJson: {
        systemKey: row.systemKey,
        isSystemGenerated: row.isSystemGenerated,
        scope: row.scope,
      },
    });

    return this.format(row);
  }

  async getStats(orgId: string): Promise<DataAuthorizationStats> {
    await this.ensureDimoTelemetryAuthorization(orgId);

    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const rows = await this.prisma.orgDataAuthorization.findMany({
      where: { organizationId: orgId },
      select: { status: true, riskLevel: true, expiresAt: true },
    });

    let active = 0;
    let pending = 0;
    let revoked = 0;
    let expired = 0;
    let highRisk = 0;
    let expiringSoon = 0;

    for (const row of rows) {
      const isPastExpiry = !!row.expiresAt && row.expiresAt < now;
      const effectivelyExpired = row.status === 'EXPIRED' || isPastExpiry;
      const effectivelyActive = row.status === 'ACTIVE' && !isPastExpiry;

      if (effectivelyActive) active++;
      else if (row.status === 'PENDING') pending++;
      else if (row.status === 'REVOKED') revoked++;

      if (effectivelyExpired) expired++;

      if (
        effectivelyActive &&
        (row.riskLevel === 'HIGH' || row.riskLevel === 'CRITICAL')
      ) {
        highRisk++;
      }

      if (
        effectivelyActive &&
        row.expiresAt &&
        row.expiresAt > now &&
        row.expiresAt <= in30Days
      ) {
        expiringSoon++;
      }
    }

    return {
      total: rows.length,
      active,
      pending,
      revoked,
      expired,
      highRisk,
      expiringSoon,
    };
  }

  async getAuditLog(orgId: string, limit = 50) {
    const rows = await this.prisma.activityLog.findMany({
      where: {
        organizationId: orgId,
        entity: 'DATA_AUTHORIZATION',
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    return rows.map((log) => ({
      id: log.id,
      action: log.action,
      description: log.description,
      changeSummary: log.changeSummary,
      entityId: log.entityId,
      level: log.level,
      createdAt: log.createdAt,
      actor: log.user
        ? {
            id: log.user.id,
            name: log.user.name,
            email: log.user.email,
          }
        : null,
      metaJson: log.metaJson,
    }));
  }

  private async assertVehiclesBelongToOrg(
    orgId: string,
    vehicleIds: string[],
  ): Promise<void> {
    const count = await this.prisma.vehicle.count({
      where: {
        organizationId: orgId,
        id: { in: vehicleIds },
      },
    });
    if (count !== vehicleIds.length) {
      throw new BadRequestException(
        'One or more vehicleIds do not belong to this organization',
      );
    }
  }
}
