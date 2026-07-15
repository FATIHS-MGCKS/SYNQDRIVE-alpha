import { describe, expect, it, vi } from 'vitest';
import {
  buildTasksListApiParams,
  DEFAULT_TASKS_LIST_FILTERS,
  hasActiveTasksListFilters,
  readTasksListFiltersFromUrl,
  syncTasksListFiltersToUrl,
} from './tasksListState';

describe('tasksListState', () => {
  it('builds combined view and explicit filter params', () => {
    const params = buildTasksListApiParams(
      {
        ...DEFAULT_TASKS_LIST_FILTERS,
        view: 'open',
        status: 'IN_PROGRESS',
        priority: 'HIGH',
        vehicleId: 'veh-1',
        overdue: true,
        dueFrom: '2026-07-01',
        dueTo: '2026-07-31',
      },
      'inspection',
      'user-1',
    );

    expect(params.bucket).toBe('ALL_OPEN');
    expect(params.status).toBe('IN_PROGRESS');
    expect(params.priority).toBe('HIGH');
    expect(params.vehicleId).toBe('veh-1');
    expect(params.overdue).toBe(true);
    expect(params.search).toBe('inspection');
    expect(params.dueFrom).toBe('2026-07-01');
    expect(params.dueTo).toBe('2026-07-31');
    expect(params.assignedUserId).toBeUndefined();
  });

  it('uses mine assignment from view and allows explicit assignee override', () => {
    const mineParams = buildTasksListApiParams(
      { ...DEFAULT_TASKS_LIST_FILTERS, view: 'mine' },
      '',
      'user-42',
    );
    expect(mineParams.assignedUserId).toBe('user-42');

    const overrideParams = buildTasksListApiParams(
      {
        ...DEFAULT_TASKS_LIST_FILTERS,
        view: 'mine',
        assignedUserId: 'user-99',
      },
      '',
      'user-42',
    );
    expect(overrideParams.assignedUserId).toBe('user-99');
  });

  it('detects active filters', () => {
    expect(hasActiveTasksListFilters(DEFAULT_TASKS_LIST_FILTERS, '')).toBe(false);
    expect(
      hasActiveTasksListFilters(
        { ...DEFAULT_TASKS_LIST_FILTERS, invoiceId: 'inv-1' },
        '',
      ),
    ).toBe(true);
    expect(hasActiveTasksListFilters(DEFAULT_TASKS_LIST_FILTERS, 'hu')).toBe(true);
  });

  it('syncs and reads URL query params', () => {
    const href = { value: 'http://localhost/rental' };
    const search = { value: '' };

    vi.stubGlobal('window', {
      location: {
        get href() {
          return href.value;
        },
        get search() {
          return search.value;
        },
      },
      history: {
        replaceState: (_state: unknown, _title: string, nextUrl: string) => {
          href.value = nextUrl.startsWith('http')
            ? nextUrl
            : `http://localhost${nextUrl.startsWith('/') ? '' : '/'}${nextUrl}`;
          const queryIndex = href.value.indexOf('?');
          search.value = queryIndex >= 0 ? href.value.slice(queryIndex) : '';
        },
      },
    });

    window.history.replaceState({}, '', 'http://localhost/rental?taskQ=brake&taskView=overdue&taskStatus=OPEN&taskOverdue=1');

    expect(readTasksListFiltersFromUrl()).toEqual({
      search: 'brake',
      view: 'overdue',
      status: 'OPEN',
      overdue: true,
    });

    syncTasksListFiltersToUrl(
      {
        ...DEFAULT_TASKS_LIST_FILTERS,
        view: 'today',
        stationId: 'station-1',
        serviceCaseId: 'sc-1',
      },
      'reifen',
    );

    expect(href.value).toContain('taskQ=reifen');
    expect(href.value).toContain('taskView=today');
    expect(href.value).toContain('taskStation=station-1');
    expect(href.value).toContain('taskServiceCase=sc-1');
    expect(href.value).not.toContain('taskStatus=');

    vi.unstubAllGlobals();
  });
});
