/**
 * P1.8C — Connectivity cross-surface / UI certification.
 *
 * Proves that the SAME canonical connectivity runtime produces semantically
 * consistent output across:
 *  1. Fleet list/map connectivity presentation
 *  2. Fleet Connectivity detail drawer (shared sections, drawer variant)
 *  3. Vehicle Detail Overview connectivity card
 *  4. Vehicle Detail Connectivity tab (shared sections, page variant)
 *  5. Vehicle Detail header connectivity badge
 *
 * Certification compares semantic projection outputs — not pixels.
 * No production semantics are re-derived here; every surface consumes the
 * canonical runtime / fleet-connectivity detail contract.
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type {
  ConnectivityAttentionState,
  ConnectivityReasonCode,
  ConnectivityRecommendedAction,
  DeviceConnectionSummary,
  FleetConnectivityDetail,
  FleetConnectivityTimelineEvent,
  FleetDataCoverageState,
  FleetTelemetryFreshness,
  OverallConnectivityState,
  PhysicalDeviceState,
  ProviderLinkState,
  VehicleConnectivityRuntimeState,
} from '../../lib/api';
import { FleetConnectivityDetailSections } from '../components/fleet-connectivity/FleetConnectivityDetailSections';
import {
  attentionTone,
  overallStateLabel,
  overallStateTone,
  physicalDeviceLabel,
  physicalDevicePresentationTone,
  providerLinkLabel,
  providerLinkPresentationTone,
  recommendedActionLabel,
  telemetryFreshnessLabel,
  telemetryFreshnessTone,
} from '../components/fleet-connectivity/fleet-connectivity.presentation';
import { buildVehicleConnectivityOverviewView } from '../components/vehicle-detail/vehicle-connectivity-presentation';
import { shouldShowObdUnpluggedBadge } from './obd-plug-status';
import { resolveVehicleDetailConnectivityPresentation } from './vehicle-detail-operational-display';
import { resolveFleetVehicleDisplayState } from './fleetVehicleDisplay';
import { buildFleetVehicleUiProjection, type FleetProjectionVehicle } from './fleet-vehicle-ui-projection';
import type { VehicleData } from '../data/vehicles';
import { de } from '../i18n/translations/de';
import { en } from '../i18n/translations/en';
import type { TranslationKey } from '../i18n/translations/en';

const NOW = new Date('2026-08-20T12:00:00.000Z').getTime();

function minutesAgo(m: number): string {
  return new Date(NOW - m * 60_000).toISOString();
}

function hoursAgo(h: number): string {
  return new Date(NOW - h * 3_600_000).toISOString();
}

function makeT(dict: typeof en | typeof de) {
  return (key: TranslationKey, params?: Record<string, string | number>): string => {
    let value: string = dict[key] ?? key;
    if (params) {
      for (const [name, replacement] of Object.entries(params)) {
        value = value.replace(`{${name}}`, String(replacement));
      }
    }
    return value;
  };
}

const tEn = makeT(en);
const tDe = makeT(de);

/** One canonical scenario spec drives ALL surface fixtures deterministically. */
interface CanonicalScenarioSpec {
  overallState: OverallConnectivityState;
  telemetryState: FleetTelemetryFreshness;
  providerLinkState: ProviderLinkState;
  physicalDeviceState: PhysicalDeviceState;
  attentionState: ConnectivityAttentionState;
  recommendedAction?: ConnectivityRecommendedAction;
  requiresAction?: boolean;
  primaryReasonCode?: ConnectivityReasonCode | null;
  dataCoverageState?: FleetDataCoverageState;
  lastTelemetryAt?: string | null;
  openEpisode?: boolean;
  episodeOpenedAt?: string | null;
  episodeDurationMs?: number | null;
  timeline?: FleetConnectivityTimelineEvent[];
}

interface ScenarioFixtures {
  runtime: VehicleConnectivityRuntimeState;
  detail: FleetConnectivityDetail;
  summary: DeviceConnectionSummary;
  vehicle: FleetProjectionVehicle;
}

