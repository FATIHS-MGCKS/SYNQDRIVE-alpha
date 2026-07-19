import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { FleetConnectivityListItem, FleetConnectivityResponse } from '../../../lib/api';
import { FleetConnectivityTab } from './FleetConnectivityTab';

const hookState = vi.hoisted(() => ({
  data: null as FleetConnectivityResponse | null,
  loading: false,
  error: null as string | null,
  reload: vi.fn(),
}));

vi.mock('../../RentalContext', () => ({
  useRentalOrg: () => ({ orgId: 'org-test' }),
}));

vi.mock('../../i18n/LanguageContext', () => ({
  useLanguage: () => ({
    locale: 'en',
    t: (key: string, params?: Record<string, string | number>) => {
      if (params) {
        return `${key}:${Object.values(params).join(',')}`;
      }
      return key;
    },
  }),
}));

vi.mock('./useFleetConnectivityList', () => ({
  useFleetConnectivityList: () => hookState,
}));

function listItem(
  vehicleId: string,
  overallState: FleetConnectivityListItem['overallState'],
  overrides: Partial<FleetConnectivityListItem> = {},
): FleetConnectivityListItem {
  return {
    vehicle: {
      vehicleId,
      licensePlate: `PL-${vehicleId}`,
      make: 'VW',
      model: 'Golf',
      year: 2022,
      station: 'Central',
    },
    overallState,
    telemetryState: overallState === 'TELEMETRY_ACTIVE' ? 'live' : 'offline',
    attentionState:
      overallState === 'DEVICE_UNPLUGGED'
        ? 'CRITICAL'
        : overallState === 'OFFLINE'
          ? 'ACTION_REQUIRED'
          : 'NONE',
    lastTelemetryAt: '2026-07-19T10:00:00.000Z',
    primaryReasonCode:
      overallState === 'DEVICE_UNPLUGGED' ? 'DEVICE_UNPLUG_WEBHOOK' : null,
    recommendedAction: overallState === 'DEVICE_UNPLUGGED' ? 'CHECK_DEVICE' : 'NONE',
    requiresAction: overallState !== 'TELEMETRY_ACTIVE' && overallState !== 'STANDBY',
    sortPriority: 10,
    ...overrides,
  };
}

function mockResponse(items: FleetConnectivityListItem[]): FleetConnectivityResponse {
  return {
    generatedAt: '2026-07-19T12:00:00.000Z',
    summary: {
      total: items.length,
      actionRequired: items.filter((i) => i.requiresAction).length,
      actionRequiredOffline: items.filter((i) => i.overallState === 'OFFLINE').length,
      actionRequiredSoftOffline: items.filter((i) => i.overallState === 'SOFT_OFFLINE').length,
      telemetryActive: items.filter((i) => i.overallState === 'TELEMETRY_ACTIVE').length,
      standby: items.filter((i) => i.overallState === 'STANDBY').length,
      noActiveDataSource: items.filter(
        (i) => i.overallState === 'NO_ACTIVE_DATA_SOURCE',
      ).length,
    },
    pagination: {
      page: 1,
      limit: 50,
      total: items.length,
      totalInOrganization: items.length,
    },
    items,
  };
}

const states: FleetConnectivityListItem['overallState'][] = [
  'TELEMETRY_ACTIVE',
  'STANDBY',
  'SOFT_OFFLINE',
  'OFFLINE',
  'DEVICE_UNPLUGGED',
  'AUTHORIZATION_REQUIRED',
  'NO_ACTIVE_DATA_SOURCE',
  'UNKNOWN',
];

describe('FleetConnectivityTab UI', () => {
  beforeEach(() => {
    hookState.data = null;
    hookState.loading = false;
    hookState.error = null;
  });

  it('renders loading skeleton', () => {
    hookState.loading = true;
    const html = renderToStaticMarkup(<FleetConnectivityTab />);
    expect(html).toContain('animate-pulse');
  });

  it('renders four canonical KPIs and reduced table columns', () => {
    hookState.data = mockResponse(states.map((state, idx) => listItem(`v${idx}`, state)));
    const html = renderToStaticMarkup(<FleetConnectivityTab />);
    expect(html).toContain('fleetConnectivity.kpi.actionRequired');
    expect(html).toContain('fleetConnectivity.kpi.telemetryActive');
    expect(html).toContain('fleetConnectivity.kpi.standby');
    expect(html).toContain('fleetConnectivity.kpi.noDataSource');
    expect(html).toContain('fleetConnectivity.col.currentState');
    expect(html).toContain('fleetConnectivity.col.priorityHint');
    expect(html.toLowerCase()).not.toContain('readiness');
  });

  it('exposes accessible search and filter controls', () => {
    hookState.data = mockResponse([listItem('v1', 'TELEMETRY_ACTIVE')]);
    const html = renderToStaticMarkup(<FleetConnectivityTab />);
    expect(html).toContain('id="fleet-connectivity-search"');
    expect(html).toContain('id="fleet-connectivity-state-filter"');
    expect(html).toContain('sr-only');
    expect(html).toContain('aria-pressed');
  });

  it('renders mobile card list and canonical state labels', () => {
    hookState.data = mockResponse([listItem('v1', 'DEVICE_UNPLUGGED')]);
    const html = renderToStaticMarkup(<FleetConnectivityTab />);
    expect(html).toContain('fleetConnectivity.mobileList');
    expect(html).toContain('fleetConnectivity.state.DEVICE_UNPLUGGED');
  });

  it('renders empty state when no items', () => {
    hookState.data = mockResponse([]);
    const html = renderToStaticMarkup(<FleetConnectivityTab />);
    expect(html).toContain('fleetConnectivity.emptyDefault');
  });

  it('renders error state', () => {
    hookState.error = 'fleetConnectivity.loadError';
    const html = renderToStaticMarkup(<FleetConnectivityTab />);
    expect(html).toContain('fleetConnectivity.loadError');
    expect(html).toContain('fleetConnectivity.retry');
  });

  it('does not surface legacy OBD labels for incident rows', () => {
    hookState.data = mockResponse([listItem('incident', 'DEVICE_UNPLUGGED')]);
    const html = renderToStaticMarkup(<FleetConnectivityTab embedded />);
    expect(html.toLowerCase()).not.toContain('obd plug');
    expect(html).toContain('fleetConnectivity.state.DEVICE_UNPLUGGED');
  });
});
