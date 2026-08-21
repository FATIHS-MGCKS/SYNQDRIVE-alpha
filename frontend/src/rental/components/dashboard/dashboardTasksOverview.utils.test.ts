import { describe, expect, it } from 'vitest';
import type { ApiTask } from '../../../lib/api';
import type { ApiTaskSummary } from '../../../lib/tasks/types';
import type { VehicleData } from '../../data/vehicles';
import {
  buildDashboardTaskPreview,
  buildDashboardTasksOverviewCountsFromSummary,
  compareDashboardTaskPreviewPriority,
  deriveDashboardTasksOverviewCounts,
  DASHBOARD_TASKS_PREVIEW_LIMIT,
  filterTasksForDashboardStation,
  sortDashboardTaskPreview,
  taskMatchesDashboardStation,
  buildFleetVehicleById,
} from './dashboardTasksOverview.utils';

function task(over: Partial<ApiTask> = {}): ApiTask {
  return {
    id: over.id ?? 'task-1',
    organizationId: 'org-1',
    title: over.title ?? 'Task',
    description: '',
    category: '',
    type: 'CUSTOM',
    status: over.status ?? 'OPEN',
    priority: over.priority ?? 'NORMAL',
    source: null,
    sourceType: 'MANUAL',
    dedupKey: null,
    vehicleId: over.vehicleId ?? null,
    bookingId: null,
    customerId: null,
    vendorId: null,
    alertId: null,
    documentId: null,
    fineId: null,
    invoiceId: null,
    serviceCaseId: null,
    assignedUserId: over.assignedUserId ?? null,
    estimatedCostCents: null,
    actualCostCents: null,
    resolutionNote: null,
    blocksVehicleAvailability: false,
    metadata: over.metadata ?? null,
    isOverdue: over.isOverdue ?? false,
    bucket: over.bucket,
    dueDate: over.dueDate ?? null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

function vehicle(over: Partial<VehicleData> = {}): VehicleData {
  return {
    id: over.id ?? 'veh-1',
    license: over.license ?? 'KS-AB 1',
    make: 'VW',
    model: over.model ?? 'Golf',
    year: 2024,
    station: 'Zentrale',
    stationId: over.stationId ?? 'st-a',
    fuelType: 'Petrol',
    status: 'Available',
    cleaningStatus: 'Clean',
    healthStatus: 'Good Health',
    online: true,
    lastSignal: '2026-01-01T00:00:00.000Z',
    badge: 0,
    odometer: 1000,
    fuel: 80,
    battery: 100,
    speed: 0,
    coolant: 90,
    brakes: 90,
    tires: 90,
    engineOil: 90,
    isElectric: false,
    hvBatteryCapacityKwh: null,
    isFresh: false,
    onlineStatus: 'STANDBY',
    leasingRate: '',
    insuranceCost: '',
    taxCost: '',
    totalMonthlyCost: '',
    homeStationId: over.homeStationId,
    currentStationId: over.currentStationId,
    ...over,
  };
}

describe('dashboardTasksOverview.utils', () => {
  it('includes vehicle-linked tasks via canonical vehicle station semantics', () => {
    const vehicles = buildFleetVehicleById([vehicle({ id: 'veh-1', stationId: 'st-a' })]);
    const match = task({ id: 't1', vehicleId: 'veh-1' });
    expect(taskMatchesDashboardStation(match, 'st-a', vehicles)).toBe(true);
  });

  it('excludes tasks for vehicles at another station', () => {
    const vehicles = buildFleetVehicleById([vehicle({ id: 'veh-1', stationId: 'st-b' })]);
    const other = task({ id: 't1', vehicleId: 'veh-1' });
    expect(taskMatchesDashboardStation(other, 'st-a', vehicles)).toBe(false);
  });

  it('includes vehicle-linked tasks without metadata.stationId when vehicle matches', () => {
    const vehicles = buildFleetVehicleById([
      vehicle({ id: 'veh-1', stationId: 'st-a', homeStationId: 'st-a' }),
    ]);
    const row = task({ id: 't1', vehicleId: 'veh-1', metadata: null });
    const filtered = filterTasksForDashboardStation([row], 'st-a', vehicles);
    expect(filtered).toHaveLength(1);
  });

  it('includes non-vehicle tasks with explicit metadata.stationId', () => {
    const vehicles = buildFleetVehicleById([]);
    const row = task({ id: 't1', metadata: { stationId: 'st-a' } });
    expect(taskMatchesDashboardStation(row, 'st-a', vehicles)).toBe(true);
  });

  it('derives overdue, today, in-progress and unassigned counts', () => {
    const counts = deriveDashboardTasksOverviewCounts([
      task({ id: 't1', isOverdue: true, status: 'OPEN' }),
      task({ id: 't2', bucket: 'TODAY', status: 'OPEN', dueDate: new Date().toISOString() }),
      task({ id: 't3', status: 'IN_PROGRESS', assignedUserId: 'user-1' }),
      task({ id: 't4', status: 'OPEN', assignedUserId: null }),
      task({ id: 't5', status: 'DONE' }),
    ]);

    expect(counts.overdue).toBe(1);
    expect(counts.today).toBe(1);
    expect(counts.inProgress).toBe(1);
    expect(counts.unassigned).toBe(3);
    expect(counts.open).toBe(4);
  });

  it('builds org-wide counts from summary', () => {
    const summary: ApiTaskSummary = {
      open: 3,
      active: 5,
      inProgress: 2,
      waiting: 1,
      done: 10,
      cancelled: 1,
      dueToday: 2,
      overdue: 1,
      critical: 0,
      assignedToMe: 1,
      byStatus: {},
      byPriority: {},
      buckets: {
        ALL_OPEN: 5,
        OVERDUE: 1,
        TODAY: 2,
        NOW: 0,
        UPCOMING: 0,
        PLANNED: 0,
        UNASSIGNED: 1,
        COMPLETED: 11,
      },
    };

    const counts = buildDashboardTasksOverviewCountsFromSummary(summary, true);
    expect(counts).toEqual({
      open: 5,
      overdue: 1,
      today: 2,
      inProgress: 2,
      unassigned: 1,
    });
  });

  it('orders preview tasks deterministically by operational priority', () => {
    const ordered = sortDashboardTaskPreview([
      task({ id: 'planned', bucket: 'PLANNED', dueDate: '2026-12-01T00:00:00.000Z' }),
      task({ id: 'overdue', isOverdue: true, dueDate: '2026-01-01T00:00:00.000Z' }),
      task({ id: 'now', bucket: 'NOW' }),
      task({ id: 'today', bucket: 'TODAY' }),
      task({ id: 'critical', priority: 'CRITICAL', dueDate: '2026-08-01T00:00:00.000Z' }),
      task({ id: 'in-progress', status: 'IN_PROGRESS', dueDate: '2026-08-02T00:00:00.000Z' }),
    ]);

    expect(ordered.map((row) => row.id)).toEqual([
      'overdue',
      'now',
      'today',
      'critical',
      'in-progress',
      'planned',
    ]);
  });

  it('caps preview rows at the configured limit', () => {
    const rows = Array.from({ length: 8 }, (_, index) =>
      task({ id: `t-${index}`, title: `Task ${index}` }),
    );
    expect(buildDashboardTaskPreview(rows)).toHaveLength(DASHBOARD_TASKS_PREVIEW_LIMIT);
  });

  it('prefers overdue tasks in pairwise comparison', () => {
    const overdue = task({ id: 'a', isOverdue: true });
    const open = task({ id: 'b', isOverdue: false });
    expect(compareDashboardTaskPreviewPriority(overdue, open)).toBeLessThan(0);
  });
});
