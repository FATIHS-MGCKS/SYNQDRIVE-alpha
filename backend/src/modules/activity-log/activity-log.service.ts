import { Injectable } from '@nestjs/common';
import { ActivityAction, ActivityEntity } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  parsePagination,
  buildPaginatedResult,
  PaginationParams,
} from '@shared/utils/pagination';

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
        description: data.description,
        metaJson: data.metaJson ?? undefined,
        ipAddress: data.ipAddress,
      },
    });
  }

  async findAll(
    params: PaginationParams & {
      entity?: string;
      action?: string;
      organizationId?: string;
    },
  ) {
    const { skip, take } = parsePagination(params);
    const where: any = {};

    if (params.entity) where.entity = params.entity;
    if (params.action) where.action = params.action;
    if (params.organizationId) where.organizationId = params.organizationId;

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

    const mapped = data.map((entry) => ({
      id: entry.id,
      action: ACTION_DISPLAY[entry.action] || entry.action,
      entity: ENTITY_DISPLAY[entry.entity] || entry.entity,
      entityId: entry.entityId || '',
      description: entry.description,
      userName: entry.user?.name || entry.user?.email || '',
      organizationName: entry.organization?.companyName || '',
      createdAt: entry.createdAt.toISOString(),
    }));

    return buildPaginatedResult(mapped, total, params);
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
