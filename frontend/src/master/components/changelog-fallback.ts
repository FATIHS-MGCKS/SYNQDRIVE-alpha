/**
 * Shapes and normalization for the Master Admin changelog.
 *
 * This lives beside ChangesView rather than inside it so the view keeps exactly
 * one non-component export: react-refresh/only-export-components fires on every
 * additional one, and the view already spends that budget on FALLBACK_ENTRIES.
 */

/** What the view renders: summaries are always lines. */
export interface ChangelogEntry {
  id: string;
  version: string;
  title: string;
  summary: string[];
  reason: string | null;
  previousBehavior: string | null;
  details: string | null;
  affectsArchitecture: boolean;
  module: string | null;
  createdAt: string;
}

/**
 * Shape of the hand-written fallback list, which is not yet normalized: 48 of
 * its entries end their summary with `.join(' | ')` and so hold one string
 * rather than the lines `ChangelogEntry` promises. Declaring that honestly is
 * what makes the normalization below obviously necessary instead of merely
 * defensive.
 *
 * That mismatch went unnoticed because TypeScript silently stops checking the
 * contents of the literal in ChangesView.tsx: a deliberate type error placed
 * inside it is not reported, while the same error in a small file in the same
 * project is. Do not rely on the compiler to guard entries added there.
 */
export type RawChangelogEntry = Omit<ChangelogEntry, 'summary'> & { summary: string[] | string };

/** One line per string, so a joined summary survives instead of being dropped. */
export function toSummaryLines(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((s) => String(s));
  if (typeof raw === 'string' && raw !== '') return [raw];
  return [];
}

/** Brings the hand-written list to the shape the view renders. */
export function normalizeChangelogEntries(entries: readonly RawChangelogEntry[]): ChangelogEntry[] {
  return entries.map((e) => ({ ...e, summary: toSummaryLines(e.summary) }));
}