function buildConnectivityScenario(spec: CanonicalScenarioSpec): ScenarioFixtures {
  const lastTelemetryAt =
    spec.lastTelemetryAt === undefined ? minutesAgo(5) : spec.lastTelemetryAt;
  const recommendedAction = spec.recommendedAction ?? 'NONE';
  const requiresAction = spec.requiresAction ?? recommendedAction !== 'NONE';
  const openEpisode = spec.openEpisode ?? false;
  const episodeOpenedAt = spec.episodeOpenedAt ?? (openEpisode ? hoursAgo(2) : null);
  const episodeDurationMs = spec.episodeDurationMs ?? (openEpisode ? 2 * 3_600_000 : null);

  const runtime: VehicleConnectivityRuntimeState = {
    vehicleId: 'v-cert-1',
    organizationId: 'org-cert',
    overallState: spec.overallState,
    providerLinkState: spec.providerLinkState,
    telemetryState: spec.telemetryState,
    physicalDeviceState: spec.physicalDeviceState,
    dataCoverageState: spec.dataCoverageState ?? 'GOOD',
    attentionState: spec.attentionState,
    reasonCodes: spec.primaryReasonCode ? [spec.primaryReasonCode] : [],
    recommendedAction,
    requiresAction,
    lastTelemetryAt,
    lastProviderObservedAt: lastTelemetryAt,
    lastReceivedAt: lastTelemetryAt,
    deviceBindingId: null,
    activeEpisodeId: openEpisode ? 'ep-cert-1' : null,
    evidence: openEpisode ? { openUnpluggedEpisode: true } : {},
    calculatedAt: new Date(NOW).toISOString(),
    stateVersion: 1,
  };

  const detail: FleetConnectivityDetail = {
    vehicle: {
      vehicleId: 'v-cert-1',
      licensePlate: 'B-CERT 1',
      make: 'VW',
      model: 'ID.4',
      year: 2024,
      station: 'Berlin',
    },
    overallState: spec.overallState,
    telemetryState: spec.telemetryState,
    attentionState: spec.attentionState,
    lastTelemetryAt,
    primaryReasonCode: spec.primaryReasonCode ?? null,
    recommendedAction,
    requiresAction,
    sortPriority: 5,
    providerLinkState: spec.providerLinkState,
    physicalDeviceState: spec.physicalDeviceState,
    dataCoverageState: spec.dataCoverageState ?? 'GOOD',
    reasonCodes: spec.primaryReasonCode ? [spec.primaryReasonCode] : [],
    activeEpisode: openEpisode
      ? {
          episodeId: 'ep-cert-1',
          open: true,
          openedAt: episodeOpenedAt,
          durationMs: episodeDurationMs,
          rentalRelevant: false,
          recoveryMethod: null,
        }
      : null,
    timeline: spec.timeline ?? [],
    provider: {
      providerLabel: 'DIMO',
      deviceKind: 'OBD',
      authorizationState: spec.providerLinkState,
      consentGranted: spec.providerLinkState === 'ACTIVE',
      triggerConfigured: true,
      lastSuccessfulFetchAt: lastTelemetryAt,
    },
    capabilities: {
      coverageState: spec.dataCoverageState ?? 'GOOD',
      coveragePercent: 100,
      freshSignalCount: 2,
      expectedSignalCount: 2,
      signals: [
        { key: 'gps', availability: 'available', freshness: 'fresh' },
        { key: 'odometer', availability: 'available', freshness: 'fresh' },
      ],
    },
    timestamps: {
      lastTelemetryAt,
      lastProviderObservedAt: lastTelemetryAt,
      lastReceivedAt: lastTelemetryAt,
      calculatedAt: new Date(NOW).toISOString(),
      reconnectedSince: null,
      recoveryReceivedAt: null,
    },
    webhook: {
      configured: true,
      lastEventAt: null,
      openEpisode,
    },
    odometerKm: 12000,
    hasLocation: true,
  };

  const summary: DeviceConnectionSummary = {
    lteR1Capable: true,
    dimoLinked: true,
    lastDeviceUnpluggedAt: openEpisode ? episodeOpenedAt : null,
    lastDevicePluggedInAt: null,
    currentDeviceConnectionStatus: 'unknown',
    openUnpluggedEpisode: openEpisode,
    openUnpluggedSince: episodeOpenedAt,
    openUnpluggedDurationMs: episodeDurationMs,
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
  };

  const baseVehicle: VehicleData = {
    id: 'v-cert-1',
    license: 'B-CERT 1',
    model: 'ID.4',
    year: 2024,
    station: 'Berlin',
    fuelType: 'Electric',
    status: 'AVAILABLE',
    cleaningStatus: 'Clean',
    healthStatus: 'Good Health',
    online: true,
    lastSignal: lastTelemetryAt ?? '',
    badge: 0,
    odometer: 12000,
    fuel: 0,
    battery: 80,
    speed: 0,
    coolant: 0,
    brakes: 0,
    tires: 0,
    engineOil: 0,
    isElectric: true,
    hvBatteryCapacityKwh: null,
    leasingRate: '0',
    insuranceCost: '0',
    taxCost: '0',
    totalMonthlyCost: '0',
    lat: 52.5,
    lng: 13.4,
    signalAgeMs: lastTelemetryAt ? NOW - Date.parse(lastTelemetryAt) : Number.MAX_SAFE_INTEGER,
    operationalAvailability: { state: 'AVAILABLE', generatedAt: new Date(NOW).toISOString() },
  };

  const vehicle: FleetProjectionVehicle = {
    ...baseVehicle,
    connectivityRuntime: runtime,
  };

  return { runtime, detail, summary, vehicle };
}

interface SurfaceProjection {
  fleetTelemetryStatus: string;
  headerLabel: string;
  headerTone: string;
  overviewPrimaryLabel: string;
  overviewDeviceText: string;
  overviewInterruptionText: string;
  overviewDataSourceText: string;
  drawerHtml: string;
  pageHtml: string;
}

function projectAllSurfaces(
  fixtures: ScenarioFixtures,
  locale: 'en' | 'de' = 'en',
): SurfaceProjection {
  const t = locale === 'de' ? tDe : tEn;
  const ui = buildFleetVehicleUiProjection(fixtures.vehicle, { locale });
  const fleet = resolveFleetVehicleDisplayState(fixtures.vehicle, {
    now: NOW,
    uiProjection: ui,
  });
  const header = resolveVehicleDetailConnectivityPresentation(fixtures.vehicle, {
    locale,
    now: NOW,
  });
  const overview = buildVehicleConnectivityOverviewView(
    fixtures.summary,
    fixtures.runtime,
    t,
    locale,
    NOW,
  );
  const drawerHtml = renderToStaticMarkup(
    <FleetConnectivityDetailSections
      detail={fixtures.detail}
      t={t}
      locale={locale}
      showSupportButton={false}
      variant="drawer"
    />,
  );
  const pageHtml = renderToStaticMarkup(
    <FleetConnectivityDetailSections
      detail={fixtures.detail}
      t={t}
      locale={locale}
      showSupportButton={false}
      variant="page"
    />,
  );

  return {
    fleetTelemetryStatus: fleet.telemetryStatus,
    headerLabel: header.shortLabel,
    headerTone: header.tone,
    overviewPrimaryLabel: overview.primaryTelemetryLabel,
    overviewDeviceText: overview.deviceText,
    overviewInterruptionText: overview.interruptionText,
    overviewDataSourceText: overview.dataSourceText,
    drawerHtml,
    pageHtml,
  };
}

