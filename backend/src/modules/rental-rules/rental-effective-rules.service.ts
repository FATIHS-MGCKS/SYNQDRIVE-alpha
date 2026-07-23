import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { buildEffectiveRentalRules } from './rental-effective-rules.util';
import {
  buildRentalRulesActivationSnapshot,
  resolveInactiveCategoryDisplayName,
} from './rental-rules-activation.policy';
import {
  extractRuleFields,
  hasActiveRuleOverrides,
  vehicleDisplayName,
} from './rental-rules.mapper';
import { splitLicenseHoldingMonths } from './license-holding.util';
import type {
  EffectiveRentalRequirement,
  EffectiveRentalRules,
  RentalRuleFieldSet,
} from './rental-rules.types';

@Injectable()
export class RentalEffectiveRulesService {
  constructor(private readonly prisma: PrismaService) {}

  private async loadVehicleRulesContext(orgId: string, vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId: orgId },
      include: {
        rentalCategory: true,
        rentalRequirementOverride: true,
        organization: { select: { companyName: true } },
      },
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');

    const orgRules = await this.prisma.organizationRentalRules.findUnique({
      where: { organizationId: orgId },
    });

    return {
      orgId,
      vehicle,
      orgRules,
      orgName: vehicle.organization.companyName || 'Organization',
      vehicleName: vehicleDisplayName(vehicle),
      category: vehicle.rentalCategory,
      override: vehicle.rentalRequirementOverride,
    };
  }

  private buildEffectiveFromContext(
    context: Awaited<ReturnType<RentalEffectiveRulesService['loadVehicleRulesContext']>>,
    overrideFields: Partial<RentalRuleFieldSet> | null,
  ): EffectiveRentalRules {
    const { orgId, vehicle, orgRules, orgName, vehicleName, category } = context;
    const activation = buildRentalRulesActivationSnapshot({
      orgRules,
      category,
      overrideFields,
    });

    return buildEffectiveRentalRules({
      organizationId: orgId,
      vehicleId: vehicle.id,
      rentalCategoryId: category?.id ?? null,
      rentalCategoryName: resolveInactiveCategoryDisplayName(category),
      rentalCategoryType: category?.type ?? null,
      rulesActive: activation.organizationRulesActive,
      activation,
      orgLayer: {
        source: 'ORGANIZATION_DEFAULT',
        sourceName: orgName,
        values: orgRules ? extractRuleFields(orgRules) : {},
      },
      categoryLayer:
        category && category.isActive
          ? {
              source: 'CATEGORY',
              sourceName: category.name,
              values: extractRuleFields(category),
            }
          : null,
      vehicleLayer:
        overrideFields && hasActiveRuleOverrides(overrideFields)
          ? {
              source: 'VEHICLE_OVERRIDE',
              sourceName: vehicleName,
              values: overrideFields,
            }
          : null,
    });
  }

  async computeForVehicle(orgId: string, vehicleId: string): Promise<EffectiveRentalRules> {
    const context = await this.loadVehicleRulesContext(orgId, vehicleId);
    const overrideFields = context.override ? extractRuleFields(context.override) : null;
    return this.buildEffectiveFromContext(context, overrideFields);
  }

  async computeWithSimulatedOverrideFields(
    orgId: string,
    vehicleId: string,
    overrideFields: Partial<RentalRuleFieldSet> | null,
  ): Promise<EffectiveRentalRules> {
    const context = await this.loadVehicleRulesContext(orgId, vehicleId);
    return this.buildEffectiveFromContext(context, overrideFields);
  }

  formatEffectiveRules(rules: EffectiveRentalRules): EffectiveRentalRequirement {
    const { depositAmountCents, minimumLicenseHoldingMonths, ...rest } = rules;
    const months = minimumLicenseHoldingMonths.value;
    const split = months != null ? splitLicenseHoldingMonths(months) : null;
    return {
      ...rest,
      depositAmount: depositAmountCents,
      depositAmountCents,
      minimumLicenseHoldingMonths: {
        ...minimumLicenseHoldingMonths,
        value:
          minimumLicenseHoldingMonths.value != null
            ? minimumLicenseHoldingMonths.value
            : null,
      },
      minimumLicenseHoldingYears: {
        value: split?.wholeYears ?? null,
        source: minimumLicenseHoldingMonths.source,
        sourceName: minimumLicenseHoldingMonths.sourceName,
      },
      minimumLicenseHoldingRemainderMonths: {
        value: split?.extraMonths ?? null,
        source: minimumLicenseHoldingMonths.source,
        sourceName: minimumLicenseHoldingMonths.sourceName,
      },
    };
  }
}
