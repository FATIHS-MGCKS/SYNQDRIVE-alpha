import { describe, expect, it } from 'vitest';
import { taskEntityOptionLabel } from './entity-label.utils';

describe('taskEntityOptionLabel', () => {
  it('returns fallback for missing or UUID labels', () => {
    expect(taskEntityOptionLabel(null, 'Buchung')).toBe('Buchung');
    expect(taskEntityOptionLabel('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', 'Kunde')).toBe('Kunde');
  });

  it('returns human labels unchanged', () => {
    expect(taskEntityOptionLabel('B-2026-0042', 'Buchung')).toBe('B-2026-0042');
    expect(taskEntityOptionLabel('Müller GmbH', 'Kunde')).toBe('Müller GmbH');
  });
});