function expectDimensionsInSharedSections(
  html: string,
  dict: typeof en | typeof de,
  spec: {
    telemetry: FleetTelemetryFreshness;
    provider: ProviderLinkState;
    device: PhysicalDeviceState;
    interruption: 'none' | 'active';
  },
) {
  expect(html).toContain(
    `>${dict[`fleetConnectivity.telemetryFreshness.${spec.telemetry}` as TranslationKey]}<`,
  );
  expect(html).toContain(
    `>${dict[`fleetConnectivity.providerLink.${spec.provider}` as TranslationKey]}<`,
  );
  expect(html).toContain(
    `>${dict[`fleetConnectivity.physicalDevice.${spec.device}` as TranslationKey]}<`,
  );
  if (spec.interruption === 'none') {
    expect(html).toContain(`>${dict['fleetConnectivity.detail.noActiveInterruption']}<`);
  } else {
    expect(html).not.toContain(`>${dict['fleetConnectivity.detail.noActiveInterruption']}<`);
    expect(html).toMatch(/data-testid="connectivity-dimension-interruption"[^>]*data-emphasis="chip"/);
  }
}

describe('P1.8C — scenario matrix A–I across all surfaces', () => {
  it('A — LIVE + ACTIVE + PLUGGED_CONFIRMED + no episode + NONE: healthy everywhere', () => {
    const fx = buildConnectivityScenario({
      overallState: 'TELEMETRY_ACTIVE',
      telemetryState: 'live',
      providerLinkState: 'ACTIVE',
      physicalDeviceState: 'PLUGGED_CONFIRMED',
      attentionState: 'NONE',
    });
    const p = projectAllSurfaces(fx);

    expect(p.fleetTelemetryStatus).toBe('live');
    expect(p.headerLabel).toBe(en['fleetConnectivity.telemetryFreshness.live']);
    expect(p.headerTone).toBe('success');
    expect(p.overviewPrimaryLabel).toBe(en['fleetConnectivity.telemetryFreshness.live']);
    expect(p.overviewDeviceText).toBe(en['fleetConnectivity.physicalDevice.PLUGGED_CONFIRMED']);
    expect(p.overviewInterruptionText).toBe(en['fleetConnectivity.detail.noActiveInterruption']);

    for (const html of [p.drawerHtml, p.pageHtml]) {
      expectDimensionsInSharedSections(html, en, {
        telemetry: 'live',
        provider: 'ACTIVE',
        device: 'PLUGGED_CONFIRMED',
        interruption: 'none',
      });
    }
  });

  it('B — STANDBY + ACTIVE + UNKNOWN + no episode + NONE: no critical offline anywhere', () => {
    const fx = buildConnectivityScenario({
      overallState: 'STANDBY',
      telemetryState: 'standby',
      providerLinkState: 'ACTIVE',
      physicalDeviceState: 'UNKNOWN',
      attentionState: 'NONE',
      lastTelemetryAt: hoursAgo(3),
    });
    const p = projectAllSurfaces(fx);

    expect(p.fleetTelemetryStatus).toBe('standby');
    expect(p.headerLabel).toBe(en['fleetConnectivity.telemetryFreshness.standby']);
    expect(p.headerTone).not.toBe('critical');
    expect(p.overviewPrimaryLabel).toBe(en['fleetConnectivity.telemetryFreshness.standby']);
    expect(p.overviewDeviceText).toBe(en['fleetConnectivity.physicalDevice.UNKNOWN']);
    expect(p.overviewDataSourceText).toContain(en['fleetConnectivity.providerLink.ACTIVE']);

    for (const html of [p.drawerHtml, p.pageHtml]) {
      expectDimensionsInSharedSections(html, en, {
        telemetry: 'standby',
        provider: 'ACTIVE',
        device: 'UNKNOWN',
        interruption: 'none',
      });
      expect(html).not.toContain(`>${en['fleetConnectivity.telemetryFreshness.offline']}<`);
    }
  });

  it('C — SOFT_OFFLINE + ACTIVE + UNKNOWN + no episode + WATCH: delayed, not critical', () => {
    const fx = buildConnectivityScenario({
      overallState: 'SOFT_OFFLINE',
      telemetryState: 'signal_delayed',
      providerLinkState: 'ACTIVE',
      physicalDeviceState: 'UNKNOWN',
      attentionState: 'WATCH',
      lastTelemetryAt: hoursAgo(30),
    });
    const p = projectAllSurfaces(fx);

    expect(p.fleetTelemetryStatus).toBe('signal_delayed');
    expect(p.headerLabel).toBe(en['fleetConnectivity.telemetryFreshness.signal_delayed']);
    expect(p.headerTone).toBe('watch');
    expect(p.headerTone).not.toBe('critical');
    expect(p.overviewPrimaryLabel).toBe(en['fleetConnectivity.telemetryFreshness.signal_delayed']);
    expect(attentionTone('WATCH')).toBe('watch');
    expect(attentionTone('WATCH')).not.toBe(attentionTone('CRITICAL'));

    for (const html of [p.drawerHtml, p.pageHtml]) {
      expectDimensionsInSharedSections(html, en, {
        telemetry: 'signal_delayed',
        provider: 'ACTIVE',
        device: 'UNKNOWN',
        interruption: 'none',
      });
    }
  });

  it('D — OFFLINE + ACTIVE + UNKNOWN + no episode: critical regression case', () => {
    const fx = buildConnectivityScenario({
      overallState: 'OFFLINE',
      telemetryState: 'offline',
      providerLinkState: 'ACTIVE',
      physicalDeviceState: 'UNKNOWN',
      attentionState: 'WATCH',
      primaryReasonCode: 'TELEMETRY_OFFLINE',
      recommendedAction: 'REVIEW_CONNECTIVITY',
      lastTelemetryAt: hoursAgo(50),
    });
    const p = projectAllSurfaces(fx);

    // Telemetry = Offline everywhere.
    expect(p.fleetTelemetryStatus).toBe('offline');
    expect(p.headerLabel).toBe(en['fleetConnectivity.state.OFFLINE']);
    expect(p.headerTone).toBe('critical');
    expect(p.overviewPrimaryLabel).toBe(en['fleetConnectivity.telemetryFreshness.offline']);

    // Provider = Active, Device = Unknown, no interruption — separated.
    expect(p.overviewDataSourceText).toContain(en['fleetConnectivity.providerLink.ACTIVE']);
    expect(p.overviewDeviceText).toBe(en['fleetConnectivity.physicalDevice.UNKNOWN']);
    expect(p.overviewInterruptionText).toBe(en['fleetConnectivity.detail.noActiveInterruption']);

    for (const html of [p.drawerHtml, p.pageHtml]) {
      expectDimensionsInSharedSections(html, en, {
        telemetry: 'offline',
        provider: 'ACTIVE',
        device: 'UNKNOWN',
        interruption: 'none',
      });
      // No surface may claim connected/live because provider is active.
      expect(html).not.toContain(`>${en['fleetConnectivity.telemetryFreshness.live']}<`);
      expect(html).not.toContain(`>${en['fleetConnectivity.physicalDevice.PLUGGED_CONFIRMED']}<`);
    }
    expect(p.headerLabel).not.toBe(en['fleetConnectivity.telemetryFreshness.live']);
    expect(p.overviewPrimaryLabel).not.toBe(en['fleetConnectivity.telemetryFreshness.live']);
  });

  it('E — DEVICE_UNPLUGGED + ACTIVE + UNPLUGGED_CONFIRMED + open episode: unplug visible everywhere', () => {
    const fx = buildConnectivityScenario({
      overallState: 'DEVICE_UNPLUGGED',
      telemetryState: 'offline',
      providerLinkState: 'ACTIVE',
      physicalDeviceState: 'UNPLUGGED_CONFIRMED',
      attentionState: 'CRITICAL',
      primaryReasonCode: 'DEVICE_UNPLUG_WEBHOOK',
      recommendedAction: 'CHECK_DEVICE',
      openEpisode: true,
    });
    const p = projectAllSurfaces(fx);

    expect(p.headerLabel).toBe(en['fleetConnectivity.state.DEVICE_UNPLUGGED']);
    expect(p.headerTone).toBe('critical');
    expect(p.overviewDeviceText).toBe(en['fleetConnectivity.physicalDevice.UNPLUGGED_CONFIRMED']);
    expect(p.overviewInterruptionText).not.toBe(en['fleetConnectivity.detail.noActiveInterruption']);
    // Provider may still show active — independent dimension.
    expect(p.overviewDataSourceText).toContain(en['fleetConnectivity.providerLink.ACTIVE']);

    for (const html of [p.drawerHtml, p.pageHtml]) {
      expectDimensionsInSharedSections(html, en, {
        telemetry: 'offline',
        provider: 'ACTIVE',
        device: 'UNPLUGGED_CONFIRMED',
        interruption: 'active',
      });
      // Device problem gets strong emphasis.
      expect(html).toMatch(/data-testid="connectivity-dimension-device"[^>]*data-emphasis="chip"/);
    }
  });

  it('F — AUTHORIZATION_REQUIRED + REAUTH_REQUIRED: authorization problem, not unplug', () => {
    const fx = buildConnectivityScenario({
      overallState: 'AUTHORIZATION_REQUIRED',
      telemetryState: 'offline',
      providerLinkState: 'REAUTH_REQUIRED',
      physicalDeviceState: 'UNKNOWN',
      attentionState: 'ACTION_REQUIRED',
      primaryReasonCode: 'AUTHORIZATION_EXPIRED',
      recommendedAction: 'REAUTHORIZE_PROVIDER',
      lastTelemetryAt: hoursAgo(70),
    });
    const p = projectAllSurfaces(fx);

    expect(p.headerLabel).toBe(en['fleetConnectivity.state.AUTHORIZATION_REQUIRED']);
    expect(p.overviewDataSourceText).toContain(en['fleetConnectivity.providerLink.REAUTH_REQUIRED']);
    // No conflation with physical unplugging.
    expect(p.overviewDeviceText).toBe(en['fleetConnectivity.physicalDevice.UNKNOWN']);
    expect(p.overviewDeviceText).not.toBe(en['fleetConnectivity.physicalDevice.UNPLUGGED_CONFIRMED']);

    for (const html of [p.drawerHtml, p.pageHtml]) {
      expectDimensionsInSharedSections(html, en, {
        telemetry: 'offline',
        provider: 'REAUTH_REQUIRED',
        device: 'UNKNOWN',
        interruption: 'none',
      });
      // Recommended action = reauthorize provider.
      expect(html).toContain(en['fleetConnectivity.action.REAUTHORIZE_PROVIDER']);
      // Authorization problem gets attention emphasis.
      expect(html).toMatch(/data-testid="connectivity-dimension-provider"[^>]*data-emphasis="chip"/);
    }
  });

  it('G — INTEGRATION_ERROR + provider ERROR: integration issue clear, device independent', () => {
    const fx = buildConnectivityScenario({
      overallState: 'INTEGRATION_ERROR',
      telemetryState: 'no_signal',
      providerLinkState: 'ERROR',
      physicalDeviceState: 'UNKNOWN',
      attentionState: 'ACTION_REQUIRED',
      primaryReasonCode: 'PROVIDER_ERROR',
      recommendedAction: 'CHECK_INTEGRATION',
      lastTelemetryAt: null,
    });
    const p = projectAllSurfaces(fx);

    expect(p.headerLabel).toBe(en['fleetConnectivity.state.INTEGRATION_ERROR']);
    expect(p.overviewDataSourceText).toContain(en['fleetConnectivity.providerLink.ERROR']);
    expect(p.overviewDeviceText).toBe(en['fleetConnectivity.physicalDevice.UNKNOWN']);

    for (const html of [p.drawerHtml, p.pageHtml]) {
      expectDimensionsInSharedSections(html, en, {
        telemetry: 'no_signal',
        provider: 'ERROR',
        device: 'UNKNOWN',
        interruption: 'none',
      });
      expect(html).toContain(en['fleetConnectivity.action.CHECK_INTEGRATION']);
    }
  });

  it('H — UNKNOWN + NO_LINK + UNKNOWN device: no fabricated healthy state', () => {
    const fx = buildConnectivityScenario({
      overallState: 'UNKNOWN',
      telemetryState: 'no_signal',
      providerLinkState: 'NO_LINK',
      physicalDeviceState: 'UNKNOWN',
      attentionState: 'NONE',
      dataCoverageState: 'UNKNOWN',
      lastTelemetryAt: null,
    });
    const p = projectAllSurfaces(fx);

    expect(p.headerLabel).toBe(en['fleetConnectivity.state.UNKNOWN']);
    expect(p.headerTone).not.toBe('success');
    expect(p.overviewPrimaryLabel).toBe(en['fleetConnectivity.telemetryFreshness.no_signal']);
    expect(p.overviewInterruptionText).toBe(en['fleetConnectivity.detail.noActiveInterruption']);

    for (const html of [p.drawerHtml, p.pageHtml]) {
      expectDimensionsInSharedSections(html, en, {
        telemetry: 'no_signal',
        provider: 'NO_LINK',
        device: 'UNKNOWN',
        interruption: 'none',
      });
      expect(html).not.toContain(`>${en['fleetConnectivity.telemetryFreshness.live']}<`);
      expect(html).not.toContain(`>${en['fleetConnectivity.physicalDevice.PLUGGED_CONFIRMED']}<`);
      // No false active interruption chip.
      expect(html).toMatch(/data-testid="connectivity-dimension-interruption"[^>]*data-emphasis="text"/);
    }
  });

  it('I — recovered episode: current state healthy, history shows recovery, no stale interruption', () => {
    const fx = buildConnectivityScenario({
      overallState: 'TELEMETRY_ACTIVE',
      telemetryState: 'live',
      providerLinkState: 'ACTIVE',
      physicalDeviceState: 'PLUGGED_CONFIRMED',
      attentionState: 'NONE',
      timeline: [
        {
          id: 'evt-recovered',
          type: 'DEVICE_RECONNECTED',
          occurredAt: hoursAgo(4),
          reasonCode: 'DEVICE_RECONNECTED_EXPLICIT',
          processedAt: hoursAgo(4),
          receivedAt: hoursAgo(4),
        },
        {
          id: 'evt-unplug',
          type: 'DEVICE_UNPLUGGED',
          occurredAt: hoursAgo(6),
          reasonCode: 'DEVICE_UNPLUG_WEBHOOK',
        },
      ],
    });
    const p = projectAllSurfaces(fx);

    expect(p.headerLabel).toBe(en['fleetConnectivity.telemetryFreshness.live']);
    expect(p.overviewInterruptionText).toBe(en['fleetConnectivity.detail.noActiveInterruption']);

    for (const html of [p.drawerHtml, p.pageHtml]) {
      // Current dimensions healthy.
      expectDimensionsInSharedSections(html, en, {
        telemetry: 'live',
        provider: 'ACTIVE',
        device: 'PLUGGED_CONFIRMED',
        interruption: 'none',
      });
      // History still shows the recovery + unplug events.
      expect(html).toContain(en['fleetConnectivity.timeline.DEVICE_RECONNECTED' as TranslationKey]);
      expect(html).toContain(en['fleetConnectivity.timeline.DEVICE_UNPLUGGED' as TranslationKey]);
    }
  });
});

