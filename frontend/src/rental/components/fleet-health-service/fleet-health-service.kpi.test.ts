import { describe, expect, it } from 'vitest';
import { matchesStatusFilter } from '../../lib/fleet-health-control-center';
import { matchesServiceTaskFilter } from '../service-center/service-center.utils';
import { buildFleetHealthServiceKpiGroups } from './FleetHealthServiceKpiStrip';
import type { FleetHealthKpis } from '../../lib/fleet-health-control-center';
import type { FleetHealthServiceExecutionGroups } from './fleet-health-service.view-model';
import type { ApiTask } from '../../../lib/api';

const baseHealthKpis: FleetHealthKpis = {
  total: 10,
  blocked: 2,
  critical: 1,
  warning: 3,
  limited: 1,
  good: 4,
  naModuleVehicles: 0,
  actionRequired: 3,
  needsReview: 3,
  healthy: 4,
};

const emptyExecution: FleetHealthServiceExecutionGroups = {
  openServiceTasks: [],
  overdueServiceTasks: [],
  dueTodayServiceTasks: [],
  inProgressServiceTasks: [],
  vendorWaitingTasks: [],
  upcomingServiceItems: [],
  completedServiceItems: [],
  activeVendors: [],
};

function task(overrides: Partial<ApiTask> & Pick<ApiTask, 'id' | 'vehicleId'>): ApiTask {
  return {
    organizationId: 'org1',
    title: 'Task',
    description: '',
    category: 'Service',
    type: 'VEHICLE_SERVICE',
    status: 'OPEN',
    priority: 'NORMAL',
    source: null,
    sourceType: 'MANUAL',
    dedupKey: null,
    bookingId: null,
    customerId: null,
    vendorId: null,
    assignedUserId: null,
    dueDate: null,
    blocksVehicleAvailability: false,
    serviceCaseId: null,
    metadata: null,
    ...overrides,
  };
}

describe('buildFleetHealthServiceKpiGroups', () => {
  it('returns null values on health API error instead of zero', () => {
    const groups = buildFleetHealthServiceKpiGroups({
      healthKpis: baseHealthKpis,
      execution: emptyExecution,
      healthError: 'Health failed',
      serviceLoading: false,
    });
    const health = groups.find((g) => g.key === 'health');
    expect(health?.items.every((item) => item.value === null)).toBe(true);
    expect(health?.unavailable).toBe(true);
  });

  it('returns null values on service API error instead of zero', () => {
    const groups = buildFleetHealthServiceKpiGroups({
      healthKpis: baseHealthKpis,
      execution: {
        ...emptyExecution,
        overdueServiceTasks: [task({ id: 't1', vehicleId: 'v1', isOverdue: true })],
      },
      serviceError: 'Tasks failed',
      healthLoading: false,
    });
    const execution = groups.find((g) => g.key === 'execution');
    expect(execution?.items.every((item) => item.value === null)).toBe(true);
    expect(execution?.unavailable).toBe(true);
  });

  it('separates health and execution domains with units', () => {
    const groups = buildFleetHealthServiceKpiGroups({
      healthKpis: baseHealthKpis,
      execution: {
        ...emptyExecution,
        overdueServiceTasks: [task({ id: 't1', vehicleId: 'v1', isOverdue: true })],
      },
      healthLoading: false,
      serviceLoading: false,
    });
    expect(groups).toHaveLength(2);
    expect(groups[0]?.items).toHaveLength(4);
    expect(groups[1]?.items).toHaveLength(4);
    expect(groups[0]?.items.every((item) => item.unit === 'vehicles')).toBe(true);
    expect(groups[1]?.items.every((item) => item.unit === 'tasks')).toBe(true);
    expect(groups[0]?.items.find((i) => i.key === 'blocked')?.value).toBe(2);
    expect(groups[1]?.items.find((i) => i.key === 'overdue')?.value).toBe(1);
  });
});

describe('KPI navigation filters', () => {
  it('blocked status filter matches rental_blocked only', () => {
    expect(
      matchesStatusFilter('blocked', {
        vehicle_id: 'v1',
        organization_id: 'org1',
        overall_state: 'critical',
        rental_blocked: true,
        blocking_reasons: [],
        modules: {} as never,
        generated_at: '2026-01-01T00:00:00.000Z',
      }),
    ).toBe(true);
    expect(
      matchesStatusFilter('blocked', {
        vehicle_id: 'v2',
        organization_id: 'org1',
        overall_state: 'critical',
        rental_blocked: false,
        blocking_reasons: [],
        modules: {} as never,
        generated_at: '2026-01-01T00:00:00.000Z',
      }),
    ).toBe(false);
  });

  it('due-today task filter excludes overdue tasks', () => {
    const now = new Date();
    const dueToday = task({
      id: 't-today',
      vehicleId: 'v1',
      dueDate: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 0).toISOString(),
    });
    const overdue = task({
      id: 't-overdue',
      vehicleId: 'v2',
      isOverdue: true,
      dueDate: '2020-01-01T00:00:00.000Z',
    });
    expect(matchesServiceTaskFilter(dueToday, 'due-today')).toBe(true);
    expect(matchesServiceTaskFilter(overdue, 'due-today')).toBe(false);
  });
});
