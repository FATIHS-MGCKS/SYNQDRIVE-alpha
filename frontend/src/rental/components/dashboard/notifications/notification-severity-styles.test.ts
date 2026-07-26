import { describe, expect, it } from 'vitest';
import {
  normalizeNotificationSeverity,
  severityBadgeTone,
  severityEntrySurface,
} from './notification-severity-styles';

describe('notification-severity-styles', () => {
  it('normalizes legacy group severities to canonical tokens', () => {
    expect(normalizeNotificationSeverity('overdue')).toBe('critical');
    expect(normalizeNotificationSeverity('attention')).toBe('warning');
    expect(normalizeNotificationSeverity('info')).toBe('info');
  });

  it('uses the same critical surface for critical and overdue', () => {
    const critical = severityEntrySurface('critical', false);
    const overdue = severityEntrySurface('overdue', false);
    expect(overdue).toBe(critical);
  });

  it('uses success tones when resolved', () => {
    expect(severityBadgeTone('critical', true)).toContain('--status-success');
    expect(severityEntrySurface('warning', true)).toContain('--status-success');
  });
});
