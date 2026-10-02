import type { BatteryRestSessionFeature } from '@prisma/client';
import { verifyPersistedFeatureRowDigest } from './rest-session-feature-shadow-inspection.integrity';
import type { RestSessionFeatureShadowDigestVerificationScope } from './rest-session-feature-shadow-inspection.types';
import { mapFeatureRowToInspectionRevision } from './rest-session-feature-shadow-inspection.types';
import type { RestSessionFeatureShadowInspectionRevisionV1 } from './rest-session-feature-shadow-inspection.types';

export function buildUniqueDigestVerificationRows(input: {
  latestRows: BatteryRestSessionFeature[];
  canonicalRow: BatteryRestSessionFeature | null;
}): BatteryRestSessionFeature[] {
  const byId = new Map<string, BatteryRestSessionFeature>();
  for (const row of input.latestRows) {
    byId.set(row.id, row);
  }
  if (input.canonicalRow && !byId.has(input.canonicalRow.id)) {
    byId.set(input.canonicalRow.id, input.canonicalRow);
  }
  return [...byId.values()];
}

export function computeDigestVerificationAccounting(input: {
  totalRows: number;
  latestRows: BatteryRestSessionFeature[];
  canonicalRow: BatteryRestSessionFeature | null;
  includeRaw: boolean;
}): {
  digestRowsChecked: number;
  digestRowsUnchecked: number;
  digestVerificationScope: RestSessionFeatureShadowDigestVerificationScope;
  digestMismatchCount: number;
  revisions: RestSessionFeatureShadowInspectionRevisionV1[];
  canonicalFeature: RestSessionFeatureShadowInspectionRevisionV1 | null;
} {
  const uniqueRows = buildUniqueDigestVerificationRows({
    latestRows: input.latestRows,
    canonicalRow: input.canonicalRow,
  });

  const digestValidById = new Map<string, boolean>();
  let digestMismatchCount = 0;
  for (const row of uniqueRows) {
    const digestValid = verifyPersistedFeatureRowDigest(row);
    digestValidById.set(row.id, digestValid);
    if (!digestValid) digestMismatchCount += 1;
  }

  const digestRowsChecked = uniqueRows.length;
  const digestRowsUnchecked = Math.max(0, input.totalRows - digestRowsChecked);
  const digestVerificationScope: RestSessionFeatureShadowDigestVerificationScope =
    digestRowsUnchecked === 0 ? 'FULL' : 'BOUNDED_LATEST_WINDOW';

  const revisions = input.latestRows.map((row) =>
    mapFeatureRowToInspectionRevision(
      row,
      digestValidById.get(row.id) ?? false,
      input.includeRaw,
    ),
  );

  const canonicalFeature = input.canonicalRow
    ? mapFeatureRowToInspectionRevision(
        input.canonicalRow,
        digestValidById.get(input.canonicalRow.id) ?? false,
        input.includeRaw,
      )
    : null;

  return {
    digestRowsChecked,
    digestRowsUnchecked,
    digestVerificationScope,
    digestMismatchCount,
    revisions,
    canonicalFeature,
  };
}
