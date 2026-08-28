import { describe, expect, it } from 'vitest';
import type { ConnectivityDiagnosticAdmin } from '../../lib/api';
import {
  buildConnectivityDiagnosticView,
  relativeAgeLabel,
} from './connectivity-diagnostic.presentation';

const HOUR_MS = 3_600_000;

function diagnostic(
  overrides: Partial<ConnectivityDiagnosticAdmin> = {},
): ConnectivityDiagnosticAdmin {
  return {
    provider: 'DIMO',
    diagnosticState: 'PROVIDER_REACHABLE_DATA_FRESH',
    providerApiReachable: true,
    lastProviderFetchAt: '2026-08-28T11:59:40.000Z',
    lastProviderFetchAgeMs: 20_000,
    lastVehicleObservationAt: '2026-08-28T11:58:00.000Z',
    lastVehicleObservationAgeMs: 120_000,
    observationState: 'live',
    bindingState: 'ACTIVE',
    consentState: 'ACTIVE',
    connectionStatus: 'CONNECTED',
    providerPollScheduled: true,
    deviceBindingRef: 'binding-1',
    providerErrorCategory: null,
    calculatedAt: '2026-08-28T12:00:00.000Z',
    ...overrides,
  };
}

/** KS MX 2024: provider polling healthy, observation frozen ~27h. */
const INCIDENT = diagnostic({
  diagnosticState: 'PROVIDER_REACHABLE_DATA_STALE',
  observationState: 'signal_delayed',
  lastVehicleObservationAt: '2026-08-27T09:00:00.000Z',
  lastVehicleObservationAgeMs: 27 * HOUR_MS,
  lastProviderFetchAgeMs: 20_000,
});

describe('buildConnectivityDiagnosticView', () => {
  it('renders the incident signature headline', () => {
    const view = buildConnectivityDiagnosticView(INCIDENT);

    expect(view.headline).toBe(
      'Provider erreichbar · Fahrzeugdaten seit 27 Std. nicht aktualisiert',
    );
    expect(view.tone).toBe('warning');
  });

  it('renders both timestamps as distinct relative ages', () => {
    const view = buildConnectivityDiagnosticView(INCIDENT);

    expect(view.lastProviderFetchLabel).toBe('vor 20 Sek.');
    expect(view.lastObservationLabel).toBe('vor 27 Std.');
  });

  it('states the symptom without claiming a root cause', () => {
    const view = buildConnectivityDiagnosticView(INCIDENT);

    expect(view.hint).toBe(
      'Provider antwortet, aber das Fahrzeuggerät liefert keine neuen Daten.',
    );

    // We diagnose the symptom; the provider does not expose SIM state.
    const rendered = `${view.headline} ${view.hint}`.toLowerCase();
    expect(rendered).not.toContain('sim');
  });

  it('surfaces the canonical observation state, not the provider fetch', () => {
    const view = buildConnectivityDiagnosticView(INCIDENT);

    expect(view.observationStateLabel).toBe('verzögert (Soft-Offline)');
    expect(view.providerApiLabel).toBe('erreichbar');
  });

  it('labels a healthy vehicle without a diagnostic hint', () => {
    const view = buildConnectivityDiagnosticView(diagnostic());

    expect(view.headline).toBe('Provider erreichbar · Fahrzeugdaten aktuell');
    expect(view.tone).toBe('success');
    expect(view.hint).toBeNull();
  });

  it('distinguishes an unreachable provider from a stale observation', () => {
    const view = buildConnectivityDiagnosticView(
      diagnostic({
        diagnosticState: 'PROVIDER_UNREACHABLE',
        providerApiReachable: false,
        lastProviderFetchAgeMs: 26 * HOUR_MS,
        observationState: 'signal_delayed',
      }),
    );

    expect(view.headline).toBe('Provider nicht erreichbar');
    expect(view.tone).toBe('critical');
    expect(view.providerApiLabel).toBe('nicht erreichbar');
  });

  it('does not blame the provider when our own polling could be paused', () => {
    const view = buildConnectivityDiagnosticView(
      diagnostic({
        diagnosticState: 'PROVIDER_UNREACHABLE',
        providerApiReachable: false,
        lastProviderFetchAgeMs: 26 * HOUR_MS,
      }),
    );

    // A paused worker/queue produces the same frozen providerFetchedAt as a
    // provider outage, so the hint must name both possibilities.
    expect(view.hint).toContain('Worker/Queue');
    expect(view.hint).toContain('eigenen Abfrage');
  });

  it('explains a stale provider fetch for a vehicle that is never polled', () => {
    const view = buildConnectivityDiagnosticView(
      diagnostic({
        diagnosticState: 'UNKNOWN',
        providerApiReachable: false,
        lastProviderFetchAgeMs: 26 * HOUR_MS,
        providerPollScheduled: false,
        observationState: 'offline',
      }),
    );

    expect(view.providerPollScheduledLabel).toBe('nicht geplant');
    expect(view.hint).toContain('kein Provider-Ausfall');
  });

  it('keeps the generic hint when poll scheduling is unknown', () => {
    const view = buildConnectivityDiagnosticView(
      diagnostic({ diagnosticState: 'UNKNOWN', providerPollScheduled: null }),
    );

    expect(view.providerPollScheduledLabel).toBe('unbekannt');
    expect(view.hint).toBe('Nicht genügend Diagnosedaten für eine Einordnung.');
  });

  it('reports a broken grant chain', () => {
    const view = buildConnectivityDiagnosticView(
      diagnostic({
        diagnosticState: 'AUTH_OR_BINDING_ERROR',
        bindingState: 'INACTIVE',
        consentState: 'INACTIVE',
        providerErrorCategory: 'PROVIDER_REVOKED',
      }),
    );

    expect(view.headline).toBe('Authorisierung oder Bindung fehlerhaft');
    expect(view.tone).toBe('critical');
    expect(view.bindingLabel).toBe('inaktiv');
    expect(view.consentLabel).toBe('inaktiv');
    expect(view.providerErrorCategory).toBe('PROVIDER_REVOKED');
  });

  it('handles missing evidence without inventing values', () => {
    const view = buildConnectivityDiagnosticView(
      diagnostic({
        diagnosticState: 'UNKNOWN',
        provider: null,
        providerApiReachable: null,
        lastProviderFetchAt: null,
        lastProviderFetchAgeMs: null,
        lastVehicleObservationAt: null,
        lastVehicleObservationAgeMs: null,
        observationState: 'no_signal',
        providerPollScheduled: null,
        deviceBindingRef: null,
      }),
    );

    expect(view.providerLabel).toBe('keine Datenquelle');
    expect(view.providerPollScheduledLabel).toBe('unbekannt');
    expect(view.providerApiLabel).toBe('unbekannt');
    expect(view.lastProviderFetchLabel).toBe('unbekannt');
    expect(view.lastObservationLabel).toBe('unbekannt');
    expect(view.observationStateLabel).toBe('kein Signal');
  });
});

describe('relativeAgeLabel', () => {
  it('scales units from seconds to days', () => {
    expect(relativeAgeLabel(20_000)).toBe('vor 20 Sek.');
    expect(relativeAgeLabel(5 * 60_000)).toBe('vor 5 Min.');
    expect(relativeAgeLabel(27 * HOUR_MS)).toBe('vor 27 Std.');
    expect(relativeAgeLabel(72 * HOUR_MS)).toBe('vor 3 Tg.');
  });

  it('returns unknown for absent ages', () => {
    expect(relativeAgeLabel(null)).toBe('unbekannt');
  });
});
