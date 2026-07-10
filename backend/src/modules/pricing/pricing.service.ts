import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  assertClientCurrencyMatches,
  resolvePriceBookCurrency,
  toBookingCurrencyStorage,
} from '@shared/money/money.util';
import { BookingPricingInputDto, SimulateBookingPriceDto } from './dto';
import {
  simulateBookingPrice,
  SimulatedLineItem,
} from './pricing-calculation.util';
import { PricingMigrationService } from './pricing-migration.service';

export interface ResolvedTariffContext {
  priceBook: { id: string; currency: string; taxRatePercent: number };
  tariffGroup: { id: string; name: string; category: string | null };
  tariffVersion: {
    id: string;
    versionNumber: number;
    rate: {
      dailyRateCents: number;
      weeklyRateCents: number;
      monthlyRateCents: number;
      includedKmPerDay: number;
      extraKmPriceCents: number;
      depositAmountCents: number;
      minimumRentalDays: number | null;
    };
    mileagePackages: Array<{
      id: string;
      label: string;
      includedKm: number;
      priceCents: number;
    }>;
    insuranceOptions: Array<{
      id: string;
      label: string;
      priceCents: number;
      pricingType: 'PER_DAY' | 'PER_BOOKING';
    }>;
    extraOptions: Array<{
      id: string;
      label: string;
      priceCents: number;
      pricingType: 'PER_DAY' | 'PER_BOOKING';
    }>;
  };
}

export interface BookingPriceSimulation extends ReturnType<typeof simulateBookingPrice> {
  tariffVersionId: string;
  priceBookId: string;
  tariffGroupId: string;
  currency: string;
  effectiveDailyRateCents: number;
}

