import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { RentalEffectiveRulesService } from '@modules/rental-rules/rental-effective-rules.service';
import { resolvePriceBookCurrency } from '@shared/money/money.util';
import type { ResolvedTariffContext } from '@modules/pricing/pricing-context.types';
import {
  extractDepositFloorFromEffectiveRules,
  resolveDeposit,
} from './deposit-resolver.util';
import type {
  DepositEntityIds,
  DepositManualOverrideInput,
  ResolvedDeposit,
} from './deposit-resolver.types';

@Injectable()
export class DepositResolverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rentalEffectiveRules: RentalEffectiveRulesService,
  ) {}

  async resolveDepositEntityIds(
    orgId: string,
    vehicleId: string,
  ): Promise<DepositEntityIds> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId: orgId },
      select: {
        rentalCategoryId: true,
        rentalRequirementOverride: { select: { id: true } },
      },
    });
    const orgRules = await this.prisma.organizationRentalRules.findUnique({
      where: { organizationId: orgId },
      select: { id: true },
    });

    return {
      organizationRulesId: orgRules?.id ?? null,
      categoryId: vehicle?.rentalCategoryId ?? null,
      vehicleOverrideId: vehicle?.rentalRequirementOverride?.id ?? null,
    };
  }

  async resolveForVehicleTariff(input: {
    organizationId: string;
    vehicleId: string;
    tariffContext: ResolvedTariffContext;
    manualOverride?: DepositManualOverrideInput | null;
  }): Promise<ResolvedDeposit> {
    const pricingCurrency = resolvePriceBookCurrency(input.tariffContext.priceBook);
    const [effectiveRules, entityIds] = await Promise.all([
      this.rentalEffectiveRules.computeForVehicle(input.organizationId, input.vehicleId),
      this.resolveDepositEntityIds(input.organizationId, input.vehicleId),
    ]);

    const rentalRulesFloor = extractDepositFloorFromEffectiveRules(
      effectiveRules,
      entityIds,
      pricingCurrency,
    );
    const tv = input.tariffContext.tariffVersion;

    return resolveDeposit({
      pricingCurrency,
      rentalRulesFloor,
      tariffDeposit: {
        amountCents: tv.rate.depositAmountCents,
        currency: pricingCurrency,
        tariffRateId: tv.rate.id,
        tariffVersionId: tv.id,
      },
      manualOverride: input.manualOverride ?? null,
    });
  }
}
