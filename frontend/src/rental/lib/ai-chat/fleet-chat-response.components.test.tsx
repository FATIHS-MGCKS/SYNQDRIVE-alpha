import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { FLEET_CHAT_RESPONSE_TYPES } from '../../lib/ai-chat/fleet-chat-response.types';
import { FleetChatResponseMetadata } from '../../components/ai-chat/FleetChatResponseMetadata';
import { buildSampleStructuredPayload } from '../../lib/ai-chat/fleet-chat-response-display';

describe('FleetChatResponseMetadata — all response types', () => {
  for (const responseType of FLEET_CHAT_RESPONSE_TYPES) {
    it(`renders ${responseType} with accessible metadata`, () => {
      const structured = buildSampleStructuredPayload(responseType, {
        warnings:
          responseType === 'INCONSISTENT_STATE'
            ? ['Telemetrie und Buchung widersprechen sich.']
            : [],
        partial: responseType === 'PARTIAL_DATA' || responseType === 'TEMPORARY_UNAVAILABLE',
        sources:
          responseType === 'DIRECT_ANSWER'
            ? []
            : [{ label: 'Fahrzeug-Gesundheit' }],
        actions:
          responseType === 'AMBIGUITY_QUESTION'
            ? [{ kind: 'clarify_vehicle', messageDe: 'Bitte Kennzeichen nennen.', messageEn: 'Please specify plate.' }]
            : responseType === 'PERMISSION_RESTRICTED'
              ? [{ kind: 'request_access', messageDe: 'Zugriff anfordern.', messageEn: 'Request access.' }]
              : undefined,
      });

      const html = renderToStaticMarkup(
        <FleetChatResponseMetadata structured={structured} isDarkMode={false} locale="de" />,
      );

      expect(html).toContain('data-testid="fleet-chat-response-metadata"');
      expect(html).toContain(`data-response-type="${responseType}"`);

      if (responseType === 'PERMISSION_RESTRICTED') {
        expect(html).toContain('Fehlende Berechtigung');
      }
      if (responseType === 'AMBIGUITY_QUESTION') {
        expect(html).toContain('Rückfrage');
        expect(html).toContain('Mehrdeutigkeit');
      }
      if (responseType === 'TEMPORARY_UNAVAILABLE') {
        expect(html).toContain('Vorübergehend nicht verfügbar');
      }
      if (responseType === 'INCONSISTENT_STATE') {
        expect(html).toContain('Inkonsistenter Datenstand');
      }
      if (responseType === 'PARTIAL_DATA') {
        expect(html).toContain('Nur Teildaten');
      }
      if (structured.warnings.length > 0) {
        expect(html).toContain('role="alert"');
      }
      expect(html).not.toContain('get_vehicle_');
      expect(html).not.toContain('correlationId');
    });
  }
});
