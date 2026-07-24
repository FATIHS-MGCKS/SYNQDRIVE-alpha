import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { StationAccessService } from '@shared/stations/station-access.service';
import type {
  EvaluationsAnalyticsFiltersQuery,
  ResolvedEvaluationsAnalyticsFilters,
} from '@synq/evaluations-insights/evaluations-analytics-filters.contract';
import {
  intersectVehicleIdSets,
  resolvePeriodBounds,
  toAppliedFilters,
  validateEvaluationsAnalyticsFilters,
} from '@synq/evaluations-insights/evaluations-analytics-filters';
import { DEFAULT_TARIFF_TIMEZONE } from '@modules/pricing/tariff-instant.util';

@Injectable()
export class EvaluationsAnalyticsFilterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stationAccess: StationAccessService,
  ) {}

  async resolve(
    organizationId: string,
    userId: string | undefined,
    query: EvaluationsAnalyticsFiltersQuery,
    options: { allowDataQualitySectionFilters?: boolean } = {},
  ): Promise<ResolvedEvaluationsAnalyticsFilters> {
    const errors = validateEvaluationsAnalyticsFilters(query, {
      allowDataQualityOnInsights: options.allowDataQualitySectionFilters,
    });
    if (errors.length > 0) {
      throw new BadRequestException({
        message: 'Invalid analytics filters',
        code: 'INVALID_ANALYTICS_FILTERS',
        errors,
      });
    }

    if (
      query.dataQualityStatus &&
      ['OK', 'PARTIAL', 'UNAVAILABLE'].includes(query.dataQualityStatus) &&
      !options.allowDataQualitySectionFilters
    ) {
      throw new BadRequestException({
        message:
          'dataQualityStatus OK/PARTIAL/UNAVAILABLE is only supported on the analytics summary endpoint.',
        code: 'UNSUPPORTED_FILTER_COMBINATION',
        field: 'dataQualityStatus',
      });
    }

    const access = await this.stationAccess.resolve(userId, organizationId);
    const timezone = await this.resolveOrgTimezone(organizationId);
    const { current, previous } = resolvePeriodBounds(query, timezone);

    const stationId = query.stationId ?? null;
    if (stationId) {
      this.stationAccess.assertStationReadable(access, stationId);
    }

    const vehicleId = query.vehicleId ?? null;
    if (vehicleId) {
      const vehicle = await this.prisma.vehicle.findFirst({
        where: {
          id: vehicleId,
          organizationId,
          ...this.stationAccess.buildVehicleStationScopeWhere(access),
        },
        select: { id: true },
      });
      if (!vehicle) {
        throw new NotFoundException(`Vehicle ${vehicleId} not found`);
      }
    }

    if (query.vehicleClassId) {
      const category = await this.prisma.rentalVehicleCategory.findFirst({
        where: { id: query.vehicleClassId, organizationId },
        select: { id: true },
      });
      if (!category) {
        throw new NotFoundException(`Vehicle class ${query.vehicleClassId} not found`);
      }
    }

    const stationVehicleIds = await this.resolveStationVehicleIds(
      organizationId,
      access,
      stationId,
    );

    const classVehicleIds = query.vehicleClassId
      ? await this.resolveClassVehicleIds(organizationId, access, query.vehicleClassId)
      : null;

    const statusVehicleIds = query.vehicleStatus
      ? await this.resolveStatusVehicleIds(organizationId, access, query.vehicleStatus)
      : null;

    let scopedVehicleIds = intersectVehicleIdSets(stationVehicleIds, classVehicleIds);
    scopedVehicleIds = intersectVehicleIdSets(scopedVehicleIds, statusVehicleIds);
    if (vehicleId) {
      const single = new Set([vehicleId]);
      scopedVehicleIds = intersectVehicleIdSets(scopedVehicleIds, single) ?? single;
      if (scopedVehicleIds.size === 0) {
        throw new BadRequestException({
          message: 'vehicleId does not match the active station/class/status filters.',
          code: 'UNSUPPORTED_FILTER_COMBINATION',
          field: 'vehicleId',
        });
      }
    }

    return {
      organizationId,
      period: current,
      comparisonPeriod: previous,
      stationId,
      vehicleId,
      vehicleClassId: query.vehicleClassId ?? null,
      vehicleStatus: query.vehicleStatus ?? null,
      bookingStatus: query.bookingStatus ?? null,
      customerSegment: query.customerSegment ?? null,
      currency: (query.currency ?? 'EUR').toUpperCase() === '€' ? 'EUR' : (query.currency ?? 'EUR').toUpperCase(),
      riskCategory: query.riskCategory ?? null,
      insightStatus: query.insightStatus ?? null,
      dataQualityStatus: query.dataQualityStatus ?? null,
      scopedVehicleIds,
      stationVehicleIds,
    };
  }

  serializeApplied(resolved: ResolvedEvaluationsAnalyticsFilters) {
    return toAppliedFilters(resolved);
  }

  buildVehicleWhere(
    resolved: ResolvedEvaluationsAnalyticsFilters,
    access?: Awaited<ReturnType<StationAccessService['resolve']>>,
  ): Prisma.VehicleWhereInput {
    const and: Prisma.VehicleWhereInput[] = [{ organizationId: resolved.organizationId }];
    if (access) {
      and.push(this.stationAccess.buildVehicleStationScopeWhere(access));
    }
    if (resolved.stationId) {
      and.push({
        OR: [
          { homeStationId: resolved.stationId },
          { currentStationId: resolved.stationId },
        ],
      });
    }
    if (resolved.vehicleClassId) {
      and.push({ rentalCategoryId: resolved.vehicleClassId });
    }
    if (resolved.vehicleStatus) {
      and.push({ status: resolved.vehicleStatus });
    }
    if (resolved.vehicleId) {
      and.push({ id: resolved.vehicleId });
    } else if (resolved.scopedVehicleIds) {
      and.push({ id: { in: [...resolved.scopedVehicleIds] } });
    }
    return { AND: and };
  }

  buildBookingWhere(resolved: ResolvedEvaluationsAnalyticsFilters): Prisma.BookingWhereInput {
    const and: Prisma.BookingWhereInput[] = [{ organizationId: resolved.organizationId }];
    if (resolved.bookingStatus) {
      and.push({ status: resolved.bookingStatus });
    }
    if (resolved.stationId) {
      and.push({
        OR: [
          { pickupStationId: resolved.stationId },
          { returnStationId: resolved.stationId },
        ],
      });
    }
    if (resolved.vehicleId) {
      and.push({ vehicleId: resolved.vehicleId });
    } else if (resolved.scopedVehicleIds?.size) {
      and.push({ vehicleId: { in: [...resolved.scopedVehicleIds] } });
    }
    if (resolved.customerSegment) {
      and.push({ customer: { customerType: resolved.customerSegment } });
    }
    return { AND: and };
  }

  buildInvoiceVehicleFilter(
    resolved: ResolvedEvaluationsAnalyticsFilters,
  ): Prisma.OrgInvoiceWhereInput {
    if (resolved.vehicleId) {
      return { vehicleId: resolved.vehicleId };
    }
    if (resolved.scopedVehicleIds?.size) {
      return { vehicleId: { in: [...resolved.scopedVehicleIds] } };
    }
    if (resolved.stationId && resolved.stationVehicleIds?.size) {
      return { vehicleId: { in: [...resolved.stationVehicleIds] } };
    }
    return {};
  }

  private async resolveOrgTimezone(organizationId: string): Promise<string> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { timezone: true },
    });
    return org?.timezone?.trim() || DEFAULT_TARIFF_TIMEZONE;
  }

  private async resolveStationVehicleIds(
    organizationId: string,
    access: Awaited<ReturnType<StationAccessService['resolve']>>,
    stationId: string | null,
  ): Promise<ReadonlySet<string> | null> {
    if (!stationId) return null;
    const vehicles = await this.prisma.vehicle.findMany({
      where: {
        organizationId,
        OR: [{ homeStationId: stationId }, { currentStationId: stationId }],
        ...this.stationAccess.buildVehicleStationScopeWhere(access),
      },
      select: { id: true },
    });
    return new Set(vehicles.map((v) => v.id));
  }

  private async resolveClassVehicleIds(
    organizationId: string,
    access: Awaited<ReturnType<StationAccessService['resolve']>>,
    vehicleClassId: string,
  ): Promise<ReadonlySet<string>> {
    const vehicles = await this.prisma.vehicle.findMany({
      where: {
        organizationId,
        rentalCategoryId: vehicleClassId,
        ...this.stationAccess.buildVehicleStationScopeWhere(access),
      },
      select: { id: true },
    });
    return new Set(vehicles.map((v) => v.id));
  }

  private async resolveStatusVehicleIds(
    organizationId: string,
    access: Awaited<ReturnType<StationAccessService['resolve']>>,
    vehicleStatus: NonNullable<ResolvedEvaluationsAnalyticsFilters['vehicleStatus']>,
  ): Promise<ReadonlySet<string>> {
    const vehicles = await this.prisma.vehicle.findMany({
      where: {
        organizationId,
        status: vehicleStatus,
        ...this.stationAccess.buildVehicleStationScopeWhere(access),
      },
      select: { id: true },
    });
    return new Set(vehicles.map((v) => v.id));
  }
}
