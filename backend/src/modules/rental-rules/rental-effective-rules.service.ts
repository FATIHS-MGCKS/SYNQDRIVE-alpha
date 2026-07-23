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
import type { EffectiveRentalRequirement, EffectiveRentalRules } from './rental-rules.types';

@Injectable()
export class RentalEffectiveRulesService {
  constructor(private readonly prisma: PrismaService) {}

  async computeForVehicle(orgId: string, vehicleId: string): Promise<EffectiveRentalRules> {
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

    const orgName = vehicle.organization.companyName || 'Organization';
    const vehicleName = vehicleDisplayName(vehicle);
    const category = vehicle.rentalCategory;
    const override = vehicle.rentalRequirementOverride;
    const overrideFields = override ? extractRuleFields(override) : null;
    const activation = buildRentalRulesActivationSnapshot({
      orgRules,
      category,
      overrideFields,
    });

    return buildEffectiveRentalRules({
      organizationId: orgId,
      vehicleId,
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
        override && overrideFields && hasActiveRuleOverrides(overrideFields)
          ? {
              source: 'VEHICLE_OVERRIDE',
              sourceName: vehicleName,
              values: overrideFields,
            }
          : null,
    });
  }

  formatEffectiveRules(rules: EffectiveRentalRules): EffectiveRentalRequirement {
    const { depositAmountCents, minimumLicenseHoldingMonths, ...rest } = rules;
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
        value:
          minimumLicenseHoldingMonths.value != null
            ? Math.round(minimumLicenseHoldingMonths.value / 12)
            : null,
        source: minimumLicenseHoldingMonths.source,
        sourceName: minimumLicenseHoldingMonths.sourceName,
      },
    };
  }
}
