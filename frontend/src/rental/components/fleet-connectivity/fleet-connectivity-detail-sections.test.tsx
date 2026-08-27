import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { FleetConnectivityDetail } from '../../../lib/api';
import { FleetConnectivityDetailSections } from './FleetConnectivityDetailSections';
import { FleetConnectivityDetailDrawer } from './FleetConnectivityDetailDrawer';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import type { TranslationKey } from '../../i18n/translations/en';

function t(key: TranslationKey, params?: Record<string, string | number>): string {
  let value: string = en[key] ?? key;
  if (params) {
    for (const [name, replacement] of Object.entries(params)) {
      value = value.replace(`{${name}}`, String(replacement));
    }
  }
  return value;
}

function mockDetail(overrides: Partial<FleetConnectivityDetail> = {}): FleetConnectivityDetail {
  return {
    vehicle: {
      vehicleId: 'v-1',
      licensePlate: 'B-CS 1',
      make: 'VW',
      model: 'Golf',
      year: 2022,
      station: 'Berlin',
    },
    overallState: 'OFFLINE',
    telemetryState: 'offline',
    attentionState: 'ACTION_REQUIRED',
    lastTelemetryAt: '2026-07-18T10:00:00.000Z',
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
      lastSuccessfulFetchAt: '2026-07-18T11:00:00.000Z',
    },
    capabilities: {
      coverageState: 'PARTIAL',
      coveragePercent: 50,
      freshSignalCount: 1,
      expectedSignalCount: 2,
      signals: [
        { key: 'gps', availability: 'available', freshness: 'stale' },
        { key: 'odometer', availability: 'missing', freshness: 'unknown' },
      ],
    },
    timestamps: {
      lastTelemetryAt: '2026-07-18T10:00:00.000Z',
      lastProviderObservedAt: '2026-07-18T11:00:00.000Z',
      lastReceivedAt: '2026-07-18T11:00:00.000Z',
      calculatedAt: '2026-07-18T12:00:00.000Z',
      reconnectedSince: null,
      recoveryReceivedAt: null,
    },
    webhook: {
      configured: true,
      lastEventAt: null,
      openEpisode: false,
    },
    odometerKm: 12000,
    hasLocation: false,
    ...overrides,
  };
}

describe('FleetConnectivityDetailSections', () => {
  it('renders shared sections with separated connectivity dimensions', () => {
    const html = renderToStaticMarkup(
      <FleetConnectivityDetailSections detail={mockDetail()} t={t} locale="en" showSupportButton={false} />,
    );

    expect(html).toContain('data-testid="fleet-connectivity-detail-sections"');
    expect(html).toContain(en['fleetConnectivity.detail.section.currentState']);
    expect(html).toContain(en['fleetConnectivity.detail.section.dimensions']);
    expect(html).toContain(en['fleetConnectivity.detail.section.dataAvailability']);
    expect(html).toContain(en['fleetConnectivity.detail.section.integration']);
    expect(html).toContain(en['fleetConnectivity.telemetryFreshness.offline']);
    expect(html).toContain(en['fleetConnectivity.providerLink.ACTIVE']);
    expect(html).toContain(en['fleetConnectivity.physicalDevice.UNKNOWN']);
    expect(html).toContain(en['fleetConnectivity.detail.noActiveInterruption']);
    expect(html).toContain(en['fleetConnectivity.action.REVIEW_CONNECTIVITY']);
  });

  it('keeps provider ACTIVE separate from offline telemetry', () => {
    const html = renderToStaticMarkup(
      <FleetConnectivityDetailSections
        detail={mockDetail({
          telemetryState: 'offline',
          providerLinkState: 'ACTIVE',
          physicalDeviceState: 'UNKNOWN',
          activeEpisode: null,
        })}
        t={t}
        locale="en"
        showSupportButton={false}
      />,
    );

    expect(html).toContain(en['fleetConnectivity.telemetryFreshness.offline']);
    expect(html).toContain(en['fleetConnectivity.providerLink.ACTIVE']);
    expect(html).not.toContain(en['fleetConnectivity.telemetryFreshness.live']);
  });

  it('does not treat UNKNOWN physical device as connected', () => {
    const html = renderToStaticMarkup(
      <FleetConnectivityDetailSections
        detail={mockDetail({ physicalDeviceState: 'UNKNOWN' })}
        t={t}
        locale="en"
        showSupportButton={false}
      />,
    );

    expect(html).toContain(en['fleetConnectivity.physicalDevice.UNKNOWN']);
    expect(html).not.toContain(en['fleetConnectivity.physicalDevice.PLUGGED_CONFIRMED']);
  });

  it('uses DE labels when locale is de', () => {
    const deT = (key: TranslationKey, params?: Record<string, string | number>): string => {
      let value: string = de[key] ?? key;
      if (params) {
        for (const [name, replacement] of Object.entries(params)) {
          value = value.replace(`{${name}}`, String(replacement));
        }
      }
      return value;
    };

    const html = renderToStaticMarkup(
      <FleetConnectivityDetailSections detail={mockDetail()} t={deT} locale="de" showSupportButton={false} />,
    );

    expect(html).toContain(de['fleetConnectivity.detail.section.dimensions']);
    expect(html).toContain(de['fleetConnectivity.telemetryFreshness.offline']);
  });

  it('is used by FleetConnectivityDetailDrawer without duplicating section markup', () => {
    const drawerSrc = FleetConnectivityDetailDrawer.toString();
    expect(drawerSrc).toContain('FleetConnectivityDetailSections');
    expect(drawerSrc).not.toContain('fleetConnectivity.detail.section.dataAvailability');
  });
});
