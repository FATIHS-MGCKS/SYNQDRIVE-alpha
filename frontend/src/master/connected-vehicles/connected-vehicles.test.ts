import { describe, expect, it } from 'vitest';
import {
  attentionReasonLabel,
  integrationConnectivityTone,
  readCvLocation,
  telemetryFreshnessTone,
  urlToCvQuery,
} from './cv.utils';

describe('connected-vehicles cv.utils', () => {
  it('maps attention reason labels', () => {
    expect(attentionReasonLabel('DIMO_DISCONNECTED')).toBe('DIMO getrennt');
  });

  it('maps status tones from canonical enums', () => {
    expect(integrationConnectivityTone('connected')).toBe('success');
    expect(telemetryFreshnessTone('offline')).toBe('critical');
  });

  it('parses cv location from search params', () => {
    const loc = readCvLocation('?view=vehicles&cvSection=vehicles&vehicleId=abc');
    expect(loc.section).toBe('vehicles');
    expect(loc.vehicleId).toBe('abc');
  });

  it('builds operational query from url state', () => {
    const q = urlToCvQuery({ cvPage: '2', cvAttention: 'true', cvRegistrationState: 'unregistered' });
    expect(q.page).toBe(2);
    expect(q.attention).toBe('true');
    expect(q.registrationState).toBe('unregistered');
  });
});
