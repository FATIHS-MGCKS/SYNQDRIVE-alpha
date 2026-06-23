import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { RentalEffectiveRulesService } from './rental-effective-rules.service';
import {
  AssignCategoryVehiclesDto,
  CreateRentalVehicleCategoryDto,
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
  vehicleDisplayName,
  extractRuleFields,
  hasActiveRuleOverrides,
} from './rental-rules.mapper';
import { RENTAL_RULE_FIELD_KEYS } from './rental-rules.types';

@Injectable()
export class RentalRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly effectiveRules: RentalEffectiveRulesService,
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
        configured: false,
      };
    }
    return { ...formatOrganizationRentalRules(row), configured: true };
  }

  private toPrismaRuleData(patch: ReturnType<typeof pickRulePatch>) {
    const allowed = new Set([
      'minimumAgeYears',
      'minimumLicenseHoldingMonths',
      'depositAmountCents',
      'depositCurrency',
      'creditCardRequired',
      'foreignTravelPolicy',
      'additionalDriverPolicy',
      'youngDriverPolicy',
      'insuranceRequirement',
      'manualApprovalRequired',
      'notes',
      'isActive',
    ]);
    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch)) {
      if (!allowed.has(key) || value === undefined) continue;
      if (key === 'depositCurrency' && value === null) continue;
      data[key] = value;
    }
    return data;
  }

  async upsertOrganizationDefaults(orgId: string, dto: UpsertOrganizationRentalRulesDto) {
    await this.assertOrgExists(orgId);
    const patch = this.toPrismaRuleData(pickRulePatch(dto));
    this.normalizeDepositCurrency(patch as { depositCurrency?: string | null });

    const row = await this.prisma.organizationRentalRules.upsert({
      where: { organizationId: orgId },
      create: {
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
      update: {
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
      },
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

  async createCategory(orgId: string, dto: CreateRentalVehicleCategoryDto) {
    await this.assertOrgExists(orgId);
    const patch = this.toPrismaRuleData(pickRulePatch(dto));
    this.normalizeDepositCurrency(patch as { depositCurrency?: string | null });

    const row = await this.prisma.rentalVehicleCategory.create({
      data: {
        organizationId: orgId,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        type: dto.type ?? null,
        color: dto.color ?? null,
        icon: dto.icon ?? null,
        isActive: (patch.isActive as boolean | undefined) ?? dto.isActive ?? true,
        ...prismaRuleColumns(patch),
      },
      include: { _count: { select: { vehicles: true } } },
    });
    return formatRentalVehicleCategory(row);
  }

  async updateCategory(orgId: string, categoryId: string, dto: UpdateRentalVehicleCategoryDto) {
    await this.loadCategory(orgId, categoryId);
    const patch = this.toPrismaRuleData(pickRulePatch(dto));
    this.normalizeDepositCurrency(patch as { depositCurrency?: string | null });

    const data: Prisma.RentalVehicleCategoryUpdateInput = {
      ...prismaRuleColumns(patch),
    };
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.description !== undefined) data.description = dto.description?.trim() || null;
    if (dto.type !== undefined) data.type = dto.type ?? null;
    if (dto.color !== undefined) data.color = dto.color ?? null;
    if (dto.icon !== undefined) data.icon = dto.icon ?? null;
    if (patch.isActive !== undefined) data.isActive = patch.isActive as boolean;

    const row = await this.prisma.rentalVehicleCategory.update({
      where: { id: categoryId },
      data,
      include: { _count: { select: { vehicles: true } } },
    });
    return formatRentalVehicleCategory(row);
  }

  async disableCategory(orgId: string, categoryId: string) {
    await this.loadCategory(orgId, categoryId);
    const row = await this.prisma.rentalVehicleCategory.update({
      where: { id: categoryId },
      data: { isActive: false },
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

  async assignCategoryVehicles(orgId: string, categoryId: string, dto: AssignCategoryVehiclesDto) {
    await this.loadCategory(orgId, categoryId);
    const uniqueIds = [...new Set(dto.vehicleIds)];

    if (uniqueIds.length > 0) {
      const vehicles = await this.prisma.vehicle.findMany({
        where: { organizationId: orgId, id: { in: uniqueIds } },
        select: { id: true },
      });
      if (vehicles.length !== uniqueIds.length) {
        throw new BadRequestException('One or more vehicles do not belong to this organization');
      }
    }

    await this.prisma.$transaction([
      this.prisma.vehicle.updateMany({
        where: { organizationId: orgId, rentalCategoryId: categoryId, id: { notIn: uniqueIds } },
        data: { rentalCategoryId: null },
      }),
      ...(uniqueIds.length
        ? [
            this.prisma.vehicle.updateMany({
              where: { organizationId: orgId, id: { in: uniqueIds } },
              data: { rentalCategoryId: categoryId },
            }),
          ]
        : [
            this.prisma.vehicle.updateMany({
              where: { organizationId: orgId, rentalCategoryId: categoryId },
              data: { rentalCategoryId: null },
            }),
          ]),
    ]);

    return this.listCategoryVehicles(orgId, categoryId);
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

  async upsertVehicleOverrides(orgId: string, vehicleId: string, dto: UpsertVehicleRentalOverridesDto) {
    await this.loadVehicle(orgId, vehicleId);
    const patch = this.toPrismaRuleData(pickRulePatch(dto));
    this.normalizeDepositCurrency(patch as { depositCurrency?: string | null });

    const row = await this.prisma.vehicleRentalRequirementOverride.upsert({
      where: { vehicleId },
      create: {
        organizationId: orgId,
        vehicleId,
        ...prismaRuleColumns(patch),
      },
      update: prismaRuleColumns(patch),
    });
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
