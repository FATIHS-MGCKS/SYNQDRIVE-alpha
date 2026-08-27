import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { FleetConnectivityDetail } from '../../../lib/api';
import { FleetConnectivityDetailSections } from '../fleet-connectivity/FleetConnectivityDetailSections';
import { VehicleConnectivityTab } from './VehicleConnectivityTab';
import {
  VEHICLE_DETAIL_TAB_KEYS,
  VEHICLE_DETAIL_TAB_TRANSLATION_KEYS,
} from '../../lib/vehicle-detail-a11y';
import { en } from '../../i18n/translations/en';
import { de } from '../../i18n/translations/de';
import type { TranslationKey } from '../../i18n/translations/en';
import { buildVehicleConnectivityOverviewView } from './vehicle-connectivity-presentation';
import type { DeviceConnectionSummary, VehicleConnectivityRuntimeState } from '../../../lib/api';

function t(key: TranslationKey, params?: Record<string, string | number>): string {
  let value: string = en[key] ?? key;
  if (params) {
    for (const [name, replacement] of Object.entries(params)) {
      value = value.replace(`{${name}}`, String(replacement));
    }
  }
  return value;
}

function mockDetail(): FleetConnectivityDetail {
  return {
    vehicle: {
      vehicleId: 'v-tab-1',
      licensePlate: 'B-CS 9',
      make: 'VW',
      model: 'ID.3',
      year: 2023,
      station: 'Berlin',
    },
    overallState: 'OFFLINE',
    telemetryState: 'offline',
    attentionState: 'ACTION_REQUIRED',
    lastTelemetryAt: '2026-07-18T08:00:00.000Z',
    primaryReasonCode: 'TELEMETRY_OFFLINE',
    recommendedAction: 'REVIEW_CONNECTIVITY',
    requiresAction: true,
    sortPriority: 5,
    providerLinkState: 'ACTIVE',
    physicalDeviceState: 'UNKNOWN',
    dataCoverageState: 'PARTIAL',
    reasonCodes: ['TELEMETRY_OFFLINE'],
    activeEpisode: null,
    timeline: [],
    provider: {
      providerLabel: 'DIMO',
      deviceKind: 'OBD',
      authorizationState: 'ACTIVE',
      consentGranted: true,
      triggerConfigured: true,
      lastSuccessfulFetchAt: '2026-07-18T09:00:00.000Z',
    },
    capabilities: {
      coverageState: 'PARTIAL',
      coveragePercent: 50,
      freshSignalCount: 1,
      expectedSignalCount: 2,
      signals: [],
    },
    timestamps: {
      lastTelemetryAt: '2026-07-18T08:00:00.000Z',
      lastProviderObservedAt: '2026-07-18T09:00:00.000Z',
      lastReceivedAt: '2026-07-18T09:00:00.000Z',
      calculatedAt: '2026-07-18T12:00:00.000Z',
      reconnectedSince: null,
      recoveryReceivedAt: null,
    },
    webhook: {
      configured: true,
      lastEventAt: null,
      openEpisode: false,
    },
    odometerKm: null,
    hasLocation: false,
  };
}

describe('VehicleConnectivityTab', () => {
  it('registers connectivity in vehicle detail tab keys', () => {
    expect(VEHICLE_DETAIL_TAB_KEYS).toContain('connectivity');
    expect(VEHICLE_DETAIL_TAB_TRANSLATION_KEYS.connectivity).toBe('vehicleDetail.tab.connectivity');
    expect(en['vehicleDetail.tab.connectivity']).toBe('Connectivity');
    expect(de['vehicleDetail.tab.connectivity']).toBe('Konnektivität');
  });

  it('renders tab shell markup', () => {
    const html = renderToStaticMarkup(
      <VehicleConnectivityTab orgId="org-1" vehicleId={null} />,
    );
    expect(html).toBe('');
  });

  it('uses canonical fleet connectivity detail API only', () => {
    const src = VehicleConnectivityTab.toString();
    expect(src).toContain('fleetConnectivityDetail');
    expect(src).not.toContain('deviceConnection');
    expect(src).toContain('FleetConnectivityDetailSections');
  });
});

