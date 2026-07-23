import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import type { BookingCancellationFeeResult } from './booking-cancellation.types';

export interface ComputeCancellationFeeInput {
  organizationId: string;
  bookingId: string;
  effectiveAt: Date;
  pickupAt: Date;
}

@Injectable()
export class BookingCancellationFeeService {
  constructor(private readonly prisma: PrismaService) {}

  async computeFee(input: ComputeCancellationFeeInput): Promise<BookingCancellationFeeResult> {
    const [rules, snapshot] = await Promise.all([
      this.prisma.organizationRentalRules.findUnique({
        where: { organizationId: input.organizationId },
      }),
      this.prisma.bookingPriceSnapshot.findUnique({
        where: { bookingId: input.bookingId },
      }),
    ]);

    const currency = snapshot?.currency ?? rules?.depositCurrency ?? 'EUR';
    const baseTotalGrossCents = snapshot?.totalGrossCents ?? null;
    const percentBps = rules?.cancellationFeePercentBps ?? null;
    const freeHours = rules?.cancellationFreeHoursBeforePickup ?? null;
    const minFeeCents = rules?.cancellationMinFeeCents ?? 0;
    const maxFeeCents = rules?.cancellationMaxFeeCents ?? null;

    if (!percentBps || percentBps <= 0 || baseTotalGrossCents == null || baseTotalGrossCents <= 0) {
      return {
        feeCents: 0,
        currency,
        percentBps,
        freeHoursBeforePickup: freeHours,
        baseTotalGrossCents,
        waived: true,
        waiverReason: 'NO_CANCELLATION_FEE_POLICY',
      };
    }

    const hoursUntilPickup =
      (input.pickupAt.getTime() - input.effectiveAt.getTime()) / (60 * 60 * 1000);

    if (freeHours != null && freeHours > 0 && hoursUntilPickup >= freeHours) {
      return {
        feeCents: 0,
        currency,
        percentBps,
        freeHoursBeforePickup: freeHours,
        baseTotalGrossCents,
        waived: true,
        waiverReason: 'WITHIN_FREE_CANCELLATION_WINDOW',
      };
    }

    let feeCents = Math.round((baseTotalGrossCents * percentBps) / 10_000);
    if (minFeeCents > 0) {
      feeCents = Math.max(feeCents, minFeeCents);
    }
    if (maxFeeCents != null && maxFeeCents >= 0) {
      feeCents = Math.min(feeCents, maxFeeCents);
    }
    feeCents = Math.max(0, feeCents);

    return {
      feeCents,
      currency,
      percentBps,
      freeHoursBeforePickup: freeHours,
      baseTotalGrossCents,
      waived: feeCents === 0,
      waiverReason: feeCents === 0 ? 'COMPUTED_ZERO' : null,
    };
  }
}
