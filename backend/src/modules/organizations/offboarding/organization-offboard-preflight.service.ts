import { Injectable, NotFoundException } from '@nestjs/common';
import {
  BillingStatus,
  OrganizationStatus,
  TripStatus,
  VehicleProviderConsentStatus,
  VehicleRegistryLifecycle,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { IamLegalHoldService } from '@modules/iam-data-retention/iam-legal-hold.service';
import { VehicleOffboardPreflightService } from '@modules/vehicle-onboarding/offboarding/vehicle-offboard-preflight.service';
import type { OrganizationOffboardPreflightSnapshot } from './organization-offboarding.types';
import {
  ORGANIZATION_OFFBOARDING_ACTIVE_JOB_STATUSES,
  type OrganizationOffboardHardBlockCode,
  type OrganizationOffboardReviewCode,
  type OrganizationOffboardWarningCode,
} from './organization-offboard-preflight.reason-codes';

const COMMITTED_BOOKING_STATUSES = ['PENDING', 'CONFIRMED'] as const;

@Injectable()
export class OrganizationOffboardPreflightService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly legalHold: IamLegalHoldService,
    private readonly vehicleOffboardPreflight: VehicleOffboardPreflightService,
  ) {}

  async assess(organizationId: string): Promise<OrganizationOffboardPreflightSnapshot> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, status: true },
    });
    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    const now = new Date();
    const hardBlockers: OrganizationOffboardHardBlockCode[] = [];
    const reviewRequired: OrganizationOffboardReviewCode[] = [];
    const warnings: OrganizationOffboardWarningCode[] = [];

    if (org.status === OrganizationStatus.ARCHIVED) {
      hardBlockers.push('ORGANIZATION_ALREADY_ARCHIVED');
    } else if (
      org.status !== OrganizationStatus.ACTIVE &&
      org.status !== OrganizationStatus.SUSPENDED
    ) {
      warnings.push('NON_ACTIVE_ORGANIZATION_STATUS');
    }

    const activeVehicles = await this.prisma.vehicle.findMany({
      where: {
        organizationId,
        registryLifecycle: VehicleRegistryLifecycle.ACTIVE,
      },
      select: { id: true },
    });
    const activeVehicleIds = activeVehicles.map((v) => v.id);

    const ongoingTripCount = activeVehicleIds.length
      ? await this.prisma.vehicleTrip.count({
          where: {
            vehicleId: { in: activeVehicleIds },
            tripStatus: TripStatus.ONGOING,
          },
        })
      : 0;
    if (ongoingTripCount > 0) {
      hardBlockers.push('ONGOING_TRIP');
    }

    const activeBookingCount = await this.prisma.booking.count({
      where: { organizationId, status: 'ACTIVE' },
    });
    if (activeBookingCount > 0) {
      hardBlockers.push('ACTIVE_RENTAL_BOOKING');
    }

    const futureCommittedBookingCount = await this.prisma.booking.count({
      where: {
        organizationId,
        status: { in: [...COMMITTED_BOOKING_STATUSES] },
        endDate: { gte: now },
      },
    });
    if (futureCommittedBookingCount > 0) {
      hardBlockers.push('RELEVANT_COMMITTED_BOOKING');
    }

    let vehiclesWithVehiclePreflightBlockCount = 0;
    for (const vehicleId of activeVehicleIds) {
      const vehiclePreflight = await this.vehicleOffboardPreflight.assess({
        organizationId,
        vehicleId,
        now,
      });
      if (!vehiclePreflight.allowed && vehiclePreflight.blockingReasons.length > 0) {
        vehiclesWithVehiclePreflightBlockCount += 1;
      } else if (vehiclePreflight.warnings.length > 0) {
        warnings.push('OPEN_VEHICLE_OPERATIONAL_WARNING');
      }
    }
    if (vehiclesWithVehiclePreflightBlockCount > 0) {
      hardBlockers.push('VEHICLE_OFFBOARD_BLOCKED');
    }

    const activeJob = await this.prisma.organizationOffboardingJob.findFirst({
      where: {
        organizationId,
        status: { in: [...ORGANIZATION_OFFBOARDING_ACTIVE_JOB_STATUSES] },
      },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    });
    if (activeJob) {
      hardBlockers.push('CONFLICTING_ACTIVE_OFFBOARDING_JOB');
    }

    const organizationLegalHoldActive = await this.legalHold.isBlocked({ organizationId });
    if (organizationLegalHoldActive) {
      reviewRequired.push('LEGAL_HOLD_DESTRUCTIVE_SCOPE');
    }

    const activeBillingSubscriptionCount = await this.prisma.billingSubscription.count({
      where: {
        organizationId,
        status: {
          in: [BillingStatus.ACTIVE, BillingStatus.PAST_DUE, BillingStatus.TRIALING],
        },
      },
    });
    if (activeBillingSubscriptionCount > 0) {
      reviewRequired.push('ACTIVE_BILLING_SUBSCRIPTION');
      reviewRequired.push('COMMERCIAL_OBLIGATION');
    }

    const activeProviderConsentCount = await this.prisma.vehicleProviderConsent.count({
      where: {
        organizationId,
        status: VehicleProviderConsentStatus.ACTIVE,
      },
    });
    const connectedDimoVehicleCount = await this.prisma.vehicle.count({
      where: {
        organizationId,
        registryLifecycle: VehicleRegistryLifecycle.ACTIVE,
        dimoVehicle: { connectionStatus: 'CONNECTED' },
      },
    });
    if (activeProviderConsentCount > 0 || connectedDimoVehicleCount > 0) {
      reviewRequired.push('PROVIDER_CONNECTION_ACTIVE');
    }

    if (organizationLegalHoldActive || activeBillingSubscriptionCount > 0) {
      reviewRequired.push('DATA_EXPORT_RECOMMENDED');
    }

    return {
      assessedAt: now.toISOString(),
      organizationId,
      organizationStatus: org.status,
      activeRegistryVehicleCount: activeVehicleIds.length,
      hardBlockers: [...new Set(hardBlockers)],
      reviewRequired: [...new Set(reviewRequired)],
      warnings: [...new Set(warnings)],
      signals: {
        ongoingTripCount,
        activeBookingCount,
        futureCommittedBookingCount,
        vehiclesWithVehiclePreflightBlockCount,
        activeProviderConsentCount,
        connectedDimoVehicleCount,
        activeBillingSubscriptionCount,
        activeOffboardingJobId: activeJob?.id ?? null,
        organizationLegalHoldActive,
      },
    };
  }
}