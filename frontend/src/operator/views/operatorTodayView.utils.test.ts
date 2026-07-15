import { describe, expect, it } from 'vitest';
import type { ApiTask } from '../../lib/api';
import type { OperatorTodaySnapshot } from '../lib/operatorData';
import type { OperatorTodayFeedState } from '../hooks/operatorTodayFeed.utils';
import { buildBucketSlice } from '../hooks/operatorTodayFeed.utils';
import {
  countVisibleTaskFeedEntries,
  getOperatorTodayBucketSections,
  isOperatorTodayFullyEmpty,
  operatorTodayFatalError,
  operatorTodayInitialLoading,
  shouldShowAllOpenTasksNav,
  shouldShowOperatorTodayStaleBanner,
} from './operatorTodayView.utils';

function task(partial: Partial<ApiTask> & Pick<ApiTask, 'id'>): ApiTask {
  return {
    organizationId: 'org-1',
    title: partial.title ?? 'Aufgabe',
    description: '',
    category: 'Custom',
    type: 'INVOICE_REQUIRED',
    status: 'OPEN',
    priority: 'NORMAL',
    source: null,
    sourceType: 'MANUAL',
    dedupKey: null,
    vehicleId: null,
    bookingId: null,
    customerId: null,
    vendorId: null,
    alertId: null,
    documentId: null,
    fineId: null,
    invoiceId: null,
    serviceCaseId: null,
    assignedUserId: null,
    estimatedCostCents: null,
    actualCostCents: null,
    resolutionNote: null,
    blocksVehicleAvailability: false,
    metadata: null,
    isOverdue: false,
    dueDate: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    createdAt: '2026-07-13T00:00:00.000Z',
    updatedAt: '2026-07-13T00:00:00.000Z',
    ...partial,
  };
}

function feedState(
  partial: Partial<OperatorTodayFeedState> & Pick<OperatorTodayFeedState, 'buckets'>,
): OperatorTodayFeedState {
  return {
    summary: null,
    timezone: 'Europe/Berlin',
    summaryLoading: false,
    summaryError: null,
    canViewUnassigned: false,
    ...partial,
  };
}

function snapshot(partial: Partial<OperatorTodaySnapshot>): OperatorTodaySnapshot {
  return {
    dueNow: [],
    pickupsToday: [],
    returnsToday: [],
    openTaskEntries: [],
    totalOpenTasksCount: 0,
    vehicleCheckTasks: [],
    blockedVehicles: [],
    taskFeed: feedState({ buckets: {} }),
    ...partial,
  };
}

describe('operatorTodayView.utils', () => {
  it('exposes five bucket sections and hides unassigned without permission', () => {
    expect(getOperatorTodayBucketSections(false).map((s) => s.bucket)).toEqual([
      'NOW',
      'TODAY',
      'UPCOMING',
      'PLANNED',
    ]);
    expect(getOperatorTodayBucketSections(true).map((s) => s.bucket)).toEqual([
      'NOW',
      'TODAY',
      'UPCOMING',
      'PLANNED',
      'UNASSIGNED',
    ]);
    expect(getOperatorTodayBucketSections(true).find((s) => s.bucket === 'UNASSIGNED')?.variant).toBe(
      'team',
    );
    expect(getOperatorTodayBucketSections(false).find((s) => s.bucket === 'PLANNED')?.defaultCollapsed).toBe(
      true,
    );
  });

  it('detects a fully empty day across tasks and secondary content', () => {
    const empty = snapshot({
      taskFeed: feedState({
        buckets: {
          NOW: buildBucketSlice({ bucket: 'NOW', tasks: [], loading: false, error: null, summary: null }),
          TODAY: buildBucketSlice({ bucket: 'TODAY', tasks: [], loading: false, error: null, summary: null }),
          UPCOMING: buildBucketSlice({
            bucket: 'UPCOMING',
            tasks: [],
            loading: false,
            error: null,
            summary: null,
          }),
          PLANNED: buildBucketSlice({
            bucket: 'PLANNED',
            tasks: [],
            loading: false,
            error: null,
            summary: null,
          }),
        },
        canViewUnassigned: false,
      }),
    });
    expect(isOperatorTodayFullyEmpty(empty)).toBe(true);

    const plannedOnly = snapshot({
      totalOpenTasksCount: 2,
      taskFeed: feedState({
        buckets: {
          PLANNED: buildBucketSlice({
            bucket: 'PLANNED',
            tasks: [task({ id: 'p1', bucket: 'PLANNED' }), task({ id: 'p2', bucket: 'PLANNED' })],
            loading: false,
            error: null,
            summary: null,
            previewLimit: 3,
          }),
        },
        canViewUnassigned: false,
      }),
    });
    expect(isOperatorTodayFullyEmpty(plannedOnly)).toBe(false);
  });

  it('counts visible feed entries and omits collapsed planned tasks', () => {
    const state = feedState({
      buckets: {
        NOW: buildBucketSlice({
          bucket: 'NOW',
          tasks: [
            task({ id: 'n1', bucket: 'NOW', priority: 'CRITICAL' }),
            task({ id: 'n2', bucket: 'NOW', priority: 'CRITICAL' }),
          ],
          loading: false,
          error: null,
          summary: null,
          previewLimit: 5,
        }),
        PLANNED: buildBucketSlice({
          bucket: 'PLANNED',
          tasks: [task({ id: 'p1', bucket: 'PLANNED' })],
          loading: false,
          error: null,
          summary: null,
          previewLimit: 3,
        }),
      },
      canViewUnassigned: false,
    });

    expect(
      countVisibleTaskFeedEntries({
        taskFeed: state,
        canViewUnassigned: false,
        plannedExpanded: false,
      }),
    ).toBe(2);
    expect(
      countVisibleTaskFeedEntries({
        taskFeed: state,
        canViewUnassigned: false,
        plannedExpanded: true,
      }),
    ).toBe(3);
  });

  it('shows all-open navigation only when preview is smaller than total', () => {
    expect(shouldShowAllOpenTasksNav(12, 5)).toBe(true);
    expect(shouldShowAllOpenTasksNav(5, 5)).toBe(false);
    expect(shouldShowAllOpenTasksNav(0, 0)).toBe(false);
  });

  it('shows stale banner only with cached renderable content', () => {
    expect(
      shouldShowOperatorTodayStaleBanner({ offline: true, isStale: false, hasRenderableContent: true }),
    ).toBe(true);
    expect(
      shouldShowOperatorTodayStaleBanner({ offline: false, isStale: true, hasRenderableContent: true }),
    ).toBe(true);
    expect(
      shouldShowOperatorTodayStaleBanner({ offline: true, isStale: true, hasRenderableContent: false }),
    ).toBe(false);
  });

  it('distinguishes initial loading from fatal errors', () => {
    expect(
      operatorTodayInitialLoading({
        orgLoading: true,
        bookingsLoading: false,
        tasksLoading: false,
        hasSnapshotContent: false,
      }),
    ).toBe(true);
    expect(
      operatorTodayInitialLoading({
        orgLoading: false,
        bookingsLoading: false,
        tasksLoading: false,
        hasSnapshotContent: true,
      }),
    ).toBe(false);
    expect(operatorTodayFatalError({ error: 'Netz', hasRenderableContent: false })).toBe(true);
    expect(operatorTodayFatalError({ error: 'Netz', hasRenderableContent: true })).toBe(false);
  });
});
