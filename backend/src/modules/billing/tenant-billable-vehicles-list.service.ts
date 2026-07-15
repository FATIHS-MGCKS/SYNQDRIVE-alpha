import { Injectable } from '@nestjs/common';
import { VehicleProviderConsentStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { buildPaginatedResult, PaginatedResult } from '@shared/utils/pagination';
import { BillableVehiclesService } from './billable-vehicles.service';
import { BillableVehicleExclusionReason } from './domain/billable-vehicle-policy';
import {
  TenantBillableVehicleListItemDto,
  TenantBillableVehicleListQueryDto,
} from './dto/tenant-billing-tariff.dto';
import { parseTenantBillingListQuery } from './tenant-billing-list-query.util';
import { resolveBillableVehicleReasonLabel } from './tenant-billing.mapper';

interface VehicleRow {
  id: string;
  licensePlate: string | null;
  make: string;
  model: string;
  homeStation: { name: string } | null;
  currentStation: { name: string } | null;
}

@Injectable()
export class TenantBillableVehiclesListService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billableVehicles: BillableVehiclesService,
  ) {}

  async listVehicles(
    organizationId: string,
    query: TenantBillableVehicleListQueryDto = {},
  ): Promise<PaginatedResult<TenantBillableVehicleListItemDto>> {
    const parsed = parseTenantBillingListQuery(query, {
      defaultSortField: 'licensePlate',
      defaultSortOrder: 'asc',
      allowedSortFields: TenantBillableVehicleListQueryDto.ALLOWED_SORT_FIELDS,
    });

    const items = await this.buildVehicleItems(organizationId);
    const filtered = this.applyFilters(items, parsed);
    const sorted = this.sortItems(filtered, parsed);
    const pageItems = sorted.slice(parsed.skip, parsed.skip + parsed.take);

    return buildPaginatedResult(pageItems, filtered.length, {
      page: parsed.page,
      limit: parsed.limit,
    });
  }

  private async buildVehicleItems(
    organizationId: string,
  ): Promise<TenantBillableVehicleListItemDto[]> {
    const snapshot = await this.billableVehicles.getBillableConnectedVehiclesForOrganization(
      organizationId,
    );

    const vehicleIds = [
      ...snapshot.billableVehicles.map((vehicle) => vehicle.id),
      ...snapshot.excludedVehicles.map((vehicle) => vehicle.id),
    ];

    if (vehicleIds.length === 0) {
      return [];
    }

    const [assignments, vehicles] = await Promise.all([
      this.prisma.billingBillableVehicleAssignment.findMany({
        where: { organizationId, vehicleId: { in: vehicleIds } },
        orderBy: { billableFrom: 'desc' },
        select: {
          vehicleId: true,
          billableFrom: true,
          billableUntil: true,
          reasonCode: true,
          reasonNote: true,
        },
      }),
      this.prisma.vehicle.findMany({
        where: { id: { in: vehicleIds } },
        select: {
          id: true,
          licensePlate: true,
          make: true,
          model: true,
          homeStation: { select: { name: true } },
          currentStation: { select: { name: true } },
        },
      }),
    ]);

    const assignmentByVehicleId = new Map<string, (typeof assignments)[number]>();
    for (const assignment of assignments) {
      if (!assignmentByVehicleId.has(assignment.vehicleId)) {
        assignmentByVehicleId.set(assignment.vehicleId, assignment);
      }
    }

    const vehicleById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));

    const mapVehicle = (
      row: (typeof snapshot.billableVehicles)[number] | (typeof snapshot.excludedVehicles)[number],
      billingStatus: 'BILLABLE' | 'EXCLUDED',
    ): TenantBillableVehicleListItemDto => {
      const vehicle = vehicleById.get(row.id);
      const assignment = assignmentByVehicleId.get(row.id);
      const exclusionReason =
        billingStatus === 'EXCLUDED' && 'reason' in row
          ? (row.reason as BillableVehicleExclusionReason)
          : null;

      return {
        id: row.id,
        licensePlate: row.licensePlate,
        make: row.make,
        model: row.model,
        vehicleLabel: [row.make, row.model].filter(Boolean).join(' '),
        stationName: resolveStationName(vehicle),
        billableFrom: assignment?.billableFrom.toISOString() ?? null,
        billableUntil: assignment?.billableUntil?.toISOString() ?? null,
        billingStatus,
        billingStatusLabel: billingStatus === 'BILLABLE' ? 'Abrechenbar' : 'Nicht abrechenbar',
        reasonLabel: resolveBillableVehicleReasonLabel({
          billingStatus,
          exclusionReason,
          reasonCode: assignment?.reasonCode,
          reasonNote: assignment?.reasonNote,
        }),
      };
    };

    return [
      ...snapshot.billableVehicles.map((vehicle) => mapVehicle(vehicle, 'BILLABLE')),
      ...snapshot.excludedVehicles.map((vehicle) => mapVehicle(vehicle, 'EXCLUDED')),
    ];
  }

  private applyFilters(
    items: TenantBillableVehicleListItemDto[],
    parsed: ReturnType<typeof parseTenantBillingListQuery>,
  ): TenantBillableVehicleListItemDto[] {
    let result = items;

    if (parsed.status === 'BILLABLE' || parsed.status === 'EXCLUDED') {
      result = result.filter((item) => item.billingStatus === parsed.status);
    }

    if (parsed.search) {
      const needle = parsed.search.toLowerCase();
      result = result.filter((item) =>
        [item.licensePlate, item.make, item.model, item.vehicleLabel, item.stationName]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(needle)),
      );
    }

    return result;
  }

  private sortItems(
    items: TenantBillableVehicleListItemDto[],
    parsed: ReturnType<typeof parseTenantBillingListQuery>,
  ): TenantBillableVehicleListItemDto[] {
    const dir = parsed.sortOrder === 'desc' ? -1 : 1;
    const field = parsed.sortField;

    return [...items].sort((left, right) => {
      const compareStrings = (a: string | null | undefined, b: string | null | undefined) =>
        (a ?? '').localeCompare(b ?? '', 'de') * dir;

      switch (field) {
        case 'make':
          return compareStrings(left.vehicleLabel, right.vehicleLabel) || compareStrings(left.id, right.id);
        case 'billableFrom':
          return (
            compareStrings(left.billableFrom, right.billableFrom) || compareStrings(left.id, right.id)
          );
        case 'billingStatus':
          return (
            compareStrings(left.billingStatus, right.billingStatus) ||
            compareStrings(left.licensePlate, right.licensePlate)
          );
        case 'licensePlate':
        default:
          return (
            compareStrings(left.licensePlate, right.licensePlate) || compareStrings(left.id, right.id)
          );
      }
    });
  }
}

function resolveStationName(vehicle: VehicleRow | undefined): string | null {
  if (!vehicle) return null;
  return vehicle.currentStation?.name ?? vehicle.homeStation?.name ?? null;
}

export const tenantBillableVehiclesListInternals = {
  resolveStationName,
};
