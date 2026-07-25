import { describe, expect, it } from 'vitest';
import {
  buildSampleStructuredPayload,
  containsInternalId,
  fleetChatResponseTypeLabel,
  formatFleetDataAgeLabel,
  mapProgressContent,
  sanitizeSourceLabel,
  sanitizeUserVisibleText,
} from './fleet-chat-response-display';
import { FLEET_CHAT_RESPONSE_TYPES } from './fleet-chat-response.types';

describe('fleetChatResponseTypeLabel', () => {
  it('covers all response types in DE and EN', () => {
    for (const type of FLEET_CHAT_RESPONSE_TYPES) {
      expect(fleetChatResponseTypeLabel(type, 'de')).toBeTruthy();
      expect(fleetChatResponseTypeLabel(type, 'en')).toBeTruthy();
    }
  });
});

describe('sanitizeSourceLabel', () => {
  it('never exposes internal tool names', () => {
    expect(sanitizeSourceLabel('get_vehicle_health_summary', 'de')).toBe('Flottendaten');
    expect(sanitizeSourceLabel('Vehicle health summary (domain tool)', 'de')).toBe(
      'Vehicle health summary',
    );
  });
});

describe('formatFleetDataAgeLabel', () => {
  it('formats observedAt in a user-friendly way', () => {
    const label = formatFleetDataAgeLabel(
      {
        freshness: 'live',
        observedAt: '2026-07-24T10:00:00.000Z',
        isLastKnown: false,
        label: null,
      },
      'de',
    );
    expect(label).toContain('Daten vom');
    expect(label).toContain('Live');
  });

  it('prefers backend label when present', () => {
    expect(
      formatFleetDataAgeLabel(
        {
          freshness: 'unknown',
          observedAt: null,
          isLastKnown: true,
          label: 'Standby seit 2 Stunden',
        },
        'de',
      ),
    ).toBe('Standby seit 2 Stunden');
  });
});

describe('mapProgressContent', () => {
  it('maps internal tool progress types to readable labels', () => {
    expect(mapProgressContent('tools', 'get_vehicle_location')).toContain('Flottendaten');
    expect(mapProgressContent('thinking', '')).toContain('analysiert');
  });
});

describe('sanitizeUserVisibleText', () => {
  it('redacts bearer tokens', () => {
    const out = sanitizeUserVisibleText('Error Bearer sk-secret123 token');
    expect(out).not.toContain('sk-secret123');
    expect(out).toContain('[redacted]');
  });
});

describe('buildSampleStructuredPayload', () => {
  it('builds payloads for every response type', () => {
    for (const type of FLEET_CHAT_RESPONSE_TYPES) {
      const payload = buildSampleStructuredPayload(type);
      expect(payload.responseType).toBe(type);
      expect(containsInternalId(payload.vehicle?.licensePlate ?? '')).toBe(false);
    }
  });
});
