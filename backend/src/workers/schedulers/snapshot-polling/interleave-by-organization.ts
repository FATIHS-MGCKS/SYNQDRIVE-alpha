/**
 * Deterministic round-robin interleaving across organizations so one large
 * tenant cannot starve others on every scheduler tick.
 */
export function interleaveByOrganization<T extends { organizationId: string }>(
  items: T[],
): T[] {
  if (items.length <= 1) return items;

  const byOrg = new Map<string, T[]>();
  for (const item of items) {
    const list = byOrg.get(item.organizationId) ?? [];
    list.push(item);
    byOrg.set(item.organizationId, list);
  }

  const orgIds = [...byOrg.keys()].sort();
  const result: T[] = [];
  let round = 0;
  let progressed = true;

  while (progressed) {
    progressed = false;
    for (const orgId of orgIds) {
      const list = byOrg.get(orgId)!;
      if (round < list.length) {
        result.push(list[round]);
        progressed = true;
      }
    }
    round += 1;
  }

  return result;
}
