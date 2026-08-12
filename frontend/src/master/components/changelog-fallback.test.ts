import { describe, expect, it } from 'vitest';

import { FALLBACK_ENTRIES, normalizeFallbackEntries } from './ChangesView';

describe('changelog fallback list', () => {
  it('normalizes joined summaries into lines instead of crashing the view', () => {
    const joined = FALLBACK_ENTRIES.filter((e) => typeof e.summary === 'string');
    expect(joined.length).toBeGreaterThan(0);

    const normalized = normalizeFallbackEntries();
    expect(normalized).toHaveLength(FALLBACK_ENTRIES.length);
    expect(normalized.every((e) => Array.isArray(e.summary))).toBe(true);

    // Content must survive: a joined summary becomes one line, not an empty list.
    const sample = normalized.find((e) => e.id === joined[0]!.id);
    expect(sample?.summary).toEqual([joined[0]!.summary]);
  });

  it('carries the public landing page entry', () => {
    const entry = normalizeFallbackEntries().find((e) => e.version === '4.9.895');
    expect(entry?.module).toBe('Public Website');
    expect(entry?.affectsArchitecture).toBe(true);
    expect(entry?.summary.length).toBeGreaterThan(0);
  });
});
