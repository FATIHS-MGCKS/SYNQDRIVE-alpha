import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type { ResolvedDeposit } from './deposit-resolver.types';
import {
  parseFrozenBookingDeposit,
  toFrozenBookingDeposit,
  type FrozenBookingDeposit,
} from './frozen-booking-deposit.types';

@Injectable()
export class BookingDepositSnapshotService {
  constructor(private readonly prisma: PrismaService) {}

  buildFrozenDeposit(
    resolved: ResolvedDeposit | null | undefined,
    frozenAt: string | null = null,
  ): FrozenBookingDeposit | null {
    if (!resolved) return null;
    return toFrozenBookingDeposit(resolved, frozenAt);
  }

  extractFrozenDepositFromPricingInput(pricingInputJson: unknown): FrozenBookingDeposit | null {
    if (!pricingInputJson || typeof pricingInputJson !== 'object') return null;
    const row = pricingInputJson as Record<string, unknown>;
    return (
      parseFrozenBookingDeposit(row.frozenDeposit) ??
      parseFrozenBookingDeposit(row.resolvedDeposit)
    );
  }

  async syncBookingDepositFromSnapshot(
    organizationId: string,
    bookingId: string,
    customerId: string | null,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const db = tx ?? this.prisma;
    const snapshot = await db.bookingPriceSnapshot.findFirst({
      where: { organizationId, bookingId },
      select: { depositAmountCents: true, currency: true, pricingInputJson: true },
    });
    if (!snapshot || snapshot.depositAmountCents <= 0) return;

    const frozen =
      this.extractFrozenDepositFromPricingInput(snapshot.pricingInputJson) ??
      ({
        amountCents: snapshot.depositAmountCents,
        currency: snapshot.currency,
        source: 'TARIFF_RATE',
        ruleRevisionId: null,
        reason: 'From booking price snapshot',
        manualOverride: false,
        calculatedAt: new Date().toISOString(),
        frozenAt: null,
      } satisfies FrozenBookingDeposit);

    const reason = JSON.stringify({
      kind: 'canonical_deposit_snapshot',
      source: frozen.source,
      ruleRevisionId: frozen.ruleRevisionId,
      calculatedAt: frozen.calculatedAt,
      frozenAt: frozen.frozenAt,
      message: frozen.reason,
    });

    await db.bookingDeposit.upsert({
      where: { bookingId },
      create: {
        organizationId,
        bookingId,
        customerId,
        amountCents: snapshot.depositAmountCents,
        currency: frozen.currency.toUpperCase(),
        status: 'REQUESTED',
        reason,
      },
      update: {
        amountCents: snapshot.depositAmountCents,
        currency: frozen.currency.toUpperCase(),
        reason,
      },
    });
  }

  async freezeDepositOnSnapshot(
    organizationId: string,
    bookingId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<FrozenBookingDeposit | null> {
    const db = tx ?? this.prisma;
    const snapshot = await db.bookingPriceSnapshot.findFirst({
      where: { organizationId, bookingId },
      select: { id: true, pricingInputJson: true, depositAmountCents: true, currency: true },
    });
    if (!snapshot) return null;

    const pricingInput =
      snapshot.pricingInputJson && typeof snapshot.pricingInputJson === 'object'
        ? { ...(snapshot.pricingInputJson as Record<string, unknown>) }
        : {};

    const existing =
      this.extractFrozenDepositFromPricingInput(pricingInput) ??
      ({
        amountCents: snapshot.depositAmountCents,
        currency: snapshot.currency,
        source: 'TARIFF_RATE',
        ruleRevisionId: null,
        reason: 'From booking price snapshot',
        manualOverride: false,
        calculatedAt: new Date().toISOString(),
        frozenAt: null,
      } satisfies FrozenBookingDeposit);

    if (existing.frozenAt) return existing;

    const frozenAt = new Date().toISOString();
    const frozenDeposit: FrozenBookingDeposit = { ...existing, frozenAt };
    pricingInput.frozenDeposit = frozenDeposit;
    delete pricingInput.resolvedDeposit;

    await db.bookingPriceSnapshot.update({
      where: { id: snapshot.id },
      data: { pricingInputJson: pricingInput as Prisma.InputJsonValue },
    });

    await this.syncBookingDepositFromSnapshot(organizationId, bookingId, null, db);
    return frozenDeposit;
  }
}
