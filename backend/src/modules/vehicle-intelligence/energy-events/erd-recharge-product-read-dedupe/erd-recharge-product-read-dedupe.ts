import type { VehicleEnergyEvent } from '@prisma/client';
import {
  isCanonicalErdRechargeRow,
  isLegacyDirectDimoRechargeRow,
  isOtherRechargeRow,
} from './canonical-erd-recharge-row.policy';
import {
  ERD_RECHARGE_PRODUCT_READ_DEDUPE_EVIDENCE,
  isStrongProductReadDuplicateEvidence,
  proveErdRechargeProductReadDuplicate,
  readCoalescedFromSegmentIds,
} from './erd-recharge-product-read-identity.policy';

export type RechargeProductReadDedupeMetricResult =
  | 'flag_off'
  | 'legacy_preserved'
  | 'canonical_preferred'
  | 'ambiguous_preserved';

export interface ApplyRechargeProductReadDedupeResult<T extends VehicleEnergyEvent> {
  visible: T[];
  metricResults: RechargeProductReadDedupeMetricResult[];
}

function sortRechargeRows<T extends VehicleEnergyEvent>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const startDiff = a.startTime.getTime() - b.startTime.getTime();
    if (startDiff !== 0) return startDiff;
    return a.id.localeCompare(b.id);
  });
}

function uniqueLineageIds(legacy: VehicleEnergyEvent): string[] {
  return [...new Set(readCoalescedFromSegmentIds(legacy))];
}

function legacyHasAmbiguousCanonicalProofs<T extends VehicleEnergyEvent>(
  legacy: T,
  canonicalProofs: T[],
): boolean {
  const byDimo = new Map<string, T[]>();
  for (const canonical of canonicalProofs) {
    const dimo = canonical.dimoSegmentId?.trim();
    if (!dimo) continue;
    byDimo.set(dimo, [...(byDimo.get(dimo) ?? []), canonical]);
  }
  return [...byDimo.values()].some((group) => group.length > 1);
}

function legacyFullyCoveredByCanonicalProofs<T extends VehicleEnergyEvent>(
  legacy: T,
  canonicalProofs: T[],
): boolean {
  const lineageIds = uniqueLineageIds(legacy);
  if (lineageIds.length === 0) {
    return canonicalProofs.length > 0;
  }
  const provenDimoIds = new Set(
    canonicalProofs
      .map((c) => c.dimoSegmentId?.trim())
      .filter((id): id is string => !!id),
  );
  return lineageIds.every((id) => provenDimoIds.has(id));
}

function shouldSuppressLegacyRow<T extends VehicleEnergyEvent>(
  legacy: T,
  canonicalRows: T[],
): { suppress: boolean; ambiguous: boolean } {
  const canonicalProofs = canonicalRows.filter((canonical) => {
    const evidence = proveErdRechargeProductReadDuplicate(canonical, legacy);
    return isStrongProductReadDuplicateEvidence(evidence);
  });

  if (canonicalProofs.length === 0) {
    return { suppress: false, ambiguous: false };
  }

  if (legacyHasAmbiguousCanonicalProofs(legacy, canonicalProofs)) {
    return { suppress: false, ambiguous: true };
  }

  if (!legacyFullyCoveredByCanonicalProofs(legacy, canonicalProofs)) {
    return { suppress: false, ambiguous: false };
  }

  return { suppress: true, ambiguous: false };
}

/**
 * Product-read RECHARGE dedupe — read projection only; fail-open on uncertainty.
 */
export function applyRechargeProductReadDedupe<T extends VehicleEnergyEvent>(
  rechargeRows: T[],
  enabled: boolean,
): ApplyRechargeProductReadDedupeResult<T> {
  if (!enabled) {
    return {
      visible: sortRechargeRows(rechargeRows),
      metricResults: ['flag_off'],
    };
  }

  const canonicalRows = rechargeRows.filter((row) => isCanonicalErdRechargeRow(row));
  const legacyRows = rechargeRows.filter((row) => isLegacyDirectDimoRechargeRow(row));
  const otherRows = rechargeRows.filter((row) => isOtherRechargeRow(row));

  const suppressedLegacyIds = new Set<string>();
  const metricResults: RechargeProductReadDedupeMetricResult[] = [];

  for (const legacy of legacyRows) {
    const decision = shouldSuppressLegacyRow(legacy, canonicalRows);
    if (decision.ambiguous) {
      metricResults.push('ambiguous_preserved');
      continue;
    }
    if (decision.suppress) {
      suppressedLegacyIds.add(legacy.id);
      metricResults.push('canonical_preferred');
    } else {
      metricResults.push('legacy_preserved');
    }
  }

  const visible: T[] = [
    ...canonicalRows,
    ...legacyRows.filter((row) => !suppressedLegacyIds.has(row.id)),
    ...otherRows,
  ];

  return {
    visible: sortRechargeRows(visible),
    metricResults,
  };
}
