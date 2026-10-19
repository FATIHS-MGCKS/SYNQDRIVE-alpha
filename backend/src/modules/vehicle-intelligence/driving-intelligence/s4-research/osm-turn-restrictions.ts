import type { RawOsmWay } from './osm-parse';

export type ParsedTurnRestrictionRelation = {
  relationId: number;
  restrictionTag: string;
  fromWayId: number | null;
  toWayId: number | null;
  viaNodeIds: number[];
  parseStatus: 'COMPLETE_FROM_TO_VIA' | 'INCOMPLETE_MEMBERS';
};

export type TurnRestrictionIndex = {
  relationsTotal: number;
  relationsWithFromToVia: number;
  relationsInCorridor: number;
  relationsAppliedAsForbidden: number;
  relationsOnlyStarMarkedUnknown: number;
  relationsUnsupported: number;
  /** `${viaNodeId}:${fromWayId}:${toWayId}` */
  forbiddenTurnKeys: Set<string>;
  /** via nodes where an only_* relation is present but not fully enforced */
  onlyRestrictionViaNodes: Set<number>;
};

const NO_RESTRICTION_PREFIX = 'no_';

function isNoRestriction(tag: string): boolean {
  return tag.startsWith(NO_RESTRICTION_PREFIX);
}

function isOnlyRestriction(tag: string): boolean {
  return tag.startsWith('only_');
}

export function parseTurnRestrictionRelations(
  overpassBody: { elements?: Array<Record<string, unknown>> },
  corridorWayIds: Set<number>,
): { parsed: ParsedTurnRestrictionRelation[]; index: TurnRestrictionIndex } {
  const parsed: ParsedTurnRestrictionRelation[] = [];
  const forbiddenTurnKeys = new Set<string>();
  const onlyRestrictionViaNodes = new Set<number>();
  let relationsWithFromToVia = 0;
  let relationsInCorridor = 0;
  let relationsAppliedAsForbidden = 0;
  let relationsOnlyStarMarkedUnknown = 0;
  let relationsUnsupported = 0;

  for (const el of overpassBody.elements ?? []) {
    if (String(el.type ?? '') !== 'relation') continue;
    const tags = (el.tags as Record<string, string>) ?? {};
    if (tags.type !== 'restriction') continue;
    const restrictionTag = tags.restriction ?? '';
    const members = (el.members as Array<{ type?: string; ref?: number; role?: string }>) ?? [];
    let fromWayId: number | null = null;
    let toWayId: number | null = null;
    const viaNodeIds: number[] = [];
    for (const m of members) {
      const role = m.role ?? '';
      if (role === 'from' && m.type === 'way') fromWayId = Number(m.ref);
      else if (role === 'to' && m.type === 'way') toWayId = Number(m.ref);
      else if (role === 'via' && m.type === 'node') viaNodeIds.push(Number(m.ref));
    }
    const complete = fromWayId != null && toWayId != null && viaNodeIds.length > 0;
    const row: ParsedTurnRestrictionRelation = {
      relationId: Number(el.id),
      restrictionTag,
      fromWayId,
      toWayId,
      viaNodeIds,
      parseStatus: complete ? 'COMPLETE_FROM_TO_VIA' : 'INCOMPLETE_MEMBERS',
    };
    parsed.push(row);
    if (!complete) {
      relationsUnsupported += 1;
      continue;
    }
    relationsWithFromToVia += 1;
    const inCorridor =
      corridorWayIds.has(fromWayId!) || corridorWayIds.has(toWayId!);
    if (inCorridor) relationsInCorridor += 1;

    if (isNoRestriction(restrictionTag)) {
      for (const via of viaNodeIds) {
        forbiddenTurnKeys.add(`${via}:${fromWayId}:${toWayId}`);
      }
      relationsAppliedAsForbidden += 1;
    } else if (isOnlyRestriction(restrictionTag)) {
      for (const via of viaNodeIds) onlyRestrictionViaNodes.add(via);
      relationsOnlyStarMarkedUnknown += 1;
    } else {
      relationsUnsupported += 1;
    }
  }

  return {
    parsed,
    index: {
      relationsTotal: parsed.length,
      relationsWithFromToVia,
      relationsInCorridor,
      relationsAppliedAsForbidden,
      relationsOnlyStarMarkedUnknown,
      relationsUnsupported,
      forbiddenTurnKeys,
      onlyRestrictionViaNodes,
    },
  };
}

export function isTurnForbidden(
  index: TurnRestrictionIndex,
  viaNodeId: number,
  fromWayId: number,
  toWayId: number,
): boolean {
  return index.forbiddenTurnKeys.has(`${viaNodeId}:${fromWayId}:${toWayId}`);
}

export function isOnlyRestrictionJunction(index: TurnRestrictionIndex, viaNodeId: number): boolean {
  return index.onlyRestrictionViaNodes.has(viaNodeId);
}
