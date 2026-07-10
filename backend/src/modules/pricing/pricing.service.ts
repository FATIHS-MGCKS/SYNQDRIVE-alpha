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
import type { PricingContextDto, ResolvedTariffContext } from './pricing-context.types';
import { assertTariffVersionComplete, toPricingContextDto } from './pricing-context.util';
import {
  simulateBookingPrice,
  SimulatedLineItem,
} from './pricing-calculation.util';
import { PricingMigrationService } from './pricing-migration.service';
import { parseBookingInstant } from './tariff-instant.util';
import {
  assignmentEffectiveAtFilter,
  compareResolvableVersions,
  RESOLVABLE_TARIFF_VERSION_STATUSES,
  tariffVersionEffectiveAtFilter,
} from './tariff-validity.util';

export type { ResolvedTariffContext } from './pricing-context.types';

export interface BookingPriceSimulation extends ReturnType<typeof simulateBookingPrice> {
  tariffVersionId: string;
  priceBookId: string;
  tariffGroupId: string;
  currency: string;
  effectiveDailyRateCents: number;
  pricingContext: PricingContextDto;
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
    _returnAt: Date,
  ): Promise<ResolvedTariffContext> {
    await this.migration.ensureOrgPricing(orgId);

    const pickupInstant = parseBookingInstant(pickupAt);

    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId: orgId },
    });
    if (!vehicle) {
      throw new NotFoundException('Fahrzeug nicht gefunden');
    }

    const assignments = await this.prisma.vehicleTariffAssignment.findMany({
      where: {
        organizationId: orgId,
        vehicleId,
        isActive: true,
        ...assignmentEffectiveAtFilter(pickupInstant),
      },
      orderBy: { validFrom: 'desc' },
    });

    if (assignments.length === 0) {
      throw new BadRequestException({
        message: 'Kein aktiver Tarif für dieses Fahrzeug zugewiesen',
        code: 'NO_ACTIVE_TARIFF',
        vehicleId,
        pickupAt: pickupInstant.toISOString(),
      });
    }

    if (assignments.length > 1) {
      const groupIds = new Set(assignments.map((a) => a.tariffGroupId));
      const bookIds = new Set(assignments.map((a) => a.priceBookId));
      if (groupIds.size > 1 || bookIds.size > 1) {
        throw new BadRequestException({
          message: 'Mehrere konkurrierende Tarifzuweisungen für den Abholzeitpunkt',
          code: 'ASSIGNMENT_CONFLICT',
          vehicleId,
          pickupAt: pickupInstant.toISOString(),
          assignmentIds: assignments.map((a) => a.id),
        });
      }
    }

    const assignment = assignments[0];

    const group = await this.prisma.priceTariffGroup.findFirst({
      where: { id: assignment.tariffGroupId, organizationId: orgId },
    });
    if (!group) {
      throw new BadRequestException({
        message: 'Tarifgruppe der Zuweisung nicht gefunden',
        code: 'TARIFF_GROUP_INACTIVE',
        tariffGroupId: assignment.tariffGroupId,
      });
    }
    if (!group.isActive) {
      throw new BadRequestException({
        message: 'Tarifgruppe ist inaktiv',
        code: 'TARIFF_GROUP_INACTIVE',
        tariffGroupId: group.id,
        tariffGroupName: group.name,
      });
    }

    const candidates = await this.prisma.priceTariffVersion.findMany({
      where: {
        organizationId: orgId,
        tariffGroupId: assignment.tariffGroupId,
        status: { in: [...RESOLVABLE_TARIFF_VERSION_STATUSES] },
        ...tariffVersionEffectiveAtFilter(pickupInstant),
      },
      include: {
        rate: true,
        mileagePackages: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
        insuranceOptions: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
        extraOptions: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
        priceBook: true,
        tariffGroup: true,
      },
    });

    if (candidates.length === 0) {
      throw new BadRequestException({
        message: 'Keine gültige Tarifversion für den Abholzeitpunkt gefunden',
        code: 'NO_TARIFF_VERSION_FOR_PICKUP',
        vehicleId,
        pickupAt: pickupInstant.toISOString(),
        tariffGroupId: assignment.tariffGroupId,
      });
    }

    const sorted = [...candidates].sort(compareResolvableVersions);
    const version = sorted[0];

    if (sorted.length > 1) {
      const tie = sorted[1];
      if (
        tie.validFrom.getTime() === version.validFrom.getTime() &&
        tie.versionNumber === version.versionNumber
      ) {
        throw new BadRequestException({
          message: 'Mehrdeutige Tarifauflösung für den Abholzeitpunkt',
          code: 'TARIFF_RESOLUTION_AMBIGUOUS',
          pickupAt: pickupInstant.toISOString(),
          tariffGroupId: assignment.tariffGroupId,
        });
      }
    }

    if (!version.rate) {
      throw new BadRequestException({
        message: 'Tarifversion ohne Rate für den Abholzeitpunkt',
        code: 'NO_TARIFF_RATE_FOR_PICKUP',
        vehicleId,
        tariffVersionId: version.id,
      });
    }

    if (!version.priceBook.isActive) {
      throw new BadRequestException({
        message: 'Preisbuch ist nicht aktiv',
        code: 'PRICE_BOOK_INACTIVE',
        priceBookId: version.priceBook.id,
      });
    }

    assertTariffVersionComplete(version.rate, version.id);

    const currency = resolvePriceBookCurrency(version.priceBook);

    return {
      assignmentId: assignment.id,
      vehicleId,
      pickupAt: pickupInstant,
      priceBook: {
        id: version.priceBook.id,
        name: version.priceBook.name,
        currency,
        taxRatePercent: version.priceBook.taxRatePercent,
      },
      tariffGroup: {
        id: version.tariffGroup.id,
        name: version.tariffGroup.name,
        category: version.tariffGroup.category,
        isActive: version.tariffGroup.isActive,
      },
      tariffVersion: {
        id: version.id,
        versionNumber: version.versionNumber,
        validFrom: version.validFrom,
        validTo: version.validTo,
        rate: version.rate,
        mileagePackages: version.mileagePackages.map((p) => ({
          id: p.id,
          label: p.label,
          includedKm: p.includedKm,
          priceCents: p.priceCents,
          isActive: p.isActive,
          sortOrder: p.sortOrder,
        })),
        insuranceOptions: version.insuranceOptions.map((o) => ({
          id: o.id,
          label: o.label,
          description: o.description,
          priceCents: o.priceCents,
          pricingType: o.pricingType,
          deductibleCents: o.deductibleCents,
          isDefault: o.isDefault,
          isActive: o.isActive,
          sortOrder: o.sortOrder,
        })),
        extraOptions: version.extraOptions.map((o) => ({
          id: o.id,
          label: o.label,
          description: o.description,
          priceCents: o.priceCents,
          pricingType: o.pricingType,
          isActive: o.isActive,
          sortOrder: o.sortOrder,
        })),
      },
    };
  }

  /** Maps resolver output to the API-facing pricing context DTO. */
  buildPricingContext(
    ctx: ResolvedTariffContext,
    vehicleId: string,
    pickupAt: Date,
  ): PricingContextDto {
    return toPricingContextDto(ctx, vehicleId, pickupAt);
  }

  async resolvePricingContext(
    orgId: string,
    vehicleId: string,
    pickupAt: Date,
    returnAt: Date,
  ): Promise<PricingContextDto> {
    const ctx = await this.resolveTariffForVehicle(orgId, vehicleId, pickupAt, returnAt);
    return this.buildPricingContext(ctx, vehicleId, pickupAt);
  }

  async simulateBookingPrice(
    orgId: string,
    dto: SimulateBookingPriceDto,
  ): Promise<BookingPriceSimulation> {
    const pickupAt = parseBookingInstant(dto.pickupAt);
    const returnAt = parseBookingInstant(dto.returnAt);
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

    const currency = ctx.priceBook.currency;

    const result = simulateBookingPrice({
      pickupAt,
      returnAt,
      taxRatePercent: ctx.priceBook.taxRatePercent,
      currency,
      tariffRateId: tv.rate.id ?? null,
      rate: tv.rate,
      mileagePackage: mileagePackage ?? undefined,
      insurances,
      extras,
      manualDiscountCents: dto.manualDiscountCents,
      manualAdjustmentCents: dto.manualAdjustmentCents,
    });

    assertClientCurrencyMatches(dto.currency, currency);

    const pricingContext = this.buildPricingContext(ctx, dto.vehicleId, pickupAt);

    return {
      ...result,
      tariffVersionId: tv.id,
      priceBookId: ctx.priceBook.id,
      tariffGroupId: ctx.tariffGroup.id,
      currency,
      effectiveDailyRateCents: tv.rate.dailyRateCents,
      pricingContext,
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
        ? (li.metadataJson as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      sortOrder: li.sortOrder,
    };
  }
}
