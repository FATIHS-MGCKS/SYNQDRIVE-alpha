import { DimoProviderRequestPriority } from './dimo-provider-limiter.types';

/**
 * Canonical P1.3-S3 provider request priority taxonomy.
 * Lower rank = higher precedence (0 is highest).
 */
export const DIMO_PROVIDER_PRIORITY_RANK: Record<DimoProviderRequestPriority, number> = {
  [DimoProviderRequestPriority.P0_CRITICAL]: 0,
  [DimoProviderRequestPriority.P1_LIVE]: 1,
  [DimoProviderRequestPriority.P2_INTERACTIVE]: 2,
  [DimoProviderRequestPriority.P3_NORMAL]: 3,
  [DimoProviderRequestPriority.P4_BACKGROUND]: 4,
};

/** Legacy S2 priority strings → canonical S3 priority. */
const LEGACY_PRIORITY_ALIASES: Record<string, DimoProviderRequestPriority> = {
  p1_high: DimoProviderRequestPriority.P1_LIVE,
  p2_normal: DimoProviderRequestPriority.P3_NORMAL,
  p3_background: DimoProviderRequestPriority.P4_BACKGROUND,
};

export function normalizeProviderPriority(
  priority: DimoProviderRequestPriority | string,
): DimoProviderRequestPriority {
  if (Object.values(DimoProviderRequestPriority).includes(priority as DimoProviderRequestPriority)) {
    return priority as DimoProviderRequestPriority;
  }
  const alias = LEGACY_PRIORITY_ALIASES[String(priority)];
  if (alias) return alias;
  return DimoProviderRequestPriority.P3_NORMAL;
}

export function providerPriorityRank(priority: DimoProviderRequestPriority): number {
  return DIMO_PROVIDER_PRIORITY_RANK[normalizeProviderPriority(priority)];
}

export function isLivePriority(priority: DimoProviderRequestPriority): boolean {
  const rank = providerPriorityRank(priority);
  return rank <= DIMO_PROVIDER_PRIORITY_RANK[DimoProviderRequestPriority.P1_LIVE];
}

export function isBackgroundPriority(priority: DimoProviderRequestPriority): boolean {
  return providerPriorityRank(priority) >= DIMO_PROVIDER_PRIORITY_RANK[DimoProviderRequestPriority.P4_BACKGROUND];
}

export function inflightMember(priority: DimoProviderRequestPriority, leaseId: string): string {
  return `${providerPriorityRank(priority)}:${leaseId}`;
}

export function parseInflightMember(member: string): { rank: number; leaseId: string } {
  const sep = member.indexOf(':');
  if (sep <= 0) return { rank: 4, leaseId: member };
  const rank = Number.parseInt(member.slice(0, sep), 10);
  return {
    rank: Number.isFinite(rank) ? rank : 4,
    leaseId: member.slice(sep + 1),
  };
}