describe('P1.8C — legacy contradiction certification', () => {
  it('legacy online/lastSignal/healthStatus flips do not alter canonical header presentation', () => {
    const canonical = buildConnectivityScenario({
      overallState: 'OFFLINE',
      telemetryState: 'offline',
      providerLinkState: 'ACTIVE',
      physicalDeviceState: 'UNKNOWN',
      attentionState: 'WATCH',
      lastTelemetryAt: hoursAgo(50),
    });

    const legacyHealthy: FleetProjectionVehicle = {
      ...canonical.vehicle,
      online: true,
      lastSignal: minutesAgo(2),
      signalAgeMs: 2 * 60_000,
      healthStatus: 'Good Health',
    };
    const legacyDead: FleetProjectionVehicle = {
      ...canonical.vehicle,
      online: false,
      lastSignal: hoursAgo(500),
      signalAgeMs: 500 * 3_600_000,
      healthStatus: 'Critical',
    };

    const a = resolveVehicleDetailConnectivityPresentation(legacyHealthy, { locale: 'en', now: NOW });
    const b = resolveVehicleDetailConnectivityPresentation(legacyDead, { locale: 'en', now: NOW });

    expect(a.shortLabel).toBe(en['fleetConnectivity.state.OFFLINE']);
    expect(b.shortLabel).toBe(en['fleetConnectivity.state.OFFLINE']);
    expect(a.shortLabel).toBe(b.shortLabel);
    expect(a.tone).toBe(b.tone);
  });

  it('legacy runtime LIVE is not degraded by stale legacy timestamps', () => {
    const canonical = buildConnectivityScenario({
      overallState: 'TELEMETRY_ACTIVE',
      telemetryState: 'live',
      providerLinkState: 'ACTIVE',
      physicalDeviceState: 'PLUGGED_CONFIRMED',
      attentionState: 'NONE',
    });
    const staleLegacy: FleetProjectionVehicle = {
      ...canonical.vehicle,
      online: false,
      lastSignal: hoursAgo(100),
      signalAgeMs: 100 * 3_600_000,
    };

    const header = resolveVehicleDetailConnectivityPresentation(staleLegacy, { locale: 'en', now: NOW });
    expect(header.shortLabel).toBe(en['fleetConnectivity.telemetryFreshness.live']);
  });

  it('legacy device-connection summary fields do not alter overview card canonical output', () => {
    const fx = buildConnectivityScenario({
      overallState: 'OFFLINE',
      telemetryState: 'offline',
      providerLinkState: 'ACTIVE',
      physicalDeviceState: 'UNKNOWN',
      attentionState: 'WATCH',
      lastTelemetryAt: hoursAgo(50),
    });

    const legacyMutated: DeviceConnectionSummary = {
      ...fx.summary,
      currentDeviceConnectionStatus: 'plugged',
      lastDevicePluggedInAt: minutesAgo(1),
      lastWebhookReceivedAt: minutesAgo(1),
      webhookConfigured: 'not_configured',
      unpluggedCount24h: 99,
      pluggedCount7d: 99,
    };

    const baseView = buildVehicleConnectivityOverviewView(fx.summary, fx.runtime, tEn, 'en', NOW);
    const mutatedView = buildVehicleConnectivityOverviewView(legacyMutated, fx.runtime, tEn, 'en', NOW);

    expect(mutatedView.primaryTelemetryLabel).toBe(baseView.primaryTelemetryLabel);
    expect(mutatedView.dataSourceText).toBe(baseView.dataSourceText);
    expect(mutatedView.deviceText).toBe(baseView.deviceText);
    expect(mutatedView.interruptionText).toBe(baseView.interruptionText);
    expect(mutatedView.primaryTelemetryLabel).toBe(en['fleetConnectivity.telemetryFreshness.offline']);
    expect(mutatedView.deviceText).toBe(en['fleetConnectivity.physicalDevice.UNKNOWN']);
  });
});

