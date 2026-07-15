import { Injectable } from '@nestjs/common';
import {
  BillingSubscriptionItemRole,
  BillingSubscriptionItemStatus,
  OrganizationStatus,
  VehicleProviderConsentStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  BillableVehicleExclusionReason,
  BillableVehiclePolicyResult,
  evaluateBillableVehiclePolicy,
  ExcludedBillableVehiclePolicyRow,
  VehicleConnectivityStatus,
  VehicleBillingStatus,
} from './domain/billable-vehicle-policy';

export type VehicleExclusionReason = BillableVehicleExclusionReason;
export type { VehicleConnectivityStatus, VehicleBillingStatus };

export interface BillableVehicleRow {
  id: string;
  licensePlate: string | null;
  vin: string;
  make: string;
  model: string;
  connectivityStatus: VehicleConnectivityStatus;
  billingStatus: VehicleBillingStatus;
}

export interface ExcludedVehicleRow extends BillableVehicleRow {
  reason: VehicleExclusionReason;
  assignmentId?: string;
  reasonCode?: string | null;
}

export interface BillableVehiclesResult {
  connectedVehicleCount: number;
  billableVehicleCount: number;
  billableVehicles: BillableVehicleRow[];
  excludedVehicles: ExcludedVehicleRow[];
}

/**
 * Resolves billable vehicles for per-vehicle SaaS billing via {@link evaluateBillableVehiclePolicy}.
 *
 * Connectivity is reported for operations visibility only — it does not affect billing.
 * Vehicle name, operational status, telemetry and `billingExcluded` flag do not affect billing.
 */
@Injectable()
export class BillableVehiclesService {
  constructor(private readonly prisma: PrismaService) {}

  async getBillableConnectedVehiclesForOrganization(
    organizationId: string,
    asOf: Date = new Date(),
  ): Promise<BillableVehiclesResult> {
    const [org, baseItem, assignmentCount, vehicles] = await Promise.all([
      this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { status: true },
      }),
      this.prisma.billingSubscriptionItem.findFirst({
        where: {
          organizationId,
          itemRole: BillingSubscriptionItemRole.BASE_PLAN,
          status: {
            in: [BillingSubscriptionItemStatus.ACTIVE, BillingSubscriptionItemStatus.TRIALING],
          },
        },
        orderBy: { validFrom: 'desc' },
        select: { id: true, status: true },
      }),
      this.prisma.billingBillableVehicleAssignment.count({
        where: { organizationId },
      }),
      this.prisma.vehicle.findMany({
        where: { organizationId },
        select: {
          id: true,
          organizationId: true,
          licensePlate: true,
          vin: true,
          make: true,
          model: true,
          providerConsents: {
            where: { status: VehicleProviderConsentStatus.ACTIVE },
            select: { id: true },
            take: 1,
          },
          dataSourceLinks: {
            where: { isActive: true },
            select: { id: true },
            take: 1,
          },
        },
        orderBy: { licensePlate: 'asc' },
      }),
    ]);

    const vehicleIds = vehicles.map((vehicle) => vehicle.id);
    const assignments =
      vehicleIds.length === 0
        ? []
        : await this.prisma.billingBillableVehicleAssignment.findMany({
            where: {
              organizationId,
              vehicleId: { in: vehicleIds },
            },
            select: {
              id: true,
              organizationId: true,
              vehicleId: true,
              subscriptionItemId: true,
              billableFrom: true,
              billableUntil: true,
              status: true,
              reasonCode: true,
              reasonNote: true,
              approvedByUserId: true,
            },
          });

    const connectivityByVehicleId: Record<string, boolean> = {};
    for (const vehicle of vehicles) {
      connectivityByVehicleId[vehicle.id] =
        vehicle.providerConsents.length > 0 || vehicle.dataSourceLinks.length > 0;
    }

    const policyResult = evaluateBillableVehiclePolicy({
      organizationId,
      organizationActive: org?.status === OrganizationStatus.ACTIVE,
      baseSubscriptionItemId: baseItem?.id ?? null,
      baseSubscriptionItemActive:
        baseItem?.status === BillingSubscriptionItemStatus.ACTIVE ||
        baseItem?.status === BillingSubscriptionItemStatus.TRIALING,
      asOf,
      legacyImplicitAssignments: assignmentCount === 0,
      vehicles: vehicles.map((vehicle) => ({
        id: vehicle.id,
        organizationId: vehicle.organizationId,
        licensePlate: vehicle.licensePlate,
        vin: vehicle.vin,
        make: vehicle.make,
        model: vehicle.model,
      })),
      assignments,
      connectivityByVehicleId,
    });

    return this.mapPolicyResult(policyResult);
  }

  private mapPolicyResult(result: BillableVehiclePolicyResult): BillableVehiclesResult {
    return {
      connectedVehicleCount: result.connectedVehicleCount,
      billableVehicleCount: result.billableVehicleCount,
      billableVehicles: result.billableVehicles,
      excludedVehicles: result.excludedVehicles.map((row: ExcludedBillableVehiclePolicyRow) => ({
        id: row.id,
        licensePlate: row.licensePlate,
        vin: row.vin,
        make: row.make,
        model: row.model,
        connectivityStatus: row.connectivityStatus,
        billingStatus: row.billingStatus,
        reason: row.reason,
        assignmentId: row.assignmentId,
        reasonCode: row.reasonCode,
      })),
    };
  }
}
