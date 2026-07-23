import { describe, expect, it } from 'vitest';
import {
  clearFleetHealthServiceNavFilters,
  DEFAULT_FLEET_HEALTH_SERVICE_NAV,
  FLEET_HEALTH_SERVICE_NAV_ANALYTICS_KEYS,
  fleetHealthServiceNavAnalyticsKey,
  fleetHealthServiceNavHasActiveFilters,
  fleetHealthServiceNavToSearchParams,
  fleetHealthServiceNavToTaskAdvancedFilters,
  fleetSubTabFromServiceCenterNav,
  normalizeFleetHealthServiceNavState,
  normalizeFleetHealthServiceTab,
  normalizeFleetTab,
  parseFleetHealthServiceNavFromSearch,
  sanitizeFleetHealthServiceNavState,
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
    expect(normalizeFleetHealthServiceTab('work', 'service-cases')).toEqual({
      tab: 'work',
      workSection: 'service-cases',
    });
  });

  it('falls back to default overview nav', () => {
    expect(normalizeFleetHealthServiceTab('unknown')).toEqual(DEFAULT_FLEET_HEALTH_SERVICE_NAV);
  });
});

describe('sanitizeFleetHealthServiceNavState', () => {
  it('drops unknown filter values instead of producing empty surfaces', () => {
    expect(
      sanitizeFleetHealthServiceNavState({
        tab: 'vehicles',
        workSection: 'tasks',
        vehicleStatusFilter: 'blocked',
        taskFilter: 'not-a-real-filter' as never,
      }),
    ).toEqual({
      tab: 'vehicles',
      workSection: 'tasks',
      vehicleStatusFilter: 'blocked',
    });
  });

  it('routes task KPI filters to the tasks work section', () => {
    expect(
      sanitizeFleetHealthServiceNavState({
        tab: 'work',
        workSection: 'vendors',
        taskFilter: 'waiting-vendor',
      }),
    ).toEqual({
      tab: 'work',
      workSection: 'tasks',
      taskFilter: 'waiting-vendor',
    });
  });

  it('routes blocking service-case filter from overview to vehicles', () => {
    expect(
      sanitizeFleetHealthServiceNavState({
        tab: 'overview',
        workSection: 'tasks',
        serviceCaseFilter: 'blocking',
      }),
    ).toEqual({
      tab: 'vehicles',
      workSection: 'tasks',
      serviceCaseFilter: 'blocking',
    });
  });
});

describe('fleet health service nav url + analytics', () => {
  it('round-trips tab and work section through URL search params', () => {
    const nav = { tab: 'work' as const, workSection: 'schedule' as const };
    const params = fleetHealthServiceNavToSearchParams(nav);
    expect(parseFleetHealthServiceNavFromSearch(`?${params.toString()}`)).toEqual(nav);
  });

  it('round-trips canonical filters through URL search params', () => {
    const nav = sanitizeFleetHealthServiceNavState({
      tab: 'work',
      workSection: 'tasks',
      taskFilter: 'overdue',
      vehicleId: 'veh-1',
      vendorId: 'ven-1',
      stationId: 'st-1',
      taskStatus: 'WAITING',
    });
    const params = fleetHealthServiceNavToSearchParams(nav);
    expect(parseFleetHealthServiceNavFromSearch(`?${params.toString()}`)).toEqual(nav);
  });

  it('parses legacy vehicleStatusFilter and taskFilter aliases', () => {
    expect(
      parseFleetHealthServiceNavFromSearch(
        '?fhs=vehicles&vehicleStatusFilter=review&taskFilter=overdue',
      ),
    ).toEqual({
      tab: 'vehicles',
      workSection: 'tasks',
      vehicleStatusFilter: 'review',
      taskFilter: 'overdue',
    });
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
    ).toEqual({ tab: 'work', workSection: 'vendors', vendorId: 'vendor-1' });
    expect(
      fleetSubTabFromServiceCenterNav({
        vehicleId: 'veh-1',
        taskFilter: 'overdue',
        taskStatus: 'OPEN',
      }),
    ).toEqual({
      tab: 'work',
      workSection: 'tasks',
      vehicleId: 'veh-1',
      taskFilter: 'overdue',
      taskStatus: 'OPEN',
    });
    expect(normalizeFleetHealthServiceNavState('schedule')).toEqual({
      tab: 'work',
      workSection: 'schedule',
    });
  });

  it('preserves filters when normalizing full nav state objects', () => {
    expect(
      normalizeFleetHealthServiceNavState({
        tab: 'vehicles',
        workSection: 'tasks',
        vehicleStatusFilter: 'limited',
        serviceCaseFilter: 'blocking',
      }),
    ).toEqual({
      tab: 'vehicles',
      workSection: 'tasks',
      vehicleStatusFilter: 'limited',
      serviceCaseFilter: 'blocking',
    });
  });

  it('maps nav state to task advanced filters for execution surfaces', () => {
    expect(
      fleetHealthServiceNavToTaskAdvancedFilters({
        tab: 'work',
        workSection: 'tasks',
        taskFilter: 'due-today',
        vehicleId: 'veh-2',
        vendorId: 'ven-2',
        stationId: 'st-2',
        taskStatus: 'ACTIVE',
      }),
    ).toEqual({
      kpiFilter: 'due-today',
      vehicleId: 'veh-2',
      vendorId: 'ven-2',
      stationId: 'st-2',
      status: 'ACTIVE',
    });
  });

  it('clears filters for manual tab changes without dropping tab/section', () => {
    expect(
      clearFleetHealthServiceNavFilters({
        tab: 'work',
        workSection: 'schedule',
        taskFilter: 'overdue',
        vehicleStatusFilter: 'blocked',
      }),
    ).toEqual({
      tab: 'work',
      workSection: 'schedule',
    });
  });

  it('detects active filters', () => {
    expect(
      fleetHealthServiceNavHasActiveFilters({
        tab: 'overview',
        workSection: 'tasks',
      }),
    ).toBe(false);
    expect(
      fleetHealthServiceNavHasActiveFilters({
        tab: 'vehicles',
        workSection: 'tasks',
        vehicleStatusFilter: 'review',
      }),
    ).toBe(true);
  });
});
