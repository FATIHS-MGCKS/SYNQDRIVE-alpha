import { describe, expect, it } from 'vitest';
import type { DeviceConnectionSummary, VehicleConnectivityRuntimeState } from '../../../lib/api';
import { en } from '../../i18n/translations/en';
import type { TranslationKey } from '../../i18n/translations/en';
import {
  buildVehicleConnectivityOverviewView,
  providerLinkPresentationTone,
  shouldShowVehicleConnectivityCard,
  telemetryStateLabel,
} from './vehicle-connectivity-presentation';

const NOW = new Date('2026-08-27T12:00:00.000Z').getTime();

function hoursAgo(h: number): string {
  return new Date(NOW - h * 3_600_000).toISOString();
}

function t(key: TranslationKey, params?: Record<string, string | number>): string {
  let value = en[key] ?? key;
  if (params) {
    for (const [name, replacement] of Object.entries(params)) {
      value = value.replace(`{${name}}`, String(replacement));
    }
  }
  return value;
}

function runtimeFixture(
  overrides: Partial<VehicleConnectivityRuntimeState> = {},
): VehicleConnectivityRuntimeState {
  return {
    vehicleId: 'veh-1',
    organizationId: 'org-1',
    overallState: 'OFFLINE',
    providerLinkState: 'ACTIVE',
    telemetryState: 'offline',
    physicalDeviceState: 'UNKNOWN',
    dataCoverageState: 'GOOD',
    attentionState: 'NONE',
    reasonCodes: ['TELEMETRY_OFFLINE'],
    recommendedAction: 'NONE',
    requiresAction: false,
    lastTelemetryAt: hoursAgo(50),
    lastProviderObservedAt: hoursAgo(50),
    lastReceivedAt: hoursAgo(49),
    deviceBindingId: null,
    activeEpisodeId: null,
    evidence: {},
    calculatedAt: new Date(NOW).toISOString(),
    stateVersion: 1,
    ...overrides,
  };
}

function summaryFixture(
  runtime: VehicleConnectivityRuntimeState,
  overrides: Partial<DeviceConnectionSummary> = {},
): DeviceConnectionSummary {
  return {
    lteR1Capable: true,
    dimoLinked: true,
    lastDeviceUnpluggedAt: null,
    lastDevicePluggedInAt: null,
    currentDeviceConnectionStatus: 'unknown',
    openUnpluggedEpisode: false,
    openUnpluggedSince: null,
    openUnpluggedDurationMs: null,
    severity: null,
    rentalRelevant: false,
    activeBookingId: null,
    webhookConfigured: 'active',
    webhookConfiguration: {} as never,
    lastWebhookReceivedAt: null,
    unpluggedCount24h: 0,
    unpluggedCount7d: 0,
    pluggedCount24h: 0,
    pluggedCount7d: 0,
    recentEvents: [],
    connectivityRuntime: runtime,
    ...overrides,
  };
}

