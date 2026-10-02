import type { BatteryHvChargeSessionEvidenceRevision } from '@prisma/client';
import { A3_3_MODE_A_EFFECTIVE_REVISION_ORDERING } from './m3-3-hv-h4-a3.constants';
import { H4EvidenceEffectiveRevisionAmbiguityError } from './m3-3-hv-h4-a3-charge-session-evidence.errors.v1';

export type M3_3HvH4ModeAEffectiveRevisionOrderingAuthorityV1 =
  typeof A3_3_MODE_A_EFFECTIVE_REVISION_ORDERING;

function modeAOrderingTuple(
  revision: BatteryHvChargeSessionEvidenceRevision,
): readonly [number, number, number] {
  return [
    revision.sourceUpdatedAt.getTime(),
    revision.capturedAt.getTime(),
    revision.createdAt.getTime(),
  ];
}

function compareOrderingTuple(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): number {
  for (let i = 0; i < 3; i += 1) {
    if (a[i]! < b[i]!) return -1;
    if (a[i]! > b[i]!) return 1;
  }
  return 0;
}

/**
 * MODE_A current/final durable source state per canonical session.
 * Primary: sourceUpdatedAt; secondary: capturedAt; tertiary: revision.createdAt.
 * Equal tuple + differing sourceRevisionFingerprint → fail closed (no fingerprint lex tie-break).
 */
export function selectModeAEffectiveRevisionV1(
  revisions: BatteryHvChargeSessionEvidenceRevision[],
): BatteryHvChargeSessionEvidenceRevision {
  if (revisions.length === 0) {
    throw new Error('selectModeAEffectiveRevisionV1: empty revision set');
  }
  let winner = revisions[0]!;
  let winnerTuple = modeAOrderingTuple(winner);
  for (let i = 1; i < revisions.length; i += 1) {
    const candidate = revisions[i]!;
    const candidateTuple = modeAOrderingTuple(candidate);
    const cmp = compareOrderingTuple(candidateTuple, winnerTuple);
    if (cmp > 0) {
      winner = candidate;
      winnerTuple = candidateTuple;
      continue;
    }
    if (cmp === 0 && candidate.sourceRevisionFingerprint !== winner.sourceRevisionFingerprint) {
      throw new H4EvidenceEffectiveRevisionAmbiguityError();
    }
  }
  return winner;
}

export function groupRevisionsByCanonicalSessionV1(
  revisions: BatteryHvChargeSessionEvidenceRevision[],
): Map<string, BatteryHvChargeSessionEvidenceRevision[]> {
  const groups = new Map<string, BatteryHvChargeSessionEvidenceRevision[]>();
  for (const revision of revisions) {
    const key = revision.segmentFingerprint;
    const list = groups.get(key) ?? [];
    list.push(revision);
    groups.set(key, list);
  }
  return groups;
}

export function collapseModeAEffectiveRevisionsV1(
  revisions: BatteryHvChargeSessionEvidenceRevision[],
): BatteryHvChargeSessionEvidenceRevision[] {
  const groups = groupRevisionsByCanonicalSessionV1(revisions);
  const effective: BatteryHvChargeSessionEvidenceRevision[] = [];
  for (const group of groups.values()) {
    effective.push(selectModeAEffectiveRevisionV1(group));
  }
  return effective;
}