describe('P1.8C — header consistency audit', () => {
  it('header label derives from canonical runtime — cannot say Live when runtime is OFFLINE', () => {
    const fx = buildConnectivityScenario({
      overallState: 'OFFLINE',
      telemetryState: 'offline',
      providerLinkState: 'ACTIVE',
      physicalDeviceState: 'UNKNOWN',
      attentionState: 'WATCH',
      lastTelemetryAt: hoursAgo(50),
    });
    const header = resolveVehicleDetailConnectivityPresentation(fx.vehicle, { locale: 'en', now: NOW });
    const overview = buildVehicleConnectivityOverviewView(fx.summary, fx.runtime, tEn, 'en', NOW);

    expect(header.shortLabel).not.toBe(en['fleetConnectivity.telemetryFreshness.live']);
    // Header "Offline" and card "Offline" share the same word — no contradiction.
    expect(header.shortLabel).toBe(en['fleetConnectivity.state.OFFLINE']);
    expect(overview.primaryTelemetryLabel).toBe(en['fleetConnectivity.telemetryFreshness.offline']);
    expect(header.shortLabel).toBe(overview.primaryTelemetryLabel);
  });

  it('header DEVICE_UNPLUGGED matches canonical UNPLUGGED_CONFIRMED — no connected claim', () => {
    const fx = buildConnectivityScenario({
      overallState: 'DEVICE_UNPLUGGED',
      telemetryState: 'offline',
      providerLinkState: 'ACTIVE',
      physicalDeviceState: 'UNPLUGGED_CONFIRMED',
      attentionState: 'CRITICAL',
      openEpisode: true,
    });
    const header = resolveVehicleDetailConnectivityPresentation(fx.vehicle, { locale: 'en', now: NOW });
    expect(header.shortLabel).toBe(en['fleetConnectivity.state.DEVICE_UNPLUGGED']);
    expect(header.tone).toBe('critical');
  });

  it('supplementary OBD badge only fires on explicit snapshot false — unknown never claims unplugged', () => {
    // The header's ObdUnpluggedBadge is additive unplug evidence, never a
    // "connected" claim: null/undefined/true suppress it.
    expect(shouldShowObdUnpluggedBadge(false)).toBe(true);
    expect(shouldShowObdUnpluggedBadge(true)).toBe(false);
    expect(shouldShowObdUnpluggedBadge(null)).toBe(false);
    expect(shouldShowObdUnpluggedBadge(undefined)).toBe(false);
  });
});