describe('vehicle-connectivity-presentation', () => {
  it('requires connectivityRuntime for card visibility', () => {
    expect(shouldShowVehicleConnectivityCard(null)).toBe(false);
    expect(
      shouldShowVehicleConnectivityCard({
        lteR1Capable: true,
        recentEvents: [],
      } as never),
    ).toBe(false);
    expect(
      shouldShowVehicleConnectivityCard(
        summaryFixture(runtimeFixture()),
      ),
    ).toBe(true);
  });

  it('scenario 1: OFFLINE telemetry + ACTIVE provider + UNKNOWN device + no episode', () => {
    const runtime = runtimeFixture({
      telemetryState: 'offline',
      providerLinkState: 'ACTIVE',
      physicalDeviceState: 'UNKNOWN',
      overallState: 'OFFLINE',
    });
    const summary = summaryFixture(runtime, { openUnpluggedEpisode: false });
    const view = buildVehicleConnectivityOverviewView(summary, runtime, t, 'en', NOW);

    expect(view.primaryTelemetryLabel).toBe('Offline');
    expect(view.primaryTelemetryTone).toBe('critical');
    expect(view.dataSourceText).toContain('DIMO');
    expect(view.dataSourceText).toContain('Authorized');
    expect(view.dataSourceTone).toBe('neutral');
    expect(view.deviceText).toBe('Unknown');
    expect(view.interruptionText).toBe('No active interruption');
    expect(view.dataSourceText).not.toMatch(/verbunden|connected/i);
  });

  it('scenario 2: LIVE telemetry + ACTIVE provider + plugged + no episode', () => {
    const runtime = runtimeFixture({
      telemetryState: 'live',
      providerLinkState: 'ACTIVE',
      physicalDeviceState: 'PLUGGED_CONFIRMED',
      overallState: 'TELEMETRY_ACTIVE',
      lastTelemetryAt: hoursAgo(0.1),
    });
    const summary = summaryFixture(runtime);
    const view = buildVehicleConnectivityOverviewView(summary, runtime, t, 'en', NOW);

    expect(view.primaryTelemetryLabel).toBe('Live');
    expect(view.primaryTelemetryTone).toBe('success');
    expect(view.deviceText).toBe('Device connected');
    expect(view.interruptionText).toBe('No active interruption');
    expect(view.attentionText).toBeNull();
  });

  it('scenario 3: DEVICE_UNPLUGGED with open episode while provider stays ACTIVE', () => {
    const runtime = runtimeFixture({
      overallState: 'DEVICE_UNPLUGGED',
      telemetryState: 'live',
      providerLinkState: 'ACTIVE',
      physicalDeviceState: 'UNPLUGGED_CONFIRMED',
      attentionState: 'ACTION_REQUIRED',
      requiresAction: true,
      recommendedAction: 'CHECK_DEVICE',
      activeEpisodeId: 'ep-1',
    });
    const summary = summaryFixture(runtime, {
      openUnpluggedEpisode: true,
      openUnpluggedSince: hoursAgo(2),
      openUnpluggedDurationMs: 2 * 3_600_000,
      rentalRelevant: true,
    });
    const view = buildVehicleConnectivityOverviewView(summary, runtime, t, 'en', NOW);

    expect(view.deviceText).toBe('Device disconnected');
    expect(view.deviceTone).toBe('critical');
    expect(view.dataSourceText).toContain('Authorized');
    expect(view.dataSourceTone).toBe('neutral');
    expect(view.interruptionText).toContain('Active since');
    expect(view.showRentalRelevantAlert).toBe(true);
    expect(view.recommendedActionText).toBe('Check the device connection');
  });

  it('scenario 4: provider authorization problem is visible independently', () => {
    const runtime = runtimeFixture({
      providerLinkState: 'REAUTH_REQUIRED',
      telemetryState: 'standby',
      overallState: 'AUTHORIZATION_REQUIRED',
      attentionState: 'ACTION_REQUIRED',
      requiresAction: true,
      recommendedAction: 'REAUTHORIZE_PROVIDER',
    });
    const summary = summaryFixture(runtime);
    const view = buildVehicleConnectivityOverviewView(summary, runtime, t, 'en', NOW);

    expect(view.dataSourceText).toContain('Re-authorization required');
    expect(view.dataSourceTone).toBe('warning');
    expect(view.primaryTelemetryLabel).toBe('Standby');
    expect(view.recommendedActionText).toBe('Renew data authorization');
  });

  it('scenario 5: unknown / no telemetry never fabricates connected', () => {
    const runtime = runtimeFixture({
      telemetryState: 'no_signal',
      physicalDeviceState: 'UNKNOWN',
      overallState: 'UNKNOWN',
      lastTelemetryAt: null,
    });
    const summary = summaryFixture(runtime);
    const view = buildVehicleConnectivityOverviewView(summary, runtime, t, 'en', NOW);

    expect(view.primaryTelemetryLabel).toBe('No signal');
    expect(view.lastSignalText).toBe('No data received yet');
    expect(view.deviceText).toBe('Unknown');
    expect(providerLinkPresentationTone('ACTIVE')).toBe('neutral');
  });

  it('uses fleet connectivity telemetry labels in DE and EN', () => {
    const runtime = runtimeFixture({ telemetryState: 'signal_delayed' });
    expect(telemetryStateLabel('signal_delayed', t)).toBe('Signal delayed');
    expect(telemetryStateLabel('offline', (key) => (key.includes('offline') ? 'Offline' : key))).toBe(
      'Offline',
    );
  });
});

describe('VehicleDeviceConnectionCard operator copy guard', () => {
  it('does not ship legacy misleading headline or webhook label in source', async () => {
    const { readFileSync } = await import('node:fs');
    const { dirname, resolve } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const dir = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(dir, './VehicleDeviceConnectionCard.tsx'), 'utf8');

    expect(src).not.toMatch(/DIMO LTE_R1 verbunden/);
    expect(src).not.toMatch(/Status \(Webhook\)/);
    expect(src).toMatch(/connectivityRuntime/);
    expect(src).toMatch(/buildVehicleConnectivityOverviewView/);
    expect(src).toMatch(/vehicleDetail\.connectivity/);
  });
});
