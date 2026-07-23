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
import { DepositResolverService } from '@modules/deposit/deposit-resolver.service';
import { BookingDepositSnapshotService } from '@modules/deposit/booking-deposit-snapshot.service';
import type { ResolvedDeposit } from '@modules/deposit/deposit-resolver.types';
import type { PricingContextDto, ResolvedTariffContext } from './pricing-context.types';
import { assertTariffVersionComplete, toPricingContextDto } from './pricing-context.util';
import {
  simulateBookingPrice,
  SimulatedLineItem,
} from './pricing-calculation.util';
import { PricingMigrationService } from './pricing-migration.service';
import { PRICING_ENGINE_VERSION } from './pricing-engine.constants';
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
  resolvedDeposit?: ResolvedDeposit;
}

@Injectable()
export class PricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly migration: PricingMigrationService,
    private readonly depositResolver: DepositResolverService,
    private readonly bookingDepositSnapshot: BookingDepositSnapshotService,
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
    resolvedDeposit?: ResolvedDeposit,
  ): PricingContextDto {
    return toPricingContextDto(ctx, vehicleId, pickupAt, resolvedDeposit);
  }

  async resolvePricingContext(
    orgId: string,
    vehicleId: string,
    pickupAt: Date,
    returnAt: Date,
  ): Promise<PricingContextDto> {
    const ctx = await this.resolveTariffForVehicle(orgId, vehicleId, pickupAt, returnAt);
    const resolvedDeposit = await this.depositResolver.resolveForVehicleTariff({
      organizationId: orgId,
      vehicleId,
      tariffContext: ctx,
    });
    return this.buildPricingContext(ctx, vehicleId, pickupAt, resolvedDeposit);
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

    const resolvedDeposit = await this.depositResolver.resolveForVehicleTariff({
      organizationId: orgId,
      vehicleId: dto.vehicleId,
      tariffContext: ctx,
    });

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
      resolvedDeposit: {
        amountCents: resolvedDeposit.amount,
        currency: resolvedDeposit.currency,
        source: resolvedDeposit.source,
        ruleRevisionId: resolvedDeposit.ruleRevisionId,
        reason: resolvedDeposit.reason,
        manualOverride: resolvedDeposit.manualOverride,
      },
    });

    if (resolvedDeposit.components.raisedToMinimum) {
      result.warnings.push(resolvedDeposit.reason);
    }

    assertClientCurrencyMatches(dto.currency, currency);

    const pricingContext = this.buildPricingContext(
      ctx,
      dto.vehicleId,
      pickupAt,
      resolvedDeposit,
    );

    return {
      ...result,
      tariffVersionId: tv.id,
      priceBookId: ctx.priceBook.id,
      tariffGroupId: ctx.tariffGroup.id,
      currency,
      effectiveDailyRateCents: tv.rate.dailyRateCents,
      pricingContext,
      resolvedDeposit,
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

    return this.createBookingPriceSnapshotFromSimulation(
      orgId,
      bookingId,
      simulation,
      input.pricing,
    );
  }

  async findCurrentBookingPriceSnapshot(
    orgId: string,
    bookingId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma;
    return db.bookingPriceSnapshot.findFirst({
      where: { organizationId: orgId, bookingId, isCurrent: true },
      include: { lineItems: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  async appendBookingPriceSnapshotRevision(input: {
    organizationId: string;
    bookingId: string;
    quoteId?: string | null;
    simulation: BookingPriceSimulation;
    pricingInput?: BookingPricingInputDto;
    calculatedAt?: Date | null;
    tx?: Prisma.TransactionClient;
  }) {
    const db = input.tx ?? this.prisma;
    const latest = await db.bookingPriceSnapshot.findFirst({
      where: { organizationId: input.organizationId, bookingId: input.bookingId },
      orderBy: { revision: 'desc' },
      select: { revision: true },
    });
    const nextRevision = (latest?.revision ?? 0) + 1;

    await db.bookingPriceSnapshot.updateMany({
      where: {
        organizationId: input.organizationId,
        bookingId: input.bookingId,
        isCurrent: true,
      },
      data: { isCurrent: false },
    });

    const resolved = input.simulation.resolvedDeposit ?? null;
    const frozenDeposit = this.bookingDepositSnapshot.buildFrozenDeposit(resolved, null);
    const metadataJson = this.buildSnapshotMetadata(input.simulation, input.calculatedAt);

    const snapshot = await db.bookingPriceSnapshot.create({
      data: {
        organizationId: input.organizationId,
        bookingId: input.bookingId,
        revision: nextRevision,
        isCurrent: true,
        pricingQuoteId: input.quoteId ?? null,
        priceBookId: input.simulation.priceBookId,
        tariffGroupId: input.simulation.tariffGroupId,
        tariffVersionId: input.simulation.tariffVersionId,
        currency: input.simulation.currency,
        taxRatePercent:
          input.simulation.lineItems.find((li) => li.type === 'BASE_RENTAL')?.taxRatePercent ?? 19,
        rentalDays: input.simulation.rentalDays,
        includedKm: input.simulation.includedKm,
        extraKmPriceCents: input.simulation.extraKmPriceCents,
        depositAmountCents: input.simulation.depositAmountCents,
        subtotalNetCents: input.simulation.subtotalNetCents,
        taxAmountCents: input.simulation.taxAmountCents,
        totalGrossCents: input.simulation.totalGrossCents,
        totalDueNowCents: input.simulation.totalDueNowCents,
        calculatedAt: input.calculatedAt ?? new Date(),
        engineVersion: PRICING_ENGINE_VERSION,
        metadataJson: metadataJson as unknown as Prisma.InputJsonValue,
        pricingInputJson: {
          ...(input.pricingInput ?? {}),
          frozenDeposit,
        } as Prisma.InputJsonValue,
        pricingWarningsJson: input.simulation.warnings.length
          ? (input.simulation.warnings as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        lineItems: {
          create: input.simulation.lineItems.map((li) =>
            this.lineItemCreate(input.organizationId, li),
          ),
        },
      },
      include: { lineItems: true },
    });

    const booking = await db.booking.findFirst({
      where: { id: input.bookingId, organizationId: input.organizationId },
      select: { customerId: true },
    });
    await this.bookingDepositSnapshot.syncBookingDepositFromSnapshot(
      input.organizationId,
      input.bookingId,
      booking?.customerId ?? null,
      db,
    );

    return { snapshot, simulation: input.simulation };
  }

  private buildSnapshotMetadata(
    simulation: BookingPriceSimulation,
    calculatedAt?: Date | null,
  ): Record<string, unknown> {
    const deposit = simulation.resolvedDeposit ?? simulation.pricingContext.resolvedDeposit;
    return {
      baseRental: simulation.lineItems.find((li) => li.type === 'BASE_RENTAL') ?? null,
      rentalDays: simulation.rentalDays,
      tariff: {
        priceBookId: simulation.priceBookId,
        tariffGroupId: simulation.tariffGroupId,
        tariffVersionId: simulation.tariffVersionId,
        versionNumber: simulation.pricingContext.versionNumber,
      },
      options: simulation.lineItems.filter(
        (li) =>
          li.type === 'EXTRA' || li.type === 'INSURANCE' || li.type === 'MILEAGE_PACKAGE',
      ),
      fees: simulation.lineItems.filter((li) => li.type === 'MANUAL_ADJUSTMENT'),
      discounts: simulation.lineItems.filter((li) => li.type === 'DISCOUNT'),
      taxes: simulation.lineItems.filter((li) => li.type === 'TAX'),
      deposit: deposit
        ? {
            amountCents: deposit.amount,
            currency: deposit.currency,
            source: deposit.source,
            ruleRevisionId: deposit.ruleRevisionId,
          }
        : null,
      currency: simulation.currency,
      rentalRuleRevisionId: deposit?.ruleRevisionId ?? null,
      calculatedAt: (calculatedAt ?? new Date()).toISOString(),
      engineVersion: PRICING_ENGINE_VERSION,
    };
  }

  async createBookingPriceSnapshotFromSimulation(
    orgId: string,
    bookingId: string,
    simulation: BookingPriceSimulation,
    pricing?: BookingPricingInputDto,
    tx?: Prisma.TransactionClient,
  ) {
    return this.appendBookingPriceSnapshotRevision({
      organizationId: orgId,
      bookingId,
      simulation,
      pricingInput: pricing,
      tx,
    });
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