describe('P1.8B cross-surface offline + active provider + unknown device', () => {
  const runtime: VehicleConnectivityRuntimeState = {
    vehicleId: 'v-tab-1',
    organizationId: 'org-1',
    overallState: 'OFFLINE',
    providerLinkState: 'ACTIVE',
    telemetryState: 'offline',
    physicalDeviceState: 'UNKNOWN',
    dataCoverageState: 'PARTIAL',
    attentionState: 'ACTION_REQUIRED',
    reasonCodes: ['TELEMETRY_OFFLINE'],
    recommendedAction: 'REVIEW_CONNECTIVITY',
    requiresAction: true,
    lastTelemetryAt: '2026-07-18T08:00:00.000Z',
    lastProviderObservedAt: '2026-07-18T09:00:00.000Z',
    lastReceivedAt: '2026-07-18T09:00:00.000Z',
    deviceBindingId: null,
    activeEpisodeId: null,
    evidence: {},
    calculatedAt: '2026-07-18T12:00:00.000Z',
    stateVersion: 1,
  };

  const summary = {
    lteR1Capable: true,
    dimoLinked: true,
    lastDeviceUnpluggedAt: null,
    lastDevicePluggedInAt: null,
    currentDeviceConnectionStatus: 'unknown' as const,
    openUnpluggedEpisode: false,
    openUnpluggedSince: null,
    openUnpluggedDurationMs: null,
    severity: null,
    rentalRelevant: false,
    activeBookingId: null,
    webhookConfigured: 'active' as const,
    webhookConfiguration: {} as never,
    lastWebhookReceivedAt: null,
    unpluggedCount24h: 0,
    unpluggedCount7d: 0,
    pluggedCount24h: 0,
    pluggedCount7d: 0,
    recentEvents: [],
    connectivityRuntime: runtime,
  } satisfies DeviceConnectionSummary;

  it('overview card shows offline telemetry primary', () => {
    const overview = buildVehicleConnectivityOverviewView(summary, runtime, t, 'en');
    expect(overview.primaryTelemetryLabel).toBe(en['fleetConnectivity.telemetryFreshness.offline']);
    expect(overview.dataSourceText).toContain(en['fleetConnectivity.providerLink.ACTIVE']);
    expect(overview.deviceText).toBe(en['fleetConnectivity.physicalDevice.UNKNOWN']);
    expect(overview.interruptionText).toBe(en['vehicleDetail.connectivity.noActiveInterruption']);
  });

  it('detail tab sections show same separated dimensions', () => {
    const detail = mockDetail();
    const html = renderToStaticMarkup(
      <FleetConnectivityDetailSections detail={detail} t={t} locale="en" showSupportButton={false} />,
    );

    expect(html).toContain(en['fleetConnectivity.telemetryFreshness.offline']);
    expect(html).toContain(en['fleetConnectivity.providerLink.ACTIVE']);
    expect(html).toContain(en['fleetConnectivity.physicalDevice.UNKNOWN']);
    expect(html).toContain(en['fleetConnectivity.detail.noActiveInterruption']);
    expect(html).not.toContain(en['fleetConnectivity.telemetryFreshness.live']);
    expect(html).not.toContain(en['fleetConnectivity.physicalDevice.PLUGGED_CONFIRMED']);
  });

  it('recommended action appears when canonical runtime requires action', () => {
    const html = renderToStaticMarkup(
      <FleetConnectivityDetailSections detail={mockDetail()} t={t} locale="en" showSupportButton={false} />,
    );
    expect(html).toContain(en['fleetConnectivity.action.REVIEW_CONNECTIVITY']);
  });
});
