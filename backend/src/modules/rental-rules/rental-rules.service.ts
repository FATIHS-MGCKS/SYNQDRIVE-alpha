import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ActivityAction, ActivityEntity, Prisma } from '@prisma/client';
import { ActivityLogService } from '@modules/activity-log/activity-log.service';
import { PrismaService } from '@shared/database/prisma.service';
import { RentalEffectiveRulesService } from './rental-effective-rules.service';
import {
  AssignCategoryVehiclesDto,
  CreateRentalVehicleCategoryDto,
  PreviewCategoryVehicleAssignmentDto,
  ResetVehicleRentalOverridesDto,
  UpdateRentalVehicleCategoryDto,
  UpsertOrganizationRentalRulesDto,
  UpsertVehicleRentalOverridesDto,
} from './dto';
import {
  formatOrganizationRentalRules,
  formatRentalVehicleCategory,
  formatVehicleRentalOverride,
  pickRulePatch,
  prismaRuleColumns,
  toPrismaRuleColumns,
  vehicleDisplayName,
  extractRuleFields,
  hasActiveRuleOverrides,
} from './rental-rules.mapper';
import { normalizeRentalCategoryName } from './rental-rules-category.util';
import { RENTAL_RULE_FIELD_KEYS, type RentalRuleFieldKey } from './rental-rules.types';
import { RentalRulePermissionService } from './rental-rule-permission.service';
import type { PermissionActor } from '@shared/auth/permission.util';
import {
  buildOverrideResetPatch,
  mergeOverrideFieldsAfterReset,
  resolveOverrideResetFields,
} from './vehicle-rental-override-reset.util';
import { RENTAL_RULES_INITIAL_EXPECTED_VERSION } from './rental-rules-concurrency.constants';
import { throwRentalRulesVersionConflict } from './rental-rules-concurrency.util';
import type { CategoryAssignmentApplyPlan, CategoryAssignmentDiff } from './rental-rules-category-assignment.types';
import {
  assertCategoryAssignmentDeltaIsActionable,
  buildCategoryAssignmentPlan,
  normalizeCategoryAssignmentDelta,
  throwRentalRulesAssignmentStale,
  totalDeltaVehicleCount,
} from './rental-rules-category-assignment.util';

interface RentalRulesMutationContext {
  actor?: PermissionActor;
}