describe('P1.8C — visual tone consistency (semantic families, not pixels)', () => {
  it('provider ACTIVE is neutral — never success implying telemetry live', () => {
    expect(providerLinkPresentationTone('ACTIVE')).toBe('neutral');
    expect(providerLinkPresentationTone('ACTIVE')).not.toBe('success');
  });

  it('telemetry offline is critical; standby/delayed are watch; live is success', () => {
    expect(telemetryFreshnessTone('offline')).toBe('critical');
    expect(telemetryFreshnessTone('standby')).toBe('watch');
    expect(telemetryFreshnessTone('signal_delayed')).toBe('watch');
    expect(telemetryFreshnessTone('live')).toBe('success');
    expect(telemetryFreshnessTone('no_signal')).toBe('noData');
  });

  it('unknown/neutral states stay visually neutral', () => {
    expect(physicalDevicePresentationTone('UNKNOWN')).toBe('noData');
    expect(overallStateTone('UNKNOWN')).toBe('noData');
    expect(overallStateTone('NO_ACTIVE_DATA_SOURCE')).toBe('noData');
  });

  it('watch and critical are distinct severities across dimension tones', () => {
    expect(attentionTone('WATCH')).not.toBe(attentionTone('CRITICAL'));
    expect(overallStateTone('SOFT_OFFLINE')).not.toBe(overallStateTone('OFFLINE'));
    expect(providerLinkPresentationTone('REAUTH_REQUIRED')).toBe('warning');
    expect(providerLinkPresentationTone('ERROR')).toBe('critical');
    expect(physicalDevicePresentationTone('UNPLUGGED_CONFIRMED')).toBe('critical');
  });
});

