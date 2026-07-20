import type { ApiServiceCaseListItem } from './types';

export function mergeServiceCaseListPages(
  existing: ApiServiceCaseListItem[],
  nextPage: ApiServiceCaseListItem[],
): ApiServiceCaseListItem[] {
  if (nextPage.length === 0) return existing;
  const seen = new Set(existing.map((row) => row.id));
  const merged = [...existing];
  for (const row of nextPage) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    merged.push(row);
  }
  return merged;
}

export function replaceServiceCaseListFirstPage(
  _existing: ApiServiceCaseListItem[],
  firstPage: ApiServiceCaseListItem[],
): ApiServiceCaseListItem[] {
  return [...firstPage];
}
