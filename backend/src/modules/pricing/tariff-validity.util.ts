import { BadRequestException } from '@nestjs/common';
import { PriceTariffVersionStatus, Prisma } from '@prisma/client';

/**
 * Tariff validity windows are half-open intervals:
 *   [validFrom, validTo)  — validFrom inclusive, validTo exclusive.
 */
export const RESOLVABLE_TARIFF_VERSION_STATUSES: readonly PriceTariffVersionStatus[] = [
  'ACTIVE',
  'SCHEDULED',
  'ARCHIVED',
];

export interface TariffValidityWindow {
  validFrom: Date;
  validTo: Date | null;
}

export function isEffectiveAt(window: TariffValidityWindow, instant: Date): boolean {
  const t = instant.getTime();
  if (window.validFrom.getTime() > t) return false;
  if (window.validTo != null && window.validTo.getTime() <= t) return false;
  return true;
}

/** Prisma filter: version effective at `instant` (half-open interval). */
export function tariffVersionEffectiveAtFilter(instant: Date): Prisma.PriceTariffVersionWhereInput {
  return {
    validFrom: { lte: instant },
    OR: [{ validTo: null }, { validTo: { gt: instant } }],
  };
}

/** Prisma filter for vehicle assignment effective at pickup. */
export function assignmentEffectiveAtFilter(instant: Date): Prisma.VehicleTariffAssignmentWhereInput {
  return {
    validFrom: { lte: instant },
    OR: [{ validTo: null }, { validTo: { gt: instant } }],
  };
}

export function compareResolvableVersions<
  T extends { validFrom: Date; versionNumber: number; id: string },
>(a: T, b: T): number {
  const fromDiff = b.validFrom.getTime() - a.validFrom.getTime();
  if (fromDiff !== 0) return fromDiff;
  const verDiff = b.versionNumber - a.versionNumber;
  if (verDiff !== 0) return verDiff;
  return b.id.localeCompare(a.id);
}

export function pickEffectiveTariffVersion<
  T extends {
    id: string;
    status: PriceTariffVersionStatus;
    validFrom: Date;
    validTo: Date | null;
    versionNumber: number;
  },
>(versions: T[], instant: Date): T | null {
  const candidates = versions
    .filter(
      (v) =>
        RESOLVABLE_TARIFF_VERSION_STATUSES.includes(v.status) &&
        isEffectiveAt(v, instant),
    )
    .sort(compareResolvableVersions);

  return candidates[0] ?? null;
}

export function assertNoOverlappingEffectiveWindows<
  T extends TariffValidityWindow & { id: string },
>(versions: T[]): void {
  const sorted = [...versions].sort(
    (a, b) => a.validFrom.getTime() - b.validFrom.getTime(),
  );

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const prevEnd = prev.validTo?.getTime() ?? Number.POSITIVE_INFINITY;
    if (prevEnd > curr.validFrom.getTime()) {
      throw new BadRequestException({
        message: 'Überlappende Tarif-Gültigkeitszeiträume',
        code: 'TARIFF_VALIDITY_OVERLAP',
        previousVersionId: prev.id,
        currentVersionId: curr.id,
      });
    }
  }
}

export function assertStatusMatchesValidity(
  status: PriceTariffVersionStatus,
  validFrom: Date,
  validTo: Date | null,
  referenceInstant: Date = new Date(),
): void {
  const ref = referenceInstant.getTime();

  if (status === 'ACTIVE' && validFrom.getTime() > ref) {
    throw new BadRequestException({
      message: 'ACTIVE-Tarifversion darf nicht in der Zukunft beginnen',
      code: 'TARIFF_ACTIVE_FUTURE_VALID_FROM',
    });
  }

  if (status === 'SCHEDULED' && validFrom.getTime() <= ref) {
    throw new BadRequestException({
      message: 'SCHEDULED-Tarifversion muss in der Zukunft beginnen',
      code: 'TARIFF_SCHEDULED_PAST_VALID_FROM',
    });
  }

  if (status === 'SCHEDULED' && validTo != null && validTo.getTime() <= ref) {
    throw new BadRequestException({
      message: 'SCHEDULED-Tarifversion ist abgelaufen',
      code: 'TARIFF_SCHEDULED_EXPIRED',
    });
  }
}