describe('P1.8C — DE/EN certification', () => {
  it('scenario D renders consistent DE labels across surfaces', () => {
    const fx = buildConnectivityScenario({
      overallState: 'OFFLINE',
      telemetryState: 'offline',
      providerLinkState: 'ACTIVE',
      physicalDeviceState: 'UNKNOWN',
      attentionState: 'WATCH',
      lastTelemetryAt: hoursAgo(50),
    });
    const p = projectAllSurfaces(fx, 'de');

    expect(p.headerLabel).toBe(de['fleetConnectivity.state.OFFLINE']);
    expect(p.overviewPrimaryLabel).toBe(de['fleetConnectivity.telemetryFreshness.offline']);
    expect(p.overviewDataSourceText).toContain(de['fleetConnectivity.providerLink.ACTIVE']);
    expect(p.overviewDeviceText).toBe(de['fleetConnectivity.physicalDevice.UNKNOWN']);
    expect(p.overviewInterruptionText).toBe(de['fleetConnectivity.detail.noActiveInterruption']);

    for (const html of [p.drawerHtml, p.pageHtml]) {
      expectDimensionsInSharedSections(html, de, {
        telemetry: 'offline',
        provider: 'ACTIVE',
        device: 'UNKNOWN',
        interruption: 'none',
      });
    }
  });

  it('shared state labels are single-source — no vehicleDetail duplicates for canonical states', () => {
    for (const dict of [en, de]) {
      const stateLabelValues = [
        dict['fleetConnectivity.telemetryFreshness.offline'],
        dict['fleetConnectivity.telemetryFreshness.standby'],
        dict['fleetConnectivity.providerLink.ACTIVE'],
        dict['fleetConnectivity.physicalDevice.UNKNOWN'],
        dict['fleetConnectivity.detail.noActiveInterruption'],
        dict['fleetConnectivity.detail.activeInterruption'],
        dict['fleetConnectivity.state.AUTHORIZATION_REQUIRED'],
      ];

      // vehicleDetail.connectivity.* keys must be shell copy only, never
      // duplicate canonical state label values owned by fleetConnectivity.*.
      const shellKeys = Object.keys(dict).filter((k) =>
        k.startsWith('vehicleDetail.connectivity'),
      );
      expect(shellKeys.length).toBeGreaterThan(0);
      for (const key of shellKeys) {
        const value = dict[key as TranslationKey];
        expect(
          stateLabelValues.includes(value),
          `duplicate canonical state label in ${key}`,
        ).toBe(false);
      }
    }
  });

  it('DE and EN both resolve every canonical dimension key used by P1.8 surfaces', () => {
    const requiredKeys: TranslationKey[] = [
      'fleetConnectivity.detail.section.currentState',
      'fleetConnectivity.detail.section.dimensions',
      'fleetConnectivity.detail.section.dataAvailability',
      'fleetConnectivity.detail.section.integration',
      'fleetConnectivity.detail.section.technical',
      'fleetConnectivity.detail.dimension.telemetry',
      'fleetConnectivity.detail.dimension.providerLink',
      'fleetConnectivity.detail.dimension.physicalDevice',
      'fleetConnectivity.detail.dimension.interruption',
      'fleetConnectivity.detail.noActiveInterruption',
      'fleetConnectivity.detail.activeInterruption',
      'vehicleDetail.tab.connectivity',
      'vehicleDetail.connectivityTab.ariaLabel',
      'vehicleDetail.connectivityTab.loading',
      'vehicleDetail.connectivityTab.showDetails',
    ];
    for (const key of requiredKeys) {
      expect(en[key], `missing EN ${key}`).toBeTruthy();
      expect(de[key], `missing DE ${key}`).toBeTruthy();
    }
  });
});

