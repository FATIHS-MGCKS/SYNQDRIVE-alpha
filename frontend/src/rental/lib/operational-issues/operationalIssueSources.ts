import type { OperationalIssueSource } from './operationalIssueTypes';

const SOURCE_PRIORITY: Record<OperationalIssueSource['sourceType'], number> = {
  canonical: 1,
  runtime: 2,
  rental_health: 3,
  service_task: 4,
  damage_case: 4,
  booking: 4,
  misuse_case: 4,
  document: 4,
  finance: 4,
  dashboard_insight: 5,
  predictive_insight: 6,
  derived_insight: 7,
  legacy: 8,
};

export function getOperationalIssueSourcePriority(source: OperationalIssueSource): number {
  return SOURCE_PRIORITY[source.sourceType] ?? SOURCE_PRIORITY.legacy;
}

export function choosePrimaryIssueSource(
  sources: Array<OperationalIssueSource | null | undefined>,
): OperationalIssueSource {
  const candidates = sources.filter(Boolean) as OperationalIssueSource[];
  if (candidates.length === 0) return { sourceType: 'legacy' };
  return [...candidates].sort(
    (a, b) =>
      getOperationalIssueSourcePriority(a) - getOperationalIssueSourcePriority(b) ||
      sourceIdentity(a).localeCompare(sourceIdentity(b)),
  )[0];
}

export function mergeIssueSources(
  primary: OperationalIssueSource,
  supporting: OperationalIssueSource[] = [],
): OperationalIssueSource[] {
  return uniqueSources([primary, ...supporting])
    .filter((source) => sourceIdentity(source) !== sourceIdentity(primary))
    .sort(
      (a, b) =>
        getOperationalIssueSourcePriority(a) - getOperationalIssueSourcePriority(b) ||
        sourceIdentity(a).localeCompare(sourceIdentity(b)),
    );
}

export function uniqueSources(sources: OperationalIssueSource[]): OperationalIssueSource[] {
  const seen = new Set<string>();
  const result: OperationalIssueSource[] = [];
  for (const source of sources) {
    const key = sourceIdentity(source);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(source);
  }
  return result;
}

export function sourceIdentity(source: OperationalIssueSource): string {
  return [
    source.sourceType,
    source.sourceId ?? '',
    source.rawType ?? '',
    source.debugLabel ?? '',
  ].join('|');
}
