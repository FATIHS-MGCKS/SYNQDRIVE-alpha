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

function extractDimensionEmphasis(html: string, testId: string): string | null {
  const match = html.match(
    new RegExp(`data-testid="${testId}"[^>]*data-emphasis="([^"]+)"`),
  );
  return match?.[1] ?? null;
}

function sectionHeadingLinkageValid(html: string): boolean {
  const sections = [...html.matchAll(/<section[^>]*aria-labelledby="([^"]+)"[^>]*>([\s\S]*?)<\/section>/g)];
  return sections.every(([, headingId, inner]) => {
    const heading = new RegExp(`<h3[^>]*id="${headingId}"[^>]*>`);
    return heading.test(inner);
  });
}

describe('FleetConnectivityDetailSections', () => {
  it('links section headings via stable aria-labelledby ids', () => {
    const html = renderToStaticMarkup(
      <FleetConnectivityDetailSections detail={mockDetail()} t={t} locale="en" showSupportButton={false} />,
    );

    expect(sectionHeadingLinkageValid(html)).toBe(true);
    expect(html).not.toContain(`aria-labelledby="${en['fleetConnectivity.detail.section.currentState']}"`);
  });

  it('renders drawer variant as single-column layout host', () => {
    const html = renderToStaticMarkup(
      <FleetConnectivityDetailSections
        detail={mockDetail()}
        t={t}
        locale="en"
        showSupportButton={false}
        variant="drawer"
      />,
    );

    expect(html).toContain('data-layout-variant="drawer"');
    expect(html).toContain('data-testid="connectivity-sections-top"');
    expect(html).not.toContain('lg:grid-cols-2');
  });

  it('renders page variant with responsive two-column section groups on desktop', () => {
    const html = renderToStaticMarkup(
      <FleetConnectivityDetailSections
        detail={mockDetail()}
        t={t}
        locale="en"
        showSupportButton={false}
        variant="page"
      />,
    );

    expect(html).toContain('data-layout-variant="page"');
    expect(html).toContain('lg:grid-cols-2');
    expect(html).toContain('data-testid="connectivity-sections-middle"');
  });

  it('uses light text dimensions for OFFLINE + ACTIVE + UNKNOWN + no episode', () => {
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

    expect(extractDimensionEmphasis(html, 'connectivity-dimension-telemetry')).toBe('text');
    expect(extractDimensionEmphasis(html, 'connectivity-dimension-provider')).toBe('text');
    expect(extractDimensionEmphasis(html, 'connectivity-dimension-device')).toBe('text');
    expect(extractDimensionEmphasis(html, 'connectivity-dimension-interruption')).toBe('text');
    expect(html).toContain(en['fleetConnectivity.telemetryFreshness.offline']);
    expect(html).toContain(en['fleetConnectivity.providerLink.ACTIVE']);
    expect(html).toContain(en['fleetConnectivity.physicalDevice.UNKNOWN']);
    expect(html).toContain(en['fleetConnectivity.detail.noActiveInterruption']);
    expect(html).not.toContain(en['fleetConnectivity.telemetryFreshness.live']);
  });

  it('keeps drawer and page variants semantically aligned', () => {
    const detail = mockDetail({
      telemetryState: 'offline',
      providerLinkState: 'ACTIVE',
      physicalDeviceState: 'UNKNOWN',
      activeEpisode: null,
    });
    const drawerHtml = renderToStaticMarkup(
      <FleetConnectivityDetailSections detail={detail} t={t} locale="en" showSupportButton={false} variant="drawer" />,
    );
    const pageHtml = renderToStaticMarkup(
      <FleetConnectivityDetailSections detail={detail} t={t} locale="en" showSupportButton={false} variant="page" />,
    );

    for (const label of [
      en['fleetConnectivity.telemetryFreshness.offline'],
      en['fleetConnectivity.providerLink.ACTIVE'],
      en['fleetConnectivity.physicalDevice.UNKNOWN'],
      en['fleetConnectivity.detail.noActiveInterruption'],
    ]) {
      expect(drawerHtml).toContain(label);
      expect(pageHtml).toContain(label);
    }
  });

  it('uses chip emphasis for active interruption', () => {
    const html = renderToStaticMarkup(
      <FleetConnectivityDetailSections
        detail={mockDetail({
          activeEpisode: {
            episodeId: 'ep-1',
            open: true,
            openedAt: '2026-07-18T09:00:00.000Z',
            durationMs: 3_600_000,
            rentalRelevant: true,
            recoveryMethod: null,
          },
        })}
        t={t}
        locale="en"
        showSupportButton={false}
      />,
    );

    expect(extractDimensionEmphasis(html, 'connectivity-dimension-interruption')).toBe('chip');
  });

  it('uses chip emphasis for provider authorization problems', () => {
    const html = renderToStaticMarkup(
      <FleetConnectivityDetailSections
        detail={mockDetail({
          providerLinkState: 'REAUTH_REQUIRED',
          provider: {
            providerLabel: 'DIMO',
            deviceKind: 'OBD',
            authorizationState: 'REAUTH_REQUIRED',
            consentGranted: false,
            triggerConfigured: true,
            lastSuccessfulFetchAt: null,
          },
        })}
        t={t}
        locale="en"
        showSupportButton={false}
      />,
    );

    expect(extractDimensionEmphasis(html, 'connectivity-dimension-provider')).toBe('chip');
    expect(html).toContain(en['fleetConnectivity.providerLink.REAUTH_REQUIRED']);
  });

  it('renders recommendation and reason as supporting text, not chips', () => {
    const html = renderToStaticMarkup(
      <FleetConnectivityDetailSections detail={mockDetail()} t={t} locale="en" showSupportButton={false} />,
    );

    expect(html).toContain(en['fleetConnectivity.action.REVIEW_CONNECTIVITY']);
    expect(html).toContain('text-muted-foreground');
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

  it('keeps mobile page composition single-column (no forced desktop-only grid at base)', () => {
    const html = renderToStaticMarkup(
      <FleetConnectivityDetailSections detail={mockDetail()} t={t} locale="en" variant="page" showSupportButton={false} />,
    );

    expect(html).toContain('grid-cols-1');
    expect(html).not.toMatch(/grid-cols-[3-9]/);
  });

  it('is used by FleetConnectivityDetailDrawer without duplicating section markup', () => {
    const drawerSrc = FleetConnectivityDetailDrawer.toString();
    expect(drawerSrc).toContain('FleetConnectivityDetailSections');
    expect(drawerSrc).toContain('variant: "drawer"');
    expect(drawerSrc).not.toContain('fleetConnectivity.detail.section.dataAvailability');
  });
});