describe('P1.8C — layout certification (page vs drawer)', () => {
  const fx = buildConnectivityScenario({
    overallState: 'TELEMETRY_ACTIVE',
    telemetryState: 'live',
    providerLinkState: 'ACTIVE',
    physicalDeviceState: 'PLUGGED_CONFIRMED',
    attentionState: 'NONE',
  });

  it('drawer variant stays narrow single-column', () => {
    const html = renderToStaticMarkup(
      <FleetConnectivityDetailSections detail={fx.detail} t={tEn} locale="en" showSupportButton={false} variant="drawer" />,
    );
    expect(html).toContain('data-layout-variant="drawer"');
    expect(html).not.toContain('lg:grid-cols-2');
  });

  it('page variant uses responsive paired sections and mobile-first single column', () => {
    const html = renderToStaticMarkup(
      <FleetConnectivityDetailSections detail={fx.detail} t={tEn} locale="en" showSupportButton={false} variant="page" />,
    );
    expect(html).toContain('data-layout-variant="page"');
    expect(html).toContain('lg:grid-cols-2');
    expect(html).toContain('grid-cols-1');
    expect(html).not.toMatch(/grid-cols-[3-9]/);
  });

  it('drawer and page emit identical semantic dimension values', () => {
    const drawer = renderToStaticMarkup(
      <FleetConnectivityDetailSections detail={fx.detail} t={tEn} locale="en" showSupportButton={false} variant="drawer" />,
    );
    const page = renderToStaticMarkup(
      <FleetConnectivityDetailSections detail={fx.detail} t={tEn} locale="en" showSupportButton={false} variant="page" />,
    );

    const extract = (html: string, testId: string): string | null => {
      const match = html.match(new RegExp(`data-testid="${testId}"[^>]*>([\\s\\S]*?)</`));
      return match?.[1]?.replace(/<[^>]+>/g, '').trim() ?? null;
    };

    for (const dim of [
      'connectivity-dimension-telemetry',
      'connectivity-dimension-provider',
      'connectivity-dimension-device',
      'connectivity-dimension-interruption',
    ]) {
      expect(extract(drawer, dim), dim).not.toBeNull();
      expect(extract(drawer, dim), dim).toBe(extract(page, dim));
    }
  });
});

describe('P1.8C — surface source certification', () => {
  it('overview card consumes connectivityRuntime with no legacy copy', async () => {
    const { readFileSync } = await import('node:fs');
    const { dirname, resolve } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const dir = dirname(fileURLToPath(import.meta.url));
    const cardSrc = readFileSync(
      resolve(dir, '../components/vehicle-detail/VehicleDeviceConnectionCard.tsx'),
      'utf8',
    );

    expect(cardSrc).toMatch(/connectivityRuntime/);
    expect(cardSrc).not.toMatch(/DIMO LTE_R1 verbunden/);
    expect(cardSrc).not.toMatch(/Status \(Webhook\)/);
    expect(cardSrc).not.toMatch(/resolveTelemetryFreshness|isVehicleOffline|onlineStatus/);
  });

  it('connectivity tab uses canonical detail API and shared sections without local state mapping', async () => {
    const { readFileSync } = await import('node:fs');
    const { dirname, resolve } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const dir = dirname(fileURLToPath(import.meta.url));
    const tabSrc = readFileSync(
      resolve(dir, '../components/vehicle-detail/VehicleConnectivityTab.tsx'),
      'utf8',
    );

    expect(tabSrc).toMatch(/fleetConnectivityDetail/);
    expect(tabSrc).toMatch(/FleetConnectivityDetailSections/);
    expect(tabSrc).toMatch(/variant="page"/);
    expect(tabSrc).not.toMatch(/resolveTelemetryFreshness|isVehicleOffline|onlineStatus/);
    expect(tabSrc).not.toMatch(/overallStateTone|telemetryFreshnessTone/);
  });

  it('fleet drawer keeps shell only — no duplicated section mapping', async () => {
    const { readFileSync } = await import('node:fs');
    const { dirname, resolve } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const dir = dirname(fileURLToPath(import.meta.url));
    const drawerSrc = readFileSync(
      resolve(dir, '../components/fleet-connectivity/FleetConnectivityDetailDrawer.tsx'),
      'utf8',
    );

    expect(drawerSrc).toMatch(/FleetConnectivityDetailSections/);
    expect(drawerSrc).toMatch(/variant="drawer"/);
    expect(drawerSrc).toMatch(/DetailDrawer/);
    expect(drawerSrc).not.toMatch(/fleetConnectivity\.detail\.section\.dataAvailability/);
    expect(drawerSrc).not.toMatch(/fleetConnectivity\.detail\.dimension\./);
  });

  it('recommended action surfaces when canonical runtime requires action', () => {
    const fx = buildConnectivityScenario({
      overallState: 'OFFLINE',
      telemetryState: 'offline',
      providerLinkState: 'ACTIVE',
      physicalDeviceState: 'UNKNOWN',
      attentionState: 'ACTION_REQUIRED',
      recommendedAction: 'REVIEW_CONNECTIVITY',
      requiresAction: true,
      lastTelemetryAt: hoursAgo(50),
    });
    const overview = buildVehicleConnectivityOverviewView(fx.summary, fx.runtime, tEn, 'en', NOW);
    expect(overview.recommendedActionText).toBe(
      recommendedActionLabel('REVIEW_CONNECTIVITY', tEn),
    );

    const html = renderToStaticMarkup(
      <FleetConnectivityDetailSections detail={fx.detail} t={tEn} locale="en" showSupportButton={false} variant="page" />,
    );
    expect(html).toContain(en['fleetConnectivity.action.REVIEW_CONNECTIVITY']);
  });

  it('overall state labels stay canonical in both shared helper and header', () => {
    for (const state of [
      'TELEMETRY_ACTIVE',
      'STANDBY',
      'SOFT_OFFLINE',
      'OFFLINE',
      'DEVICE_UNPLUGGED',
      'AUTHORIZATION_REQUIRED',
      'NO_ACTIVE_DATA_SOURCE',
      'INTEGRATION_ERROR',
      'UNKNOWN',
    ] as OverallConnectivityState[]) {
      expect(overallStateLabel(state, tEn)).toBe(
        en[`fleetConnectivity.state.${state}` as TranslationKey],
      );
    }
    expect(physicalDeviceLabel('UNKNOWN', tEn)).toBe(en['fleetConnectivity.physicalDevice.UNKNOWN']);
    expect(providerLinkLabel('ACTIVE', tEn)).toBe(en['fleetConnectivity.providerLink.ACTIVE']);
    expect(telemetryFreshnessLabel('offline', tEn)).toBe(en['fleetConnectivity.telemetryFreshness.offline']);
  });
});