@Injectable()
export class PricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly migration: PricingMigrationService,
  ) {}

  async resolveTariffForVehicle(
    orgId: string,
    vehicleId: string,
    pickupAt: Date,
    returnAt: Date,
  ): Promise<ResolvedTariffContext> {
    await this.migration.ensureOrgPricing(orgId);

    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId: orgId },
    });
    if (!vehicle) {
      throw new NotFoundException('Fahrzeug nicht gefunden');
    }

    const assignment = await this.prisma.vehicleTariffAssignment.findFirst({
      where: {
        organizationId: orgId,
        vehicleId,
        isActive: true,
        validFrom: { lte: pickupAt },
        OR: [{ validTo: null }, { validTo: { gte: pickupAt } }],
      },
      orderBy: { validFrom: 'desc' },
    });

    if (!assignment) {
      throw new BadRequestException({
        message: 'Kein aktiver Tarif für dieses Fahrzeug zugewiesen',
        code: 'NO_ACTIVE_TARIFF',
        vehicleId,
      });
    }

    const version = await this.prisma.priceTariffVersion.findFirst({
      where: {
        organizationId: orgId,
        tariffGroupId: assignment.tariffGroupId,
        status: 'ACTIVE',
        validFrom: { lte: pickupAt },
        OR: [{ validTo: null }, { validTo: { gte: pickupAt } }],
      },
      include: {
        rate: true,
        mileagePackages: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
        insuranceOptions: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
        extraOptions: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
        priceBook: true,
        tariffGroup: true,
      },
      orderBy: { versionNumber: 'desc' },
    });

    if (!version?.rate) {
      throw new BadRequestException({
        message: 'Keine aktive Tarifversion mit Rate gefunden',
        code: 'NO_ACTIVE_TARIFF_VERSION',
        vehicleId,
      });
    }

    const currency = resolvePriceBookCurrency(version.priceBook);

    return {
      priceBook: {
        id: version.priceBook.id,
        currency,
        taxRatePercent: version.priceBook.taxRatePercent,
      },
      tariffGroup: {
        id: version.tariffGroup.id,
        name: version.tariffGroup.name,
        category: version.tariffGroup.category,
      },
      tariffVersion: {
        id: version.id,
        versionNumber: version.versionNumber,
        rate: version.rate,
        mileagePackages: version.mileagePackages,
        insuranceOptions: version.insuranceOptions,
        extraOptions: version.extraOptions,
      },
    };
  }

  async simulateBookingPrice(
    orgId: string,
    dto: SimulateBookingPriceDto,
  ): Promise<BookingPriceSimulation> {
    const pickupAt = new Date(dto.pickupAt);
    const returnAt = new Date(dto.returnAt);
    if (returnAt <= pickupAt) {
      throw new BadRequestException('returnAt muss nach pickupAt liegen');
    }

    const ctx = await this.resolveTariffForVehicle(
      orgId,
      dto.vehicleId,
      pickupAt,
      returnAt,
    );
    const tv = ctx.tariffVersion;

    const mileagePackage = dto.selectedMileagePackageId
      ? tv.mileagePackages.find((p) => p.id === dto.selectedMileagePackageId)
      : null;
    if (dto.selectedMileagePackageId && !mileagePackage) {
      throw new BadRequestException('Kilometerpaket nicht gefunden');
    }

    const insurances = (dto.selectedInsuranceOptionIds ?? [])
      .map((id) => tv.insuranceOptions.find((o) => o.id === id))
      .filter(Boolean) as ResolvedTariffContext['tariffVersion']['insuranceOptions'];
    if (
      (dto.selectedInsuranceOptionIds?.length ?? 0) > 0 &&
      insurances.length !== dto.selectedInsuranceOptionIds!.length
    ) {
      throw new BadRequestException('Eine oder mehrere Versicherungsoptionen ungültig');
    }

    const extras = (dto.selectedExtraOptionIds ?? [])
      .map((id) => tv.extraOptions.find((o) => o.id === id))
      .filter(Boolean) as ResolvedTariffContext['tariffVersion']['extraOptions'];
    if (
      (dto.selectedExtraOptionIds?.length ?? 0) > 0 &&
      extras.length !== dto.selectedExtraOptionIds!.length
    ) {
      throw new BadRequestException('Ein oder mehrere Extras ungültig');
    }

    const result = simulateBookingPrice({
      pickupAt,
      returnAt,
      taxRatePercent: ctx.priceBook.taxRatePercent,
      rate: tv.rate,
      mileagePackage: mileagePackage ?? undefined,
      insurances,
      extras,
      manualDiscountCents: dto.manualDiscountCents,
      manualAdjustmentCents: dto.manualAdjustmentCents,
    });

    const currency = ctx.priceBook.currency;
    assertClientCurrencyMatches(dto.currency, currency);

    return {
      ...result,
      tariffVersionId: tv.id,
      priceBookId: ctx.priceBook.id,
      tariffGroupId: ctx.tariffGroup.id,
      currency,
      effectiveDailyRateCents: tv.rate.dailyRateCents,
    };
  }

  async createBookingPriceSnapshot(
    orgId: string,
    bookingId: string,
    input: {
      vehicleId: string;
      pickupAt: Date;
      returnAt: Date;
      pricing?: BookingPricingInputDto;
    },
  ) {
    const simulation = await this.simulateBookingPrice(orgId, {
      vehicleId: input.vehicleId,
      pickupAt: input.pickupAt.toISOString(),
      returnAt: input.returnAt.toISOString(),
      selectedMileagePackageId: input.pricing?.selectedMileagePackageId,
      selectedInsuranceOptionIds: input.pricing?.selectedInsuranceOptionIds,
      selectedExtraOptionIds: input.pricing?.selectedExtraOptionIds,
      manualDiscountCents: input.pricing?.manualDiscountCents,
      manualAdjustmentCents: input.pricing?.manualAdjustmentCents,
    });

    await this.prisma.bookingPriceSnapshot.deleteMany({
      where: { bookingId, organizationId: orgId },
    });

    const snapshot = await this.prisma.bookingPriceSnapshot.create({
      data: {
        organizationId: orgId,
        bookingId,
        priceBookId: simulation.priceBookId,
        tariffGroupId: simulation.tariffGroupId,
        tariffVersionId: simulation.tariffVersionId,
        currency: simulation.currency,
        taxRatePercent:
          simulation.lineItems.find((li) => li.type === 'BASE_RENTAL')?.taxRatePercent ?? 19,
        rentalDays: simulation.rentalDays,
        includedKm: simulation.includedKm,
        extraKmPriceCents: simulation.extraKmPriceCents,
        depositAmountCents: simulation.depositAmountCents,
        subtotalNetCents: simulation.subtotalNetCents,
        taxAmountCents: simulation.taxAmountCents,
        totalGrossCents: simulation.totalGrossCents,
        totalDueNowCents: simulation.totalDueNowCents,
        pricingInputJson: (input.pricing ?? {}) as Prisma.InputJsonValue,
        pricingWarningsJson: simulation.warnings.length
          ? (simulation.warnings as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        lineItems: {
          create: simulation.lineItems.map((li) => this.lineItemCreate(orgId, li)),
        },
      },
      include: { lineItems: true },
    });

    return { snapshot, simulation };
  }

  /** Sync legacy Booking columns from pricing simulation. */
  legacyBookingFieldsFromSimulation(simulation: BookingPriceSimulation) {
    const insuranceLabels = simulation.lineItems
      .filter((li) => li.type === 'INSURANCE')
      .map((li) => li.label);
    const extras = simulation.lineItems
      .filter((li) => li.type === 'EXTRA')
      .map((li) => ({
        label: li.label,
        quantity: li.quantity,
        totalCents: li.totalGrossCents,
      }));

    return {
      dailyRateCents: simulation.effectiveDailyRateCents,
      totalPriceCents: simulation.totalGrossCents,
      kmIncluded: simulation.includedKm,
      currency: toBookingCurrencyStorage(simulation.currency),
      insuranceOptions:
        insuranceLabels.length > 0
          ? (insuranceLabels as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      extrasJson: extras.length > 0 ? (extras as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
    };
  }

  extractPricingInputFromBookingData(data: Record<string, unknown>): BookingPricingInputDto | undefined {
    const raw =
      data.pricingInput ??
      data.pricingInputJson ??
      (typeof data.extrasJson === 'object' && data.extrasJson !== null && !Array.isArray(data.extrasJson)
        ? (data.extrasJson as Record<string, unknown>).pricing
        : undefined);
    if (!raw || typeof raw !== 'object') return undefined;
    return raw as BookingPricingInputDto;
  }

  private lineItemCreate(orgId: string, li: SimulatedLineItem) {
    return {
      organizationId: orgId,
      type: li.type,
      label: li.label,
      quantity: li.quantity,
      unitPriceCents: li.unitPriceCents,
      totalNetCents: li.totalNetCents,
      taxRatePercent: li.taxRatePercent,
      totalGrossCents: li.totalGrossCents,
      metadataJson: li.metadataJson
        ? (li.metadataJson as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      sortOrder: li.sortOrder,
    };
  }
}
