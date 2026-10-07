import { Prisma, type PrismaClient } from '@prisma/client';
import type { BatteryHvChargeSessionEvidenceRevision } from '@prisma/client';
import { M3_3_HV_H4_CHARGE_SESSION_EVIDENCE_REVISION_V1 } from './m3-3-hv-h4-a3.constants';
import { H4EvidenceEffectiveRevisionAmbiguityError } from './m3-3-hv-h4-a3-charge-session-evidence.errors.v1';
import {
  collapseModeAEffectiveRevisionsV1,
  selectModeAEffectiveRevisionV1,
} from './m3-3-hv-h4-a3-mode-a-effective-revision.v1';

export interface M3_3HvH4A3_3O1SqlEffectiveSelectionResultV1 {
  effectiveRevisionIds: string[];
  ambiguousSegmentFingerprints: string[];
}

/**
 * TEST-ONLY MODE_A effective revision selection via PostgreSQL window functions.
 * Ordering: source_updated_at DESC, captured_at DESC, created_at DESC (no fingerprint tie-break).
 * Ambiguity: equal top tuple + >1 distinct source_revision_fingerprint => fail closed.
 */
export async function selectModeAEffectiveRevisionIdsSqlPrototypeV1(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    vehicleId: string;
    evidenceContractVersion?: string;
  },
): Promise<M3_3HvH4A3_3O1SqlEffectiveSelectionResultV1> {
  const evidenceContractVersion =
    input.evidenceContractVersion ?? M3_3_HV_H4_CHARGE_SESSION_EVIDENCE_REVISION_V1;

  const ambiguousRows = await prisma.$queryRaw<
    Array<{ segment_fingerprint: string }>
  >(Prisma.sql`
    WITH scoped AS (
      SELECT
        id,
        segment_fingerprint,
        source_revision_fingerprint,
        source_updated_at,
        captured_at,
        created_at
      FROM battery_hv_charge_session_evidence_revisions
      WHERE organization_id = ${input.organizationId}
        AND vehicle_id = ${input.vehicleId}
        AND evidence_contract_version = ${evidenceContractVersion}
    ),
    ranked AS (
      SELECT
        *,
        ROW_NUMBER() OVER (
          PARTITION BY segment_fingerprint
          ORDER BY source_updated_at DESC, captured_at DESC, created_at DESC, id ASC
        ) AS rn
      FROM scoped
    ),
    winners AS (
      SELECT * FROM ranked WHERE rn = 1
    ),
    tuple_peers AS (
      SELECT
        r.segment_fingerprint,
        COUNT(DISTINCT r.source_revision_fingerprint)::int AS fp_count
      FROM scoped r
      INNER JOIN winners w
        ON r.segment_fingerprint = w.segment_fingerprint
        AND r.source_updated_at = w.source_updated_at
        AND r.captured_at = w.captured_at
        AND r.created_at = w.created_at
      GROUP BY r.segment_fingerprint
      HAVING COUNT(DISTINCT r.source_revision_fingerprint) > 1
    )
    SELECT segment_fingerprint FROM tuple_peers
  `);

  const ambiguousSegmentFingerprints = ambiguousRows.map((r) => r.segment_fingerprint);
  if (ambiguousSegmentFingerprints.length > 0) {
    return { effectiveRevisionIds: [], ambiguousSegmentFingerprints };
  }

  const effectiveRows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    WITH scoped AS (
      SELECT
        id,
        segment_fingerprint,
        source_updated_at,
        captured_at,
        created_at
      FROM battery_hv_charge_session_evidence_revisions
      WHERE organization_id = ${input.organizationId}
        AND vehicle_id = ${input.vehicleId}
        AND evidence_contract_version = ${evidenceContractVersion}
    ),
    ranked AS (
      SELECT
        id,
        ROW_NUMBER() OVER (
          PARTITION BY segment_fingerprint
          ORDER BY source_updated_at DESC, captured_at DESC, created_at DESC, id ASC
        ) AS rn
      FROM scoped
    )
    SELECT id FROM ranked WHERE rn = 1
    ORDER BY id ASC
  `);

  return {
    effectiveRevisionIds: effectiveRows.map((r) => r.id),
    ambiguousSegmentFingerprints: [],
  };
}

export function assertSqlPrototypeAmbiguityFailClosedV1(
  result: M3_3HvH4A3_3O1SqlEffectiveSelectionResultV1,
): void {
  if (result.ambiguousSegmentFingerprints.length > 0) {
    throw new H4EvidenceEffectiveRevisionAmbiguityError();
  }
}

export function tsEffectiveRevisionIdsV1(
  revisions: BatteryHvChargeSessionEvidenceRevision[],
): string[] {
  return collapseModeAEffectiveRevisionsV1(revisions)
    .map((r) => r.id)
    .sort();
}

export function sqlEffectiveIdsMatchTsV1(input: {
  sqlIds: string[];
  revisions: BatteryHvChargeSessionEvidenceRevision[];
}): boolean {
  const tsIds = tsEffectiveRevisionIdsV1(input.revisions);
  const sqlSorted = [...input.sqlIds].sort();
  if (sqlSorted.length !== tsIds.length) return false;
  for (let i = 0; i < tsIds.length; i += 1) {
    if (sqlSorted[i] !== tsIds[i]) return false;
  }
  return true;
}

export function detectTsAmbiguityPerSegmentV1(
  revisions: BatteryHvChargeSessionEvidenceRevision[],
): string[] {
  const byFp = new Map<string, BatteryHvChargeSessionEvidenceRevision[]>();
  for (const r of revisions) {
    const list = byFp.get(r.segmentFingerprint) ?? [];
    list.push(r);
    byFp.set(r.segmentFingerprint, list);
  }
  const ambiguous: string[] = [];
  for (const [fp, group] of byFp.entries()) {
    try {
      selectModeAEffectiveRevisionV1(group);
    } catch (e) {
      if (e instanceof H4EvidenceEffectiveRevisionAmbiguityError) {
        ambiguous.push(fp);
      } else {
        throw e;
      }
    }
  }
  return ambiguous.sort();
}
