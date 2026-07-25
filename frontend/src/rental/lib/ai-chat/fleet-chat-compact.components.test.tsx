import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { FleetChatCompactSummaryCard } from '../../components/ai-chat/FleetChatCompactSummaryCard';
import { buildSampleStructuredPayload } from '../../lib/ai-chat/fleet-chat-response-display';

describe('FleetChatCompactSummaryCard', () => {
  const responseTypes = [
    'LOCATION_SUMMARY',
    'HEALTH_SUMMARY',
    'BOOKING_SUMMARY',
    'OVERDUE_EXPLANATION',
    'COMBINED_SUMMARY',
  ] as const;

  for (const responseType of responseTypes) {
    it(`renders compact ${responseType} without wide table markup`, () => {
      const structured = buildSampleStructuredPayload(responseType, {
        dataFreshness: {
          freshness: responseType === 'LOCATION_SUMMARY' ? 'live' : 'unknown',
          observedAt: '2026-07-24T10:00:00.000Z',
          isLastKnown: responseType === 'LOCATION_SUMMARY',
          label: null,
        },
        partial: responseType === 'HEALTH_SUMMARY',
        warnings:
          responseType === 'HEALTH_SUMMARY'
            ? ['Begrenzte Datenlage']
            : [],
        compactSummary: {
          headline: 'Kompakte Zusammenfassung',
          statusTone: responseType === 'OVERDUE_EXPLANATION' ? 'critical' : 'info',
          facts: [
            {
              id: 'sample',
              label: responseType === 'LOCATION_SUMMARY' ? 'Position' : 'Status',
              value: 'B-XY 1234 · Golf 1',
              tone: 'info',
            },
          ],
        },
      });

      const html = renderToStaticMarkup(
        <FleetChatCompactSummaryCard
          structured={structured}
          content={structured.compactSummary?.headline ?? ''}
          isDarkMode={false}
          locale="de"
        />,
      );

      expect(html).toContain('data-testid="fleet-chat-compact-summary"');
      expect(html).toContain(`data-response-type="${responseType}"`);
      expect(html).not.toContain('<table');
      expect(html).toContain('break-all');
      if (responseType === 'LOCATION_SUMMARY') {
        expect(html).toContain('Letzte bekannte Position');
      }
      if (responseType === 'HEALTH_SUMMARY') {
        expect(html).toContain('Begrenzte Datenlage');
      }
    });
  }
});
