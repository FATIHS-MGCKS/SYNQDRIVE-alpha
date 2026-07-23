import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { isWizardDraftBooking } from '@modules/bookings/booking-wizard-draft.util';
import { PrismaService } from '@shared/database/prisma.service';
import { RentalEffectiveRulesService } from './rental-effective-rules.service';
import { vehicleDisplayName } from './rental-rules.mapper';
import {
  buildEffectiveRuleImpacts,
  buildRentalRuleRevisionDiff,
  type RentalRuleVehicleEffectiveImpact,
} from './rental-rules-revision-diff.util';
import {
  assessCriticalRuleChanges,
  type RentalRuleAffectedScopes,
  type RentalRuleBookingImpact,
  type RentalRuleCriticalImpactAssessment,
  type RentalRuleManualApprovalImpact,
} from './rental-rules-revision-impact.util';
import type { RentalRuleRevisionScope } from './rental-rules-revision-scope.util';
import type { NormalizedRentalRulesDocument } from './rental-rules-revision.types';
import { RentalRulesRevisionService } from './rental-rules-revision.service';

const EFFECTIVE_IMPACT_SAMPLE_LIMIT = 50;

export interface RentalRulePublishImpactAnalysis {
  scope: RentalRuleRevisionScope;
  draftRevisionId: string;
  diff: ReturnType<typeof buildRentalRuleRevisionDiff>;
  affectedScopes: RentalRuleAffectedScopes;
  bookingImpact: RentalRuleBookingImpact;
  manualApprovalImpact: RentalRuleManualApprovalImpact;
  criticalImpact: RentalRuleCriticalImpactAssessment;
  effectiveImpacts: RentalRuleVehicleEffectiveImpact[];
  effectiveImpactTotalVehicles: number;
  effectiveImpactTruncated: boolean;
}

