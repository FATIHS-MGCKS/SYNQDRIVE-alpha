import { Injectable } from '@nestjs/common';
import {
  OrganizationStatus,
  VehicleProviderConsentStatus,
  VehicleStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';

export type VehicleExclusionReason =
  | 'NOT_CONNECTED'
  | 'ARCHIVED'
  | 'DEMO'
  | 'DISABLED'
  | 'BILLING_EXCLUDED'
  | 'ORG_INACTIVE'
  | 'UNKNOWN';

export type VehicleConnectivityStatus = 'CONNECTED' | 'NOT_CONNECTED';

export type VehicleBillingStatus = 'BILLABLE' | 'EXCLUDED';

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
}

export interface BillableVehiclesResult {
  connectedVehicleCount: number;
  billableVehicleCount: number;
  billableVehicles: BillableVehicleRow[];
  excludedVehicles: ExcludedVehicleRow[];
}

/**
 * Determines which org vehicles are billable for per-vehicle SaaS billing.
 *
 * Connectivity proxy (no single `isConnected` on Vehicle):
 *   1. `VehicleProviderConsent.status = ACTIVE`, or
 *   2. `VehicleDataSourceLink.isActive = true` (DIMO / High Mobility binding)
 *
 * Billable additionally requires:
 *   - org status ACTIVE
 *   - vehicle status !== OUT_OF_SERVICE
 *   - `billingExcluded = false`
 *   - vehicle name does not carry demo marker `[DEMO]` (until a dedicated flag exists)
 */
@Injectable()
export class BillableVehiclesService {
  constructor(private readonly prisma: PrismaService) {}

  async getBillableConnectedVehiclesForOrganization(
    organizationId: string,
  ): Promise<BillableVehiclesResult> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { status: true },
    });

    const orgInactive = org?.status !== OrganizationStatus.ACTIVE;

    const vehicles = await this.prisma.vehicle.findMany({
      where: { organizationId },
      select: {
        id: true,
        licensePlate: true,
        vin: true,
        make: true,
        model: true,
        vehicleName: true,
        status: true,
        billingExcluded: true,
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
    });

    const billableVehicles: BillableVehicleRow[] = [];
    const excludedVehicles: ExcludedVehicleRow[] = [];
    let connectedVehicleCount = 0;

    for (const v of vehicles) {
      const isConnected =
        v.providerConsents.length > 0 || v.dataSourceLinks.length > 0;
      const connectivityStatus: VehicleConnectivityStatus = isConnected
        ? 'CONNECTED'
        : 'NOT_CONNECTED';

      if (isConnected) connectedVehicleCount++;

      const baseRow = {
        id: v.id,
        licensePlate: v.licensePlate,
        vin: v.vin,
        make: v.make,
        model: v.model,
        connectivityStatus,
        billingStatus: 'EXCLUDED' as const,
      };

      let reason: VehicleExclusionReason | null = null;

      if (orgInactive) {
        reason = 'ORG_INACTIVE';
      } else if (v.billingExcluded) {
        reason = 'BILLING_EXCLUDED';
      } else if (v.status === VehicleStatus.OUT_OF_SERVICE) {
        reason = 'DISABLED';
      } else if (this.isDemoVehicle(v.vehicleName)) {
        reason = 'DEMO';
      } else if (!isConnected) {
        reason = 'NOT_CONNECTED';
      }

      if (reason) {
        excludedVehicles.push({ ...baseRow, reason });
      } else {
        billableVehicles.push({
          ...baseRow,
          billingStatus: 'BILLABLE',
        });
      }
    }

    return {
      connectedVehicleCount,
      billableVehicleCount: billableVehicles.length,
      billableVehicles,
      excludedVehicles,
    };
  }

  /** Demo marker until a dedicated schema flag exists. */
  private isDemoVehicle(vehicleName: string | null | undefined): boolean {
    if (!vehicleName) return false;
    return /^\[DEMO\]/i.test(vehicleName.trim());
  }
}
