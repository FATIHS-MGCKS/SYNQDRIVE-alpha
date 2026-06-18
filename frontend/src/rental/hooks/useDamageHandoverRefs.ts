import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import type { HandoverProtocolDamageRef } from '../lib/damage-pickup-context';
import type { DamageResponse } from '../lib/damage.types';

export function useDamageHandoverRefs(
  orgId: string | undefined,
  damages: DamageResponse[],
): Map<string, HandoverProtocolDamageRef[]> {
  const [map, setMap] = useState<Map<string, HandoverProtocolDamageRef[]>>(new Map());

  const bookingIds = useMemo(
    () =>
      [...new Set(damages.map((d) => d.bookingId).filter((id): id is string => Boolean(id)))],
    [damages],
  );

  useEffect(() => {
    if (!orgId || bookingIds.length === 0) {
      setMap(new Map());
      return;
    }
    let cancelled = false;
    Promise.all(
      bookingIds.map(async (bookingId) => {
        try {
          const protocols = await api.bookings.listHandovers(orgId, bookingId);
          const refs: HandoverProtocolDamageRef[] = (Array.isArray(protocols) ? protocols : []).map(
            (p: { kind?: string; damageIds?: string[] }) => ({
              kind: p.kind === 'RETURN' ? 'RETURN' : 'PICKUP',
              damageIds: Array.isArray(p.damageIds) ? p.damageIds.map(String) : [],
            }),
          );
          return [bookingId, refs] as const;
        } catch {
          return [bookingId, []] as const;
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      setMap(new Map(entries as Array<[string, HandoverProtocolDamageRef[]]>));
    });
    return () => {
      cancelled = true;
    };
  }, [orgId, bookingIds.join('|')]);

  return map;
}