@Injectable()
export class RentalRulesRevisionImpactService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly revisions: RentalRulesRevisionService,
    private readonly effectiveRules: RentalEffectiveRulesService,
  ) {}

  async analyzePublishImpact(
    scope: RentalRuleRevisionScope,
    revisionId: string,
    sourceRow?: Record<string, unknown>,
  ): Promise<RentalRulePublishImpactAnalysis> {
    const draft = await this.prisma.rentalRuleRevision.findFirst({
      where: {
        id: revisionId,
        organizationId: scope.organizationId,
        scopeType: scope.scopeType,
        scopeId: scope.scopeId,
        status: 'DRAFT',
      },
    });
    if (!draft) {
      throw new NotFoundException({
        message: 'Draft revision not found for impact analysis',
        code: 'RENTAL_RULE_REVISION_DRAFT_NOT_FOUND',
      });
    }

    const active = await this.revisions.findActiveRevision(scope);
    const activeDocument = active
      ? (active.normalizedRules as unknown as NormalizedRentalRulesDocument)
      : null;
    const draftDocument = draft.normalizedRules as unknown as NormalizedRentalRulesDocument;

    const diff = buildRentalRuleRevisionDiff({
      scopeType: scope.scopeType,
      scopeId: scope.scopeId,
      active: activeDocument,
      draft: draftDocument,
    });

    const affectedScopes = await this.resolveAffectedScopes(scope, sourceRow);
    const affectedVehicleIds = [
      ...affectedScopes.vehicles.map((row) => row.id),
      ...affectedScopes.vehiclesWithoutCategory.map((row) => row.id),
    ];
    const uniqueVehicleIds = [...new Set(affectedVehicleIds)];

    const bookingImpact = await this.analyzeBookingImpact(scope.organizationId, uniqueVehicleIds);
    const manualApprovalImpact = await this.analyzeManualApprovals(
      scope.organizationId,
      uniqueVehicleIds,
    );
    const criticalImpact = assessCriticalRuleChanges({
      diff,
      bookingImpact,
      manualApprovalImpact,
    });

    const { impacts, totalVehicles, truncated } = await this.analyzeEffectiveImpacts(
      scope,
      draftDocument,
      affectedScopes,
    );

    return {
      scope,
      draftRevisionId: draft.id,
      diff,
      affectedScopes,
      bookingImpact,
      manualApprovalImpact,
      criticalImpact,
      effectiveImpacts: impacts,
      effectiveImpactTotalVehicles: totalVehicles,
      effectiveImpactTruncated: truncated,
    };
  }

  assertPublishPreconditions(input: {
    analysis: RentalRulePublishImpactAnalysis;
    changeReason?: string | null;
    acknowledgeCriticalImpact?: boolean;
  }): void {
    const reason = input.changeReason?.trim();
    if (!reason) {
      throw new BadRequestException({
        message: 'A change reason is required before publishing rental rules',
        code: 'RENTAL_RULE_PUBLISH_CHANGE_REASON_REQUIRED',
      });
    }

    if (
      input.analysis.criticalImpact.requiresAcknowledgement &&
      !input.acknowledgeCriticalImpact
    ) {
      throw new BadRequestException({
        message: 'Critical impact must be acknowledged before publishing',
        code: 'RENTAL_RULE_PUBLISH_CRITICAL_ACK_REQUIRED',
        criticalImpact: input.analysis.criticalImpact,
      });
    }
  }

  private async resolveAffectedScopes(
    scope: RentalRuleRevisionScope,
    sourceRow?: Record<string, unknown>,
  ): Promise<RentalRuleAffectedScopes> {
    const orgId = scope.organizationId;

    if (scope.scopeType === 'ORGANIZATION') {
      const [categories, vehicles, overrides] = await Promise.all([
        this.prisma.rentalVehicleCategory.findMany({
          where: { organizationId: orgId },
          select: { id: true, name: true, _count: { select: { vehicles: true } } },
          orderBy: { name: 'asc' },
        }),
        this.prisma.vehicle.findMany({
          where: { organizationId: orgId },
          select: {
            id: true,
            vehicleName: true,
            make: true,
            model: true,
            licensePlate: true,
            rentalCategoryId: true,
            rentalCategory: { select: { name: true } },
          },
          orderBy: { licensePlate: 'asc' },
        }),
        this.prisma.vehicleRentalRequirementOverride.findMany({
          where: { organizationId: orgId },
          include: {
            vehicle: {
              select: {
                id: true,
                vehicleName: true,
                make: true,
                model: true,
                licensePlate: true,
              },
            },
          },
        }),
      ]);

      const vehiclesWithoutCategory = vehicles
        .filter((row) => !row.rentalCategoryId)
        .map((row) => ({
          id: row.id,
          displayName: vehicleDisplayName(row),
          licensePlate: row.licensePlate,
        }));

      return {
        categories: categories.map((row) => ({
          id: row.id,
          name: row.name,
          vehicleCount: row._count.vehicles,
        })),
        vehicles: vehicles.map((row) => ({
          id: row.id,
          displayName: vehicleDisplayName(row),
          licensePlate: row.licensePlate,
          rentalCategoryId: row.rentalCategoryId,
          rentalCategoryName: row.rentalCategory?.name ?? null,
        })),
        vehicleOverrides: overrides.map((row) => ({
          vehicleId: row.vehicleId,
          displayName: vehicleDisplayName(row.vehicle),
          licensePlate: row.vehicle.licensePlate,
        })),
        vehiclesWithoutCategory,
      };
    }

    if (scope.scopeType === 'CATEGORY') {
      const category =
        sourceRow ??
        (await this.prisma.rentalVehicleCategory.findFirst({
          where: { id: scope.scopeId, organizationId: orgId },
        }));
      if (!category) throw new NotFoundException('Rental category not found');

      const vehicles = await this.prisma.vehicle.findMany({
        where: { organizationId: orgId, rentalCategoryId: scope.scopeId },
        select: {
          id: true,
          vehicleName: true,
          make: true,
          model: true,
          licensePlate: true,
          rentalCategoryId: true,
          rentalCategory: { select: { name: true } },
        },
        orderBy: { licensePlate: 'asc' },
      });

      const vehicleIds = vehicles.map((row) => row.id);
      const overrides = await this.prisma.vehicleRentalRequirementOverride.findMany({
        where: { organizationId: orgId, vehicleId: { in: vehicleIds } },
        include: {
          vehicle: {
            select: {
              id: true,
              vehicleName: true,
              make: true,
              model: true,
              licensePlate: true,
            },
          },
        },
      });

      return {
        categories: [
          {
            id: scope.scopeId,
            name: String((category as { name?: string }).name ?? ''),
            vehicleCount: vehicles.length,
          },
        ],
        vehicles: vehicles.map((row) => ({
          id: row.id,
          displayName: vehicleDisplayName(row),
          licensePlate: row.licensePlate,
          rentalCategoryId: row.rentalCategoryId,
          rentalCategoryName: row.rentalCategory?.name ?? null,
        })),
        vehicleOverrides: overrides.map((row) => ({
          vehicleId: row.vehicleId,
          displayName: vehicleDisplayName(row.vehicle),
          licensePlate: row.vehicle.licensePlate,
        })),
        vehiclesWithoutCategory: [],
      };
    }

    const vehicle =
      sourceRow ??
      (await this.prisma.vehicle.findFirst({
        where: { id: scope.scopeId, organizationId: orgId },
        include: { rentalCategory: { select: { id: true, name: true } } },
      }));
    if (!vehicle) throw new NotFoundException('Vehicle not found');

    const override = await this.prisma.vehicleRentalRequirementOverride.findUnique({
      where: { vehicleId: scope.scopeId },
    });

    const vehicleRow = {
      id: String((vehicle as { id: string }).id),
      displayName: vehicleDisplayName(vehicle as Parameters<typeof vehicleDisplayName>[0]),
      licensePlate: (vehicle as { licensePlate?: string | null }).licensePlate ?? null,
      rentalCategoryId:
        (vehicle as { rentalCategoryId?: string | null }).rentalCategoryId ?? null,
      rentalCategoryName:
        (vehicle as { rentalCategory?: { name: string } | null }).rentalCategory?.name ?? null,
    };

    return {
      categories: vehicleRow.rentalCategoryId
        ? [
            {
              id: vehicleRow.rentalCategoryId,
              name: vehicleRow.rentalCategoryName ?? 'Category',
              vehicleCount: 1,
            },
          ]
        : [],
      vehicles: [vehicleRow],
      vehicleOverrides: override
        ? [
            {
              vehicleId: scope.scopeId,
              displayName: vehicleRow.displayName,
              licensePlate: vehicleRow.licensePlate,
            },
          ]
        : [],
      vehiclesWithoutCategory: vehicleRow.rentalCategoryId ? [] : [vehicleRow],
    };
  }

  private async analyzeBookingImpact(
    orgId: string,
    vehicleIds: string[],
  ): Promise<RentalRuleBookingImpact> {
    if (vehicleIds.length === 0) {
      return emptyBookingImpact();
    }

    const now = new Date();
    const bookings = await this.prisma.booking.findMany({
      where: {
        organizationId: orgId,
        vehicleId: { in: vehicleIds },
        status: { in: ['PENDING', 'CONFIRMED'] },
        endDate: { gte: now },
      },
      select: { id: true, status: true, notes: true },
    });

    const wizardDraftIds: string[] = [];
    const pendingIds: string[] = [];
    const confirmedIds: string[] = [];

    for (const booking of bookings) {
      if (booking.status === 'CONFIRMED') {
        confirmedIds.push(booking.id);
        continue;
      }
      if (isWizardDraftBooking(booking)) {
        wizardDraftIds.push(booking.id);
      } else {
        pendingIds.push(booking.id);
      }
    }

    return {
      wizardDraft: { count: wizardDraftIds.length, bookingIds: wizardDraftIds },
      pending: { count: pendingIds.length, bookingIds: pendingIds },
      confirmed: { count: confirmedIds.length, bookingIds: confirmedIds },
      confirmedBookingsUnchanged: true,
    };
  }

  private async analyzeManualApprovals(
    orgId: string,
    vehicleIds: string[],
  ): Promise<RentalRuleManualApprovalImpact> {
    if (vehicleIds.length === 0) {
      return { pendingApprovalCount: 0, approvalIds: [], bookingIds: [] };
    }

    const approvals = await this.prisma.bookingEligibilityApproval.findMany({
      where: {
        organizationId: orgId,
        status: 'PENDING',
        booking: { vehicleId: { in: vehicleIds } },
      },
      select: { id: true, bookingId: true },
    });

    return {
      pendingApprovalCount: approvals.length,
      approvalIds: approvals.map((row) => row.id),
      bookingIds: [...new Set(approvals.map((row) => row.bookingId))],
    };
  }

  private async analyzeEffectiveImpacts(
    scope: RentalRuleRevisionScope,
    draftDocument: NormalizedRentalRulesDocument,
    affectedScopes: RentalRuleAffectedScopes,
  ): Promise<{
    impacts: RentalRuleVehicleEffectiveImpact[];
    totalVehicles: number;
    truncated: boolean;
  }> {
    const vehicleRows = affectedScopes.vehicles;
    const overrideVehicleIds = new Set(affectedScopes.vehicleOverrides.map((row) => row.vehicleId));
    const impacts: RentalRuleVehicleEffectiveImpact[] = [];

    for (const vehicle of vehicleRows.slice(0, EFFECTIVE_IMPACT_SAMPLE_LIMIT)) {
      const before = await this.effectiveRules.computeForVehicle(scope.organizationId, vehicle.id);
      const after = await this.effectiveRules.computeWithSimulatedDraftScope(
        scope.organizationId,
        vehicle.id,
        scope,
        draftDocument,
      );
      const impact = buildEffectiveRuleImpacts({
        vehicleId: vehicle.id,
        displayName: vehicle.displayName,
        licensePlate: vehicle.licensePlate,
        rentalCategoryId: vehicle.rentalCategoryId,
        rentalCategoryName: vehicle.rentalCategoryName,
        hasOverride: overrideVehicleIds.has(vehicle.id),
        before,
        after,
      });
      if (impact) impacts.push(impact);
    }

    return {
      impacts,
      totalVehicles: vehicleRows.length,
      truncated: vehicleRows.length > EFFECTIVE_IMPACT_SAMPLE_LIMIT,
    };
  }
}

function emptyBookingImpact(): RentalRuleBookingImpact {
  return {
    wizardDraft: { count: 0, bookingIds: [] },
    pending: { count: 0, bookingIds: [] },
    confirmed: { count: 0, bookingIds: [] },
    confirmedBookingsUnchanged: true,
  };
}
