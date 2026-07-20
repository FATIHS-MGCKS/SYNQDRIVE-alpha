import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FLEET_HEALTH_SERVICE_NAV,
  FLEET_HEALTH_SERVICE_NAV_ANALYTICS_KEYS,
  fleetHealthServiceNavAnalyticsKey,
  fleetHealthServiceNavToSearchParams,
  fleetSubTabFromServiceCenterNav,
  normalizeFleetHealthServiceNavState,
  normalizeFleetHealthServiceTab,
  normalizeFleetTab,
  parseFleetHealthServiceNavFromSearch,
} from './fleet-health-service.types';

describe('normalizeFleetTab', () => {
  it('keeps status and condition-service', () => {
    expect(normalizeFleetTab('status')).toEqual({ tab: 'status' });
    expect(normalizeFleetTab('condition-service')).toEqual({ tab: 'condition-service' });
  });

  it('accepts connectivity', () => {
    expect(normalizeFleetTab('connectivity')).toEqual({ tab: 'connectivity' });
  });

  it('maps legacy health and service tabs', () => {
    expect(normalizeFleetTab('health')).toEqual({
      tab: 'condition-service',
      subTab: 'vehicles',
    });
    expect(normalizeFleetTab('service')).toEqual({
      tab: 'condition-service',
      subTab: 'overview',
    });
  });

  it('falls back unknown values to status', () => {
    expect(normalizeFleetTab('invalid-tab')).toEqual({ tab: 'status' });
    expect(normalizeFleetTab('')).toEqual({ tab: 'status' });
  });
});

describe('normalizeFleetHealthServiceTab', () => {
  it('keeps four primary areas', () => {
    expect(normalizeFleetHealthServiceTab('overview')).toEqual({
      tab: 'overview',
      workSection: 'tasks',
    });
    expect(normalizeFleetHealthServiceTab('history')).toEqual({
      tab: 'history',
      workSection: 'tasks',
    });
  });

  it('migrates legacy six-tab deep links into Arbeiten sections', () => {
    expect(normalizeFleetHealthServiceTab('tasks')).toEqual({
      tab: 'work',
      workSection: 'tasks',
    });
    expect(normalizeFleetHealthServiceTab('schedule')).toEqual({
      tab: 'work',
      workSection: 'schedule',
    });
    expect(normalizeFleetHealthServiceTab('vendors')).toEqual({
      tab: 'work',
      workSection: 'vendors',
    });
  });

  it('preserves work section hint for work tab', () => {
    expect(normalizeFleetHealthServiceTab('work', 'schedule')).toEqual({
      tab: 'work',
      workSection: 'schedule',
    });
  });

  it('falls back to default overview nav', () => {
    expect(normalizeFleetHealthServiceTab('unknown')).toEqual(DEFAULT_FLEET_HEALTH_SERVICE_NAV);
  });
});

describe('fleet health service nav url + analytics', () => {
  it('round-trips nav state through URL search params', () => {
    const nav = { tab: 'work' as const, workSection: 'schedule' as const };
    const params = fleetHealthServiceNavToSearchParams(nav);
    expect(parseFleetHealthServiceNavFromSearch(`?${params.toString()}`)).toEqual(nav);
  });

  it('maps legacy analytics keys for migrated tabs', () => {
    expect(fleetHealthServiceNavAnalyticsKey({ tab: 'work', workSection: 'tasks' })).toBe(
      FLEET_HEALTH_SERVICE_NAV_ANALYTICS_KEYS.tasks,
    );
    expect(fleetHealthServiceNavAnalyticsKey({ tab: 'history', workSection: 'tasks' })).toBe(
      FLEET_HEALTH_SERVICE_NAV_ANALYTICS_KEYS.history,
    );
  });

  it('routes service-center deep links without losing intent', () => {
    expect(
      fleetSubTabFromServiceCenterNav({ focusTaskId: 'task-1', tab: 'tasks' }),
    ).toEqual({ tab: 'work', workSection: 'tasks' });
    expect(
      fleetSubTabFromServiceCenterNav({ vendorId: 'vendor-1' }),
    ).toEqual({ tab: 'work', workSection: 'vendors' });
    expect(normalizeFleetHealthServiceNavState('schedule')).toEqual({
      tab: 'work',
      workSection: 'schedule',
    });
  });
});
