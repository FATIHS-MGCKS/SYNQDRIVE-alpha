import { describe, expect, it, vi } from 'vitest';

import {
  classifyCommunicationTimestamp,
  formatCommunicationTimestamp,
} from './format';

const t = (key: 'communication.time.yesterday') =>
  key === 'communication.time.yesterday' ? 'Yesterday' : key;

describe('communication timestamp formatting', () => {
  it('formats same-day timestamps as local time', () => {
    const now = new Date('2026-08-22T15:00:00');
    const parts = classifyCommunicationTimestamp('2026-08-22T10:30:00.000Z', now);
    expect(parts.kind).toBe('today');
    expect(formatCommunicationTimestamp('2026-08-22T10:30:00.000Z', 'en-US', t, now)).toMatch(
      /\d{1,2}:\d{2}/,
    );
  });

  it('formats yesterday across month boundary via i18n', () => {
    const now = new Date('2026-03-01T12:00:00');
    const parts = classifyCommunicationTimestamp('2026-02-28T18:00:00.000Z', now);
    expect(parts.kind).toBe('yesterday');
    expect(formatCommunicationTimestamp('2026-02-28T18:00:00.000Z', 'fr-FR', t, now)).toBe(
      'Yesterday',
    );
  });

  it('formats previous-year dates with year', () => {
    const now = new Date('2026-01-02T12:00:00');
    const parts = classifyCommunicationTimestamp('2025-12-31T18:00:00.000Z', now);
    expect(parts.kind).toBe('other_year');
    expect(
      formatCommunicationTimestamp('2025-12-31T18:00:00.000Z', 'en-US', t, now),
    ).toContain('25');
  });

  it('returns empty string for invalid ISO', () => {
    expect(classifyCommunicationTimestamp('not-a-date').kind).toBe('invalid');
    expect(formatCommunicationTimestamp('not-a-date', 'en-US', t)).toBe('');
  });
});
