// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiTask, Vendor } from '../../../lib/api';
import { useFleetHealthServiceTaskNavigation } from './useFleetHealthServiceTaskNavigation';

const tasks: ApiTask[] = [
  {
    id: 't1',
    organizationId: 'org-1',
    vehicleId: 'v1',
    title: 'Oil change',
    status: 'OPEN',
    priority: 'NORMAL',
    type: 'OIL_CHANGE',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  } as ApiTask,
  {
    id: 't2',
    organizationId: 'org-1',
    vehicleId: 'v2',
    title: 'Brake check',
    status: 'OPEN',
    priority: 'HIGH',
    type: 'BRAKE_SERVICE',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  } as ApiTask,
];

const vendors: Vendor[] = [{ id: 'vendor-1', name: 'Werkstatt Nord' } as Vendor];

function renderNavigationHook(
  props: Parameters<typeof useFleetHealthServiceTaskNavigation>[0],
) {
  const bag: { current: ReturnType<typeof useFleetHealthServiceTaskNavigation> | undefined } = {
    current: undefined,
  };
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  function Probe() {
    bag.current = useFleetHealthServiceTaskNavigation(props);
    return null;
  }

  act(() => {
    root.render(createElement(Probe));
  });

  return {
    result: bag,
    rerender: (next: Parameters<typeof useFleetHealthServiceTaskNavigation>[0]) => {
      act(() => {
        root.render(
          createElement(() => {
            bag.current = useFleetHealthServiceTaskNavigation(next);
            return null;
          }),
        );
      });
    },
    unmount: () =>
      act(() => {
        root.unmount();
        container.remove();
      }),
  };
}

describe('useFleetHealthServiceTaskNavigation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('filters tasks by vehicleId from navigation context', () => {
    const onConsumed = vi.fn();
    const { result, unmount } = renderNavigationHook({
      navigation: { vehicleId: 'v1', tab: 'tasks' },
      onNavigationConsumed: onConsumed,
      allTasks: tasks,
      vendors,
    });

    expect(result.current!.filteredTasks.map((task) => task.id)).toEqual(['t1']);
    expect(result.current!.advancedNavPatch.vehicleId).toBe('v1');
    expect(result.current!.hasNavContext).toBe(true);
    expect(onConsumed).toHaveBeenCalledTimes(1);

    unmount();
  });

  it('applies focusTaskId and KPI filter from deep links', () => {
    const { result, unmount } = renderNavigationHook({
      navigation: { focusTaskId: 't2', taskFilter: 'overdue' },
      allTasks: tasks,
      vendors,
    });

    expect(result.current!.focusTaskId).toBe('t2');
    expect(result.current!.taskFilter).toBe('overdue');

    unmount();
  });

  it('clears navigation context and restores full task list', () => {
    const { result, unmount } = renderNavigationHook({
      navigation: { vehicleId: 'v1', vendorId: 'vendor-1', taskFilter: 'critical' },
      allTasks: tasks,
      vendors,
    });

    act(() => {
      result.current!.clearNavContext();
    });

    expect(result.current!.filteredTasks).toHaveLength(2);
    expect(result.current!.taskFilter).toBe('all');
    expect(result.current!.focusTaskId).toBeNull();
    expect(result.current!.hasNavContext).toBe(false);

    unmount();
  });
});
