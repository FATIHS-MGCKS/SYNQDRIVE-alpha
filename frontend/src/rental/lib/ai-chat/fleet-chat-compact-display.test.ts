import { describe, expect, it } from 'vitest';
import { buildLocalCompactSummary, shouldCollapseNarrative } from './fleet-chat-compact-display';
import { buildSampleStructuredPayload } from './fleet-chat-response-display';

describe('fleet-chat-compact-display', () => {
  it('collapses narrative when compact facts duplicate headline', () => {
    const structured = buildSampleStructuredPayload('HEALTH_SUMMARY', {
      compactSummary: {
        headline: 'Gesundheitsstatus ist gut.',
        statusTone: 'good',
        facts: [
          { id: 'overall_status', label: 'Gesundheitsstatus', value: 'Gut', tone: 'good' },
          { id: 'limited_data', label: 'Datenabdeckung', value: 'Begrenzte Datenlage', tone: 'warning' },
        ],
      },
    });
    expect(
      shouldCollapseNarrative(structured, 'Gesundheitsstatus ist gut. Weitere Details im Health-Modul.'),
    ).toBe(true);
  });

  it('builds local fallback summary from structured fields', () => {
    const structured = buildSampleStructuredPayload('BOOKING_SUMMARY');
    const local = buildLocalCompactSummary(structured, 'de');
    expect(local?.facts.length).toBeGreaterThan(0);
    expect(local?.facts.some((f) => f.label === 'Datenfrische')).toBe(true);
  });
});
