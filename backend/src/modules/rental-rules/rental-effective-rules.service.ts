import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { buildEffectiveRentalRules } from './rental-effective-rules.util';
import {
  buildRentalRulesActivationSnapshot,
  resolveInactiveCategoryDisplayName,
} from './rental-rules-activation.policy';
import { isCategoryRulesEnforced } from './rental-rules-category-lifecycle.util';
import {
  extractRuleFields,
  hasActiveRuleOverrides,
  vehicleDisplayName,
} from './rental-rules.mapper';
import {
  findPublishedRevision,
  revisionOrgIsActive,
  revisionToCategoryRulesShape,
  revisionToOverrideFields,
  revisionToOrgRulesShape,
} from './rental-rules-revision-resolver.util';
import { splitLicenseHoldingMonths } from './license-holding.util';
import type {
  EffectiveRentalRequirement,
  EffectiveRentalRules,
  RentalRuleFieldSet,
} from './rental-rules.types';
import type { NormalizedRentalRulesDocument } from './rental-rules-revision.types';
import type { RentalRuleRevisionScope } from './rental-rules-revision-scope.util';

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

    const [orgRevision, categoryRevision, vehicleRevision, orgRulesLive] = await Promise.all([
      findPublishedRevision(this.prisma, {
        organizationId: orgId,
        scopeType: 'ORGANIZATION',
        scopeId: orgId,
      }),
      vehicle.rentalCategoryId
        ? findPublishedRevision(this.prisma, {
            organizationId: orgId,
            scopeType: 'CATEGORY',
            scopeId: vehicle.rentalCategoryId,
          })
        : Promise.resolve(null),
      findPublishedRevision(this.prisma, {
        organizationId: orgId,
        scopeType: 'VEHICLE',
        scopeId: vehicleId,
      }),
      this.prisma.organizationRentalRules.findUnique({
        where: { organizationId: orgId },
      }),
    ]);

    const orgRulesFromRevision = revisionToOrgRulesShape(
      orgRevision,
      orgRulesLive ? { isActive: orgRulesLive.isActive } : null,
    );
    const orgRules =
      orgRevision || orgRulesLive
        ? {
            ...(orgRulesLive ?? {
              organizationId: orgId,
              isActive: orgRulesFromRevision?.isActive ?? true,
            }),
            ...(orgRulesFromRevision ?? {}),
            isActive:
              revisionOrgIsActive(orgRevision) ??
              orgRulesLive?.isActive ??
              orgRulesFromRevision?.isActive ??
              true,
          }
        : null;

    const categoryRuleFields = revisionToCategoryRulesShape(categoryRevision);
    const overrideFieldsFromRevision = revisionToOverrideFields(vehicleRevision);
    const overrideFields =
      overrideFieldsFromRevision ??
      (vehicle.rentalRequirementOverride
        ? extractRuleFields(vehicle.rentalRequirementOverride)
        : null);

    return {
      orgId,
      vehicle,
      orgRules,
      orgName: vehicle.organization.companyName || 'Organization',
      vehicleName: vehicleDisplayName(vehicle),
      category: vehicle.rentalCategory,
      categoryRuleFields,
      overrideFields,
    };
  }

  private buildEffectiveFromContext(
    context: Awaited<ReturnType<RentalEffectiveRulesService['loadVehicleRulesContext']>>,
    overrideFields: Partial<RentalRuleFieldSet> | null,
  ): EffectiveRentalRules {
    const { orgId, vehicle, orgRules, orgName, vehicleName, category, categoryRuleFields } =
      context;
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
        category && isCategoryRulesEnforced(category.status)
          ? {
              source: 'CATEGORY',
              sourceName: category.name,
              values: categoryRuleFields ?? extractRuleFields(category),
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
    return this.buildEffectiveFromContext(context, context.overrideFields);
  }

  async computeWithSimulatedOverrideFields(
    orgId: string,
    vehicleId: string,
    overrideFields: Partial<RentalRuleFieldSet> | null,
  ): Promise<EffectiveRentalRules> {
    const context = await this.loadVehicleRulesContext(orgId, vehicleId);
    return this.buildEffectiveFromContext(context, overrideFields);
  }

  async computeWithSimulatedDraftScope(
    orgId: string,
    vehicleId: string,
    draftScope: RentalRuleRevisionScope,
    draftDocument: NormalizedRentalRulesDocument,
  ): Promise<EffectiveRentalRules> {
    const context = await this.loadVehicleRulesContext(orgId, vehicleId);
    const draftRules = extractRuleFields(
      draftDocument.rules as Parameters<typeof extractRuleFields>[0],
    );

    let orgRules = context.orgRules;
    let categoryRuleFields = context.categoryRuleFields;
    let overrideFields = context.overrideFields;
    let category = context.category;

    switch (draftScope.scopeType) {
      case 'ORGANIZATION':
        orgRules = {
          ...(orgRules ?? { organizationId: orgId }),
          ...draftRules,
          isActive:
            typeof draftDocument.scopeMeta.isActive === 'boolean'
              ? draftDocument.scopeMeta.isActive
              : (orgRules?.isActive ?? true),
        };
        break;
      case 'CATEGORY':
        if (context.category?.id === draftScope.scopeId) {
          categoryRuleFields = draftRules;
          if (typeof draftDocument.scopeMeta.name === 'string') {
            category = { ...context.category, name: draftDocument.scopeMeta.name };
          }
        }
        break;
      case 'VEHICLE':
        if (vehicleId === draftScope.scopeId) {
          overrideFields = hasActiveRuleOverrides(draftRules) ? draftRules : null;
        }
        break;
      default:
        break;
    }

    const simulatedContext = {
      ...context,
      orgRules,
      category,
      categoryRuleFields,
      overrideFields,
    };
    return this.buildEffectiveFromContext(simulatedContext, overrideFields);
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