@Injectable()
export class RentalRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly effectiveRules: RentalEffectiveRulesService,
    private readonly rentalRulePermissions: RentalRulePermissionService,
    private readonly activityLog: ActivityLogService,
  ) {}

  private async assertOrgExists(orgId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true },
    });
    if (!org) throw new NotFoundException('Organization not found');
  }

  private async loadCategory(orgId: string, categoryId: string) {
    const category = await this.prisma.rentalVehicleCategory.findFirst({
      where: { id: categoryId, organizationId: orgId },
    });
    if (!category) throw new NotFoundException('Rental category not found');
    return category;
  }

  private async loadVehicle(orgId: string, vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId: orgId },
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');
    return vehicle;
  }

  private normalizeDepositCurrency(patch: { depositCurrency?: string | null }) {
    if (patch.depositCurrency !== undefined && patch.depositCurrency !== null) {
      patch.depositCurrency = patch.depositCurrency.trim().toUpperCase() || 'EUR';
    }
  }

  async getOrganizationDefaults(orgId: string) {
    await this.assertOrgExists(orgId);
    const row = await this.prisma.organizationRentalRules.findUnique({
      where: { organizationId: orgId },
    });
    if (!row) {
      return {
        organizationId: orgId,
        minimumAgeYears: null,
        minimumLicenseHoldingMonths: null,
        minimumLicenseHoldingYears: null,
        depositAmountCents: null,
        depositAmount: null,
        depositCurrency: 'EUR',
        creditCardRequired: null,
        foreignTravelPolicy: null,
        additionalDriverPolicy: null,
        youngDriverPolicy: null,
        insuranceRequirement: null,
        manualApprovalRequired: null,
        notes: null,
        isActive: true,
        version: RENTAL_RULES_INITIAL_EXPECTED_VERSION,
        configured: false,
      };
    }
    return { ...formatOrganizationRentalRules(row), configured: true };
  }

  private toPrismaRuleData(
    patch: ReturnType<typeof pickRulePatch>,
    layer: 'organization' | 'category' | 'vehicleOverride' = 'organization',
  ) {
    return toPrismaRuleColumns(patch, { layer });
  }

  async upsertOrganizationDefaults(
    orgId: string,
    dto: UpsertOrganizationRentalRulesDto,
    ctx: RentalRulesMutationContext = {},
  ) {
    await this.assertOrgExists(orgId);
    const expectedVersion = dto.expectedVersion;
    const patch = this.toPrismaRuleData(pickRulePatch(dto), 'organization');
    await this.rentalRulePermissions.assertPublishIfActiveChange(ctx.actor, orgId, patch.isActive as boolean | undefined);
    this.normalizeDepositCurrency(patch as { depositCurrency?: string | null });

    const existing = await this.prisma.organizationRentalRules.findUnique({
      where: { organizationId: orgId },
    });

    if (!existing) {
      if (expectedVersion !== RENTAL_RULES_INITIAL_EXPECTED_VERSION) {
        throwRentalRulesVersionConflict({
          entityType: 'organization_default',
          expectedVersion,
          currentVersion: RENTAL_RULES_INITIAL_EXPECTED_VERSION,
          current: null,
        });
      }
      const row = await this.prisma.organizationRentalRules.create({
        data: {
          organizationId: orgId,
          depositCurrency: (patch.depositCurrency as string | undefined) ?? 'EUR',
          isActive: (patch.isActive as boolean | undefined) ?? true,
          minimumAgeYears: (patch.minimumAgeYears as number | null | undefined) ?? null,
          minimumLicenseHoldingMonths: (patch.minimumLicenseHoldingMonths as number | null | undefined) ?? null,
          depositAmountCents: (patch.depositAmountCents as number | null | undefined) ?? null,
          creditCardRequired: (patch.creditCardRequired as boolean | null | undefined) ?? null,
          foreignTravelPolicy: patch.foreignTravelPolicy as Prisma.OrganizationRentalRulesCreateInput['foreignTravelPolicy'],
          additionalDriverPolicy: patch.additionalDriverPolicy as Prisma.OrganizationRentalRulesCreateInput['additionalDriverPolicy'],
          youngDriverPolicy: patch.youngDriverPolicy as Prisma.OrganizationRentalRulesCreateInput['youngDriverPolicy'],
          insuranceRequirement: (patch.insuranceRequirement as string | null | undefined) ?? null,
          manualApprovalRequired: (patch.manualApprovalRequired as boolean | null | undefined) ?? null,
          notes: (patch.notes as string | null | undefined) ?? null,
        },
      });
      return { ...formatOrganizationRentalRules(row), configured: true };
    }

    const updateData: Prisma.OrganizationRentalRulesUpdateManyMutationInput = {
      version: { increment: 1 },
      ...(patch.isActive !== undefined ? { isActive: patch.isActive as boolean } : {}),
      ...(patch.minimumAgeYears !== undefined ? { minimumAgeYears: patch.minimumAgeYears as number | null } : {}),
      ...(patch.minimumLicenseHoldingMonths !== undefined
        ? { minimumLicenseHoldingMonths: patch.minimumLicenseHoldingMonths as number | null }
        : {}),
      ...(patch.depositAmountCents !== undefined ? { depositAmountCents: patch.depositAmountCents as number | null } : {}),
      ...(patch.depositCurrency !== undefined ? { depositCurrency: patch.depositCurrency as string } : {}),
      ...(patch.creditCardRequired !== undefined ? { creditCardRequired: patch.creditCardRequired as boolean | null } : {}),
      ...(patch.foreignTravelPolicy !== undefined
        ? { foreignTravelPolicy: patch.foreignTravelPolicy as Prisma.OrganizationRentalRulesUpdateInput['foreignTravelPolicy'] }
        : {}),
      ...(patch.additionalDriverPolicy !== undefined
        ? { additionalDriverPolicy: patch.additionalDriverPolicy as Prisma.OrganizationRentalRulesUpdateInput['additionalDriverPolicy'] }
        : {}),
      ...(patch.youngDriverPolicy !== undefined
        ? { youngDriverPolicy: patch.youngDriverPolicy as Prisma.OrganizationRentalRulesUpdateInput['youngDriverPolicy'] }
        : {}),
      ...(patch.insuranceRequirement !== undefined
        ? { insuranceRequirement: patch.insuranceRequirement as string | null }
        : {}),
      ...(patch.manualApprovalRequired !== undefined
        ? { manualApprovalRequired: patch.manualApprovalRequired as boolean | null }
        : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes as string | null } : {}),
    };

    const { count } = await this.prisma.organizationRentalRules.updateMany({
      where: { organizationId: orgId, version: expectedVersion },
      data: updateData,
    });
    if (count === 0) {
      const current = await this.prisma.organizationRentalRules.findUnique({
        where: { organizationId: orgId },
      });
      throwRentalRulesVersionConflict({
        entityType: 'organization_default',
        expectedVersion,
        currentVersion: current?.version ?? RENTAL_RULES_INITIAL_EXPECTED_VERSION,
        current: current ? formatOrganizationRentalRules(current) : null,
      });
    }

    const row = await this.prisma.organizationRentalRules.findUniqueOrThrow({
      where: { organizationId: orgId },
    });
    return { ...formatOrganizationRentalRules(row), configured: true };
  }

  async listCategories(orgId: string, includeInactive = false) {
    await this.assertOrgExists(orgId);
    const rows = await this.prisma.rentalVehicleCategory.findMany({
      where: {
        organizationId: orgId,
        ...(includeInactive ? {} : { isActive: true }),
      },
      include: { _count: { select: { vehicles: true } } },
      orderBy: [{ name: 'asc' }],
    });
    return rows.map((row) => formatRentalVehicleCategory(row));
  }

  async getCategory(orgId: string, categoryId: string) {
    const row = await this.loadCategory(orgId, categoryId);
    const withCount = await this.prisma.rentalVehicleCategory.findUnique({
      where: { id: row.id },
      include: { _count: { select: { vehicles: true } } },
    });
    return formatRentalVehicleCategory(withCount!);
  }

  async createCategory(
    orgId: string,
    dto: CreateRentalVehicleCategoryDto,
    ctx: RentalRulesMutationContext = {},
  ) {
    await this.assertOrgExists(orgId);
    const patch = this.toPrismaRuleData(pickRulePatch(dto), 'category');
    const requestedActive =
      (patch.isActive as boolean | undefined) ??
      (dto.isActive !== undefined ? dto.isActive : undefined);
    await this.rentalRulePermissions.assertPublishIfActiveChange(ctx.actor, orgId, requestedActive);
    this.normalizeDepositCurrency(patch as { depositCurrency?: string | null });

    const trimmedName = dto.name.trim();
    const row = await this.prisma.rentalVehicleCategory.create({
      data: {
        organizationId: orgId,
        name: trimmedName,
        nameNormalized: normalizeRentalCategoryName(trimmedName),
        description: dto.description?.trim() || null,
        type: dto.type ?? null,
        color: dto.color ?? null,
        icon: dto.icon ?? null,
        isActive: (patch.isActive as boolean | undefined) ?? dto.isActive ?? true,
        ...prismaRuleColumns(patch, { layer: 'category' }),
      },
      include: { _count: { select: { vehicles: true } } },
    });
    return formatRentalVehicleCategory(row);
  }

  async updateCategory(
    orgId: string,
    categoryId: string,
    dto: UpdateRentalVehicleCategoryDto,
    ctx: RentalRulesMutationContext = {},
  ) {
    const existing = await this.loadCategory(orgId, categoryId);
    const patch = this.toPrismaRuleData(pickRulePatch(dto), 'category');
    await this.rentalRulePermissions.assertPublishIfActiveChange(
      ctx.actor,
      orgId,
      patch.isActive as boolean | undefined,
    );
    this.normalizeDepositCurrency(patch as { depositCurrency?: string | null });

    const data: Prisma.RentalVehicleCategoryUpdateManyMutationInput = {
      version: { increment: 1 },
      ...prismaRuleColumns(patch, { layer: 'category' }),
    };
    if (dto.name !== undefined) {
      const trimmedName = dto.name.trim();
      data.name = trimmedName;
      data.nameNormalized = normalizeRentalCategoryName(trimmedName);
    }
    if (dto.description !== undefined) data.description = dto.description?.trim() || null;
    if (dto.type !== undefined) data.type = dto.type ?? null;
    if (dto.color !== undefined) data.color = dto.color ?? null;
    if (dto.icon !== undefined) data.icon = dto.icon ?? null;
    if (patch.isActive !== undefined) data.isActive = patch.isActive as boolean;

    const { count } = await this.prisma.rentalVehicleCategory.updateMany({
      where: { id: categoryId, organizationId: orgId, version: dto.expectedVersion },
      data,
    });
    if (count === 0) {
      const current = await this.prisma.rentalVehicleCategory.findFirst({
        where: { id: categoryId, organizationId: orgId },
        include: { _count: { select: { vehicles: true } } },
      });
      throwRentalRulesVersionConflict({
        entityType: 'category',
        expectedVersion: dto.expectedVersion,
        currentVersion: current?.version ?? RENTAL_RULES_INITIAL_EXPECTED_VERSION,
        current: current ? formatRentalVehicleCategory(current) : null,
      });
    }

    const row = await this.prisma.rentalVehicleCategory.findUniqueOrThrow({
      where: { id: categoryId },
      include: { _count: { select: { vehicles: true } } },
    });
    return formatRentalVehicleCategory(row);
  }

  async disableCategory(orgId: string, categoryId: string, expectedVersion: number) {
    const existing = await this.loadCategory(orgId, categoryId);
    const { count } = await this.prisma.rentalVehicleCategory.updateMany({
      where: { id: categoryId, organizationId: orgId, version: expectedVersion },
      data: { isActive: false, version: { increment: 1 } },
    });
    if (count === 0) {
      const current = await this.prisma.rentalVehicleCategory.findFirst({
        where: { id: categoryId, organizationId: orgId },
        include: { _count: { select: { vehicles: true } } },
      });
      throwRentalRulesVersionConflict({
        entityType: 'category',
        expectedVersion,
        currentVersion: current?.version ?? existing.version,
        current: current ? formatRentalVehicleCategory(current) : formatRentalVehicleCategory(existing),
      });
    }
    const row = await this.prisma.rentalVehicleCategory.findUniqueOrThrow({
      where: { id: categoryId },
      include: { _count: { select: { vehicles: true } } },
    });
    return formatRentalVehicleCategory(row);
  }

  async listCategoryVehicles(orgId: string, categoryId: string) {
    await this.loadCategory(orgId, categoryId);
    const vehicles = await this.prisma.vehicle.findMany({
      where: { organizationId: orgId, rentalCategoryId: categoryId },
      select: {
        id: true,
        vehicleName: true,
        make: true,
        model: true,
        licensePlate: true,
        status: true,
      },
      orderBy: [{ licensePlate: 'asc' }, { make: 'asc' }],
    });
    return vehicles.map((v) => ({
      id: v.id,
      displayName: vehicleDisplayName(v),
      licensePlate: v.licensePlate,
      status: v.status,
    }));
  }

  async assignCategoryVehicles(
    orgId: string,
    categoryId: string,
    dto: AssignCategoryVehiclesDto,
    ctx: RentalRulesMutationContext = {},
  ) {
    const category = await this.loadCategory(orgId, categoryId);
    const { plan, diff } = await this.buildCategoryAssignmentContext(orgId, categoryId, dto);

    if (!plan.hasMutations) {
      return this.formatCategoryAssignmentResult(orgId, categoryId, category.version, diff);
    }

    const newVersion = await this.applyCategoryAssignmentPlan({
      orgId,
      categoryId,
      categoryName: category.name,
      expectedVersion: dto.expectedVersion,
      plan,
    });

    await this.logCategoryAssignment({
      organizationId: orgId,
      categoryId,
      categoryName: category.name,
      actor: ctx.actor,
      expectedVersion: dto.expectedVersion,
      newVersion,
      diff,
    });

    return this.formatCategoryAssignmentResult(orgId, categoryId, newVersion, diff);
  }

  async previewCategoryVehicleAssignment(
    orgId: string,
    categoryId: string,
    dto: PreviewCategoryVehicleAssignmentDto,
  ) {
    const category = await this.loadCategory(orgId, categoryId);
    const { plan, diff } = await this.buildCategoryAssignmentContext(orgId, categoryId, dto);
    return {
      categoryId,
      categoryName: category.name,
      version: category.version,
      diff,
      hasMutations: plan.hasMutations,
    };
  }

  private async buildCategoryAssignmentContext(
    orgId: string,
    categoryId: string,
    dto: AssignCategoryVehiclesDto | PreviewCategoryVehicleAssignmentDto,
  ): Promise<{ plan: CategoryAssignmentApplyPlan; diff: CategoryAssignmentDiff }> {
    const delta = normalizeCategoryAssignmentDelta({
      vehiclesToAdd: dto.vehiclesToAdd,
      vehiclesToRemove: dto.vehiclesToRemove,
      vehiclesToMove: dto.vehiclesToMove,
    });

    const emptyPlan: CategoryAssignmentApplyPlan = {
      added: [],
      removed: [],
      moved: [],
      alreadyAssigned: [],
      invalidVehicleIds: [],
      rejected: [],
      sourceCategoryIdsToBumpVersion: [],
      hasMutations: false,
    };

    if (totalDeltaVehicleCount(delta) === 0) {
      return { plan: emptyPlan, diff: emptyPlan };
    }

    const referencedIds = [
      ...new Set([
        ...delta.vehiclesToAdd,
        ...delta.vehiclesToRemove,
        ...delta.vehiclesToMove.map((move) => move.vehicleId),
      ]),
    ];

    const vehicles = await this.prisma.vehicle.findMany({
      where: { organizationId: orgId, id: { in: referencedIds } },
      select: {
        id: true,
        rentalCategoryId: true,
        vehicleName: true,
        make: true,
        model: true,
        licensePlate: true,
      },
    });

    const categoryIds = new Set<string>([
      categoryId,
      ...delta.vehiclesToMove.map((move) => move.fromCategoryId),
      ...vehicles
        .map((vehicle) => vehicle.rentalCategoryId)
        .filter((id): id is string => Boolean(id)),
    ]);

    const categories = await this.prisma.rentalVehicleCategory.findMany({
      where: { organizationId: orgId, id: { in: [...categoryIds] } },
      select: { id: true, name: true },
    });
    const categoryNamesById = new Map(categories.map((row) => [row.id, row.name]));

    for (const move of delta.vehiclesToMove) {
      if (!categoryNamesById.has(move.fromCategoryId)) {
        throw new BadRequestException({
          message: 'Source category does not belong to this organization',
          code: 'RENTAL_RULES_ASSIGNMENT_INVALID_SOURCE_CATEGORY',
          fromCategoryId: move.fromCategoryId,
        });
      }
    }

    const plan = buildCategoryAssignmentPlan({
      targetCategoryId: categoryId,
      delta,
      vehicles,
      categoryNamesById,
    });
    assertCategoryAssignmentDeltaIsActionable(plan);

    const diff: CategoryAssignmentDiff = {
      added: plan.added,
      removed: plan.removed,
      moved: plan.moved,
      alreadyAssigned: plan.alreadyAssigned,
      invalidVehicleIds: plan.invalidVehicleIds,
      rejected: plan.rejected,
    };

    return { plan, diff };
  }

  private async applyCategoryAssignmentPlan(input: {
    orgId: string;
    categoryId: string;
    categoryName: string;
    expectedVersion: number;
    plan: CategoryAssignmentApplyPlan;
  }): Promise<number> {
    const { orgId, categoryId, expectedVersion, plan } = input;

    return this.prisma.$transaction(async (tx) => {
      if (plan.removed.length > 0) {
        const ids = plan.removed.map((row) => row.vehicleId);
        const { count } = await tx.vehicle.updateMany({
          where: { organizationId: orgId, rentalCategoryId: categoryId, id: { in: ids } },
          data: { rentalCategoryId: null },
        });
        if (count !== ids.length) {
          throwRentalRulesAssignmentStale({
            categoryId,
            reason: 'One or more vehicles were removed from this category before save completed',
          });
        }
      }

      for (const move of plan.moved) {
        const { count } = await tx.vehicle.updateMany({
          where: {
            organizationId: orgId,
            id: move.vehicleId,
            rentalCategoryId: move.fromCategoryId,
          },
          data: { rentalCategoryId: categoryId },
        });
        if (count !== 1) {
          throwRentalRulesAssignmentStale({
            categoryId,
            reason: `Vehicle ${move.vehicleId} is no longer in source category ${move.fromCategoryId}`,
          });
        }
      }

      if (plan.added.length > 0) {
        const ids = plan.added.map((row) => row.vehicleId);
        const { count } = await tx.vehicle.updateMany({
          where: {
            organizationId: orgId,
            id: { in: ids },
            rentalCategoryId: null,
          },
          data: { rentalCategoryId: categoryId },
        });
        if (count !== ids.length) {
          throwRentalRulesAssignmentStale({
            categoryId,
            reason: 'One or more vehicles were assigned elsewhere before save completed',
          });
        }
      }

      const { count: targetBump } = await tx.rentalVehicleCategory.updateMany({
        where: { id: categoryId, organizationId: orgId, version: expectedVersion },
        data: { version: { increment: 1 } },
      });
      if (targetBump === 0) {
        const current = await tx.rentalVehicleCategory.findFirst({
          where: { id: categoryId, organizationId: orgId },
          include: { _count: { select: { vehicles: true } } },
        });
        throwRentalRulesVersionConflict({
          entityType: 'category',
          expectedVersion,
          currentVersion: current?.version ?? RENTAL_RULES_INITIAL_EXPECTED_VERSION,
          current: current ? formatRentalVehicleCategory(current) : null,
        });
      }

      for (const sourceCategoryId of plan.sourceCategoryIdsToBumpVersion) {
        await tx.rentalVehicleCategory.updateMany({
          where: { id: sourceCategoryId, organizationId: orgId },
          data: { version: { increment: 1 } },
        });
      }

      const updated = await tx.rentalVehicleCategory.findUniqueOrThrow({
        where: { id: categoryId },
        select: { version: true },
      });
      return updated.version;
    });
  }

  private async formatCategoryAssignmentResult(
    orgId: string,
    categoryId: string,
    version: number,
    diff: CategoryAssignmentDiff,
  ) {
    const vehicles = await this.listCategoryVehicles(orgId, categoryId);
    return {
      categoryId,
      version,
      vehicles,
      diff,
    };
  }

  private async logCategoryAssignment(input: {
    organizationId: string;
    categoryId: string;
    categoryName: string;
    actor?: PermissionActor;
    expectedVersion: number;
    newVersion: number;
    diff: CategoryAssignmentDiff;
  }) {
    const addedCount = input.diff.added.length;
    const removedCount = input.diff.removed.length;
    const movedCount = input.diff.moved.length;
    const alreadyCount = input.diff.alreadyAssigned.length;

    await this.activityLog.log({
      organizationId: input.organizationId,
      userId: input.actor?.id,
      action: ActivityAction.UPDATE,
      entity: ActivityEntity.ORGANIZATION,
      entityId: input.organizationId,
      description: `Rental category "${input.categoryName}" vehicle assignment updated (+${addedCount} / -${removedCount} / ↔${movedCount})`,
      metaJson: {
        categoryId: input.categoryId,
        categoryName: input.categoryName,
        expectedVersion: input.expectedVersion,
        newVersion: input.newVersion,
        diff: input.diff,
        counts: {
          added: addedCount,
          removed: removedCount,
          moved: movedCount,
          alreadyAssigned: alreadyCount,
        },
        actorUserId: input.actor?.id ?? null,
      },
    });
  }

  async getVehicleRequirements(orgId: string, vehicleId: string) {
    const vehicle = await this.loadVehicle(orgId, vehicleId);
    const override = await this.prisma.vehicleRentalRequirementOverride.findUnique({
      where: { vehicleId },
    });
    const category = vehicle.rentalCategoryId
      ? await this.prisma.rentalVehicleCategory.findFirst({
          where: { id: vehicle.rentalCategoryId, organizationId: orgId },
        })
      : null;

    return {
      vehicleId,
      organizationId: orgId,
      rentalCategoryId: vehicle.rentalCategoryId,
      rentalCategory: category
        ? { id: category.id, name: category.name, type: category.type, isActive: category.isActive }
        : null,
      overrides: override ? formatVehicleRentalOverride(override) : null,
    };
  }

  private async pruneEmptyVehicleOverride(vehicleId: string) {
    const row = await this.prisma.vehicleRentalRequirementOverride.findUnique({
      where: { vehicleId },
    });
    if (!row) return null;
    if (!hasActiveRuleOverrides(extractRuleFields(row))) {
      await this.prisma.vehicleRentalRequirementOverride.delete({
        where: { vehicleId },
      });
      return null;
    }
    return row;
  }

  private async logVehicleOverrideReset(input: {
    organizationId: string;
    vehicleId: string;
    actor?: PermissionActor;
    removedFields: RentalRuleFieldKey[];
    result: 'deleted' | 'updated' | 'no_op';
    overrideId?: string | null;
  }) {
    const fieldSummary =
      input.removedFields.length > 0 ? input.removedFields.join(', ') : 'none';
    await this.activityLog.log({
      organizationId: input.organizationId,
      userId: input.actor?.id,
      action: input.result === 'deleted' ? ActivityAction.DELETE : ActivityAction.RESET,
      entity: ActivityEntity.VEHICLE,
      entityId: input.vehicleId,
      description: `Vehicle rental requirement override reset (${input.result}): ${fieldSummary}`,
      metaJson: {
        vehicleId: input.vehicleId,
        removedFields: input.removedFields,
        result: input.result,
        overrideId: input.overrideId ?? null,
        actorUserId: input.actor?.id ?? null,
      },
    });
  }

  private formatOverrideResetPreview(
    fieldsToReset: RentalRuleFieldKey[],
    currentEffective: Awaited<ReturnType<RentalEffectiveRulesService['formatEffectiveRules']>>,
    futureEffective: Awaited<ReturnType<RentalEffectiveRulesService['formatEffectiveRules']>>,
  ) {
    return fieldsToReset.map((field) => ({
      field,
      current: currentEffective[field],
      afterReset: futureEffective[field],
    }));
  }

  async previewVehicleOverrideReset(
    orgId: string,
    vehicleId: string,
    dto: ResetVehicleRentalOverridesDto = {},
  ) {
    await this.loadVehicle(orgId, vehicleId);
    const override = await this.prisma.vehicleRentalRequirementOverride.findUnique({
      where: { vehicleId },
    });
    const currentOverrideFields = override ? extractRuleFields(override) : {};
    const fieldsToReset = resolveOverrideResetFields(dto.fields, currentOverrideFields);
    const currentEffective = this.effectiveRules.formatEffectiveRules(
      await this.effectiveRules.computeForVehicle(orgId, vehicleId),
    );

    if (fieldsToReset.length === 0) {
      return {
        vehicleId,
        organizationId: orgId,
        requestedFields: dto.fields ?? [],
        resetFields: [] as RentalRuleFieldKey[],
        alreadyAbsent: !override,
        fields: [] as ReturnType<RentalRulesService['formatOverrideResetPreview']>,
        effectiveRules: currentEffective,
      };
    }

    const simulatedOverrideFields = mergeOverrideFieldsAfterReset(
      currentOverrideFields,
      fieldsToReset,
    );
    const futureEffective = this.effectiveRules.formatEffectiveRules(
      await this.effectiveRules.computeWithSimulatedOverrideFields(
        orgId,
        vehicleId,
        hasActiveRuleOverrides(simulatedOverrideFields) ? simulatedOverrideFields : null,
      ),
    );

    return {
      vehicleId,
      organizationId: orgId,
      requestedFields: dto.fields ?? [],
      resetFields: fieldsToReset,
      alreadyAbsent: false,
      fields: this.formatOverrideResetPreview(fieldsToReset, currentEffective, futureEffective),
      effectiveRules: currentEffective,
    };
  }

  async resetVehicleOverrides(
    orgId: string,
    vehicleId: string,
    dto: ResetVehicleRentalOverridesDto,
    ctx: RentalRulesMutationContext = {},
  ) {
    await this.loadVehicle(orgId, vehicleId);
    const existing = await this.prisma.vehicleRentalRequirementOverride.findUnique({
      where: { vehicleId },
    });
    const currentOverrideFields = existing ? extractRuleFields(existing) : {};
    const fieldsToReset = resolveOverrideResetFields(dto.fields, currentOverrideFields);

    if (!existing || fieldsToReset.length === 0) {
      await this.logVehicleOverrideReset({
        organizationId: orgId,
        vehicleId,
        actor: ctx.actor,
        removedFields: [],
        result: 'no_op',
        overrideId: existing?.id ?? null,
      });
      return {
        vehicleId,
        organizationId: orgId,
        removedFields: [] as RentalRuleFieldKey[],
        result: 'no_op' as const,
        overrides: existing ? formatVehicleRentalOverride(existing) : null,
        effectiveRules: this.effectiveRules.formatEffectiveRules(
          await this.effectiveRules.computeForVehicle(orgId, vehicleId),
        ),
      };
    }

    if (dto.expectedVersion == null) {
      throw new BadRequestException('expectedVersion is required');
    }

    if (dto.expectedVersion !== existing.version) {
      throwRentalRulesVersionConflict({
        entityType: 'vehicle_override',
        expectedVersion: dto.expectedVersion,
        currentVersion: existing.version,
        current: formatVehicleRentalOverride(existing),
      });
    }

    const resetPatch = buildOverrideResetPatch(fieldsToReset);
    const { count } = await this.prisma.vehicleRentalRequirementOverride.updateMany({
      where: { vehicleId, version: dto.expectedVersion },
      data: {
        ...prismaRuleColumns(resetPatch, { layer: 'vehicleOverride' }),
        version: { increment: 1 },
      },
    });
    if (count === 0) {
      const current = await this.prisma.vehicleRentalRequirementOverride.findUnique({
        where: { vehicleId },
      });
      throwRentalRulesVersionConflict({
        entityType: 'vehicle_override',
        expectedVersion: dto.expectedVersion,
        currentVersion: current?.version ?? RENTAL_RULES_INITIAL_EXPECTED_VERSION,
        current: current ? formatVehicleRentalOverride(current) : null,
      });
    }
    const updated = await this.prisma.vehicleRentalRequirementOverride.findUniqueOrThrow({
      where: { vehicleId },
    });
    const pruned = await this.pruneEmptyVehicleOverride(vehicleId);
    const result = pruned ? ('updated' as const) : ('deleted' as const);

    await this.logVehicleOverrideReset({
      organizationId: orgId,
      vehicleId,
      actor: ctx.actor,
      removedFields: fieldsToReset,
      result,
      overrideId: existing.id,
    });

    return {
      vehicleId,
      organizationId: orgId,
      removedFields: fieldsToReset,
      result,
      overrides: pruned ? formatVehicleRentalOverride(pruned) : null,
      effectiveRules: this.effectiveRules.formatEffectiveRules(
        await this.effectiveRules.computeForVehicle(orgId, vehicleId),
      ),
    };
  }

  async deleteVehicleOverrides(
    orgId: string,
    vehicleId: string,
    expectedVersion: number,
    ctx: RentalRulesMutationContext = {},
  ) {
    await this.loadVehicle(orgId, vehicleId);
    const existing = await this.prisma.vehicleRentalRequirementOverride.findUnique({
      where: { vehicleId },
    });

    if (!existing) {
      await this.logVehicleOverrideReset({
        organizationId: orgId,
        vehicleId,
        actor: ctx.actor,
        removedFields: [],
        result: 'no_op',
      });
      return {
        vehicleId,
        organizationId: orgId,
        removedFields: [] as RentalRuleFieldKey[],
        result: 'no_op' as const,
        overrides: null,
        effectiveRules: this.effectiveRules.formatEffectiveRules(
          await this.effectiveRules.computeForVehicle(orgId, vehicleId),
        ),
      };
    }

    if (expectedVersion !== existing.version) {
      throwRentalRulesVersionConflict({
        entityType: 'vehicle_override',
        expectedVersion,
        currentVersion: existing.version,
        current: formatVehicleRentalOverride(existing),
      });
    }

    const { count } = await this.prisma.vehicleRentalRequirementOverride.deleteMany({
      where: { vehicleId, version: expectedVersion },
    });
    if (count === 0) {
      const current = await this.prisma.vehicleRentalRequirementOverride.findUnique({
        where: { vehicleId },
      });
      throwRentalRulesVersionConflict({
        entityType: 'vehicle_override',
        expectedVersion,
        currentVersion: current?.version ?? RENTAL_RULES_INITIAL_EXPECTED_VERSION,
        current: current ? formatVehicleRentalOverride(current) : null,
      });
    }

    const removedFields = RENTAL_RULE_FIELD_KEYS.filter(
      (key) => extractRuleFields(existing)[key] != null,
    );

    await this.logVehicleOverrideReset({
      organizationId: orgId,
      vehicleId,
      actor: ctx.actor,
      removedFields,
      result: 'deleted',
      overrideId: existing.id,
    });

    return {
      vehicleId,
      organizationId: orgId,
      removedFields,
      result: 'deleted' as const,
      overrides: null,
      effectiveRules: this.effectiveRules.formatEffectiveRules(
        await this.effectiveRules.computeForVehicle(orgId, vehicleId),
      ),
    };
  }

  async upsertVehicleOverrides(
    orgId: string,
    vehicleId: string,
    dto: UpsertVehicleRentalOverridesDto,
    ctx: RentalRulesMutationContext = {},
  ) {
    await this.loadVehicle(orgId, vehicleId);
    const patch = this.toPrismaRuleData(pickRulePatch(dto), 'vehicleOverride');
    this.normalizeDepositCurrency(patch as { depositCurrency?: string | null });

    const patchFields = pickRulePatch(dto);
    const existing = await this.prisma.vehicleRentalRequirementOverride.findUnique({
      where: { vehicleId },
    });

    if (!existing) {
      if (dto.expectedVersion !== RENTAL_RULES_INITIAL_EXPECTED_VERSION) {
        throwRentalRulesVersionConflict({
          entityType: 'vehicle_override',
          expectedVersion: dto.expectedVersion,
          currentVersion: RENTAL_RULES_INITIAL_EXPECTED_VERSION,
          current: null,
        });
      }
      await this.prisma.vehicleRentalRequirementOverride.create({
        data: {
          organizationId: orgId,
          vehicleId,
          ...prismaRuleColumns(patch, { layer: 'vehicleOverride' }),
        },
      });
    } else {
      const { count } = await this.prisma.vehicleRentalRequirementOverride.updateMany({
        where: { vehicleId, version: dto.expectedVersion },
        data: {
          ...prismaRuleColumns(patch, { layer: 'vehicleOverride' }),
          version: { increment: 1 },
        },
      });
      if (count === 0) {
        const current = await this.prisma.vehicleRentalRequirementOverride.findUnique({
          where: { vehicleId },
        });
        throwRentalRulesVersionConflict({
          entityType: 'vehicle_override',
          expectedVersion: dto.expectedVersion,
          currentVersion: current?.version ?? RENTAL_RULES_INITIAL_EXPECTED_VERSION,
          current: current ? formatVehicleRentalOverride(current) : null,
        });
      }
    }

    const row = await this.pruneEmptyVehicleOverride(vehicleId);
    if (!row) {
      await this.logVehicleOverrideReset({
        organizationId: orgId,
        vehicleId,
        actor: ctx.actor,
        removedFields: RENTAL_RULE_FIELD_KEYS.filter((key) => patchFields[key] === null),
        result: 'deleted',
      });
      return null;
    }
    return formatVehicleRentalOverride(row);
  }

  async getVehicleEffectiveRules(orgId: string, vehicleId: string) {
    const rules = await this.effectiveRules.computeForVehicle(orgId, vehicleId);
    return this.effectiveRules.formatEffectiveRules(rules);
  }

  async getOverview(orgId: string) {
    await this.assertOrgExists(orgId);
    const [
      defaults,
      activeCategoryCount,
      totalVehicles,
      vehiclesWithCategory,
      overrides,
      categoriesRequiringManualApproval,
    ] = await Promise.all([
      this.prisma.organizationRentalRules.findUnique({
        where: { organizationId: orgId },
      }),
      this.prisma.rentalVehicleCategory.count({
        where: { organizationId: orgId, isActive: true },
      }),
      this.prisma.vehicle.count({ where: { organizationId: orgId } }),
      this.prisma.vehicle.count({
        where: { organizationId: orgId, rentalCategoryId: { not: null } },
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
              status: true,
              rentalCategoryId: true,
              rentalCategory: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.rentalVehicleCategory.count({
        where: {
          organizationId: orgId,
          isActive: true,
          manualApprovalRequired: true,
        },
      }),
    ]);

    const overrideVehicles = overrides
      .map((row) => {
      const fields = extractRuleFields(row);
      const activeKeys = RENTAL_RULE_FIELD_KEYS.filter((key) => fields[key] != null);
      const topKey = activeKeys[0] ?? null;
      return {
        vehicleId: row.vehicleId,
        displayName: vehicleDisplayName(row.vehicle),
        licensePlate: row.vehicle.licensePlate,
        status: row.vehicle.status,
        categoryId: row.vehicle.rentalCategoryId,
        categoryName: row.vehicle.rentalCategory?.name ?? null,
        overrideCount: activeKeys.length,
        topOverrideField: topKey,
        topOverrideValue: topKey ? fields[topKey] : null,
      };
    })
      .filter((row) => row.overrideCount > 0);

    return {
      defaultsConfigured: Boolean(defaults),
      defaultsActive: defaults?.isActive ?? true,
      activeCategoryCount,
      totalVehicles,
      vehiclesWithCategory,
      vehiclesMissingCategory: Math.max(0, totalVehicles - vehiclesWithCategory),
      vehiclesWithOverrides: overrideVehicles.length,
      categoriesRequiringManualApproval,
      overrideVehicles,
    };
  }

  async listFleetVehicles(orgId: string) {
    await this.assertOrgExists(orgId);
    const vehicles = await this.prisma.vehicle.findMany({
      where: { organizationId: orgId },
      select: {
        id: true,
        vehicleName: true,
        make: true,
        model: true,
        licensePlate: true,
        status: true,
        rentalCategoryId: true,
        rentalCategory: { select: { id: true, name: true } },
        rentalRequirementOverride: {
          select: {
            id: true,
            minimumAgeYears: true,
            minimumLicenseHoldingMonths: true,
            depositAmountCents: true,
            depositCurrency: true,
            creditCardRequired: true,
            foreignTravelPolicy: true,
            additionalDriverPolicy: true,
            youngDriverPolicy: true,
            insuranceRequirement: true,
            manualApprovalRequired: true,
            notes: true,
          },
        },
      },
      orderBy: [{ licensePlate: 'asc' }, { make: 'asc' }],
    });

    return vehicles.map((v) => ({
      id: v.id,
      displayName: vehicleDisplayName(v),
      licensePlate: v.licensePlate,
      status: v.status,
      rentalCategoryId: v.rentalCategoryId,
      rentalCategoryName: v.rentalCategory?.name ?? null,
      hasOverride: v.rentalRequirementOverride
        ? hasActiveRuleOverrides(extractRuleFields(v.rentalRequirementOverride))
        : false,
    }));
  }
}
