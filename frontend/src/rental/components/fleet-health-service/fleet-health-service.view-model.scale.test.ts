import { describe, expect, it } from 'vitest';
import { buildFleetHealthServiceViewModel } from './fleet-health-service.view-model';
import {
  buildSyntheticFleetHealthMap,
  buildSyntheticFleetVehicles,
  FLEET_HEALTH_SCALE_TIERS,
} from './fleet-health-scale.fixtures';

function timeMs(fn: () => void): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

const VIEW_MODEL_MS_LIMIT: Record<number, number> = {
  100: 120,
  500: 400,
  1000: 800,
  5000: 3_000,
};

describe('fleet-health-service view-model scale coverage', () => {
  it.each(FLEET_HEALTH_SCALE_TIERS)(
    'builds view model for %i vehicles within budget',
    (count) => {
      const vehicles = buildSyntheticFleetVehicles(count);
      const healthMap = buildSyntheticFleetHealthMap(count);

      let vm: ReturnType<typeof buildFleetHealthServiceViewModel> | undefined;
      const elapsed = timeMs(() => {
        vm = buildFleetHealthServiceViewModel({
          vehicles,
          healthMap,
          healthLoading: false,
          taskList: [],
          vendors: [],
          serviceLoading: false,
          serviceError: null,
        });
      });

      expect(elapsed).toBeLessThan(VIEW_MODEL_MS_LIMIT[count]!);
      expect(vm!.healthKpis.total).toBe(count);
      expect(vm!.prioritizedOverviewRows.length).toBeLessThanOrEqual(count);
    },
  );

  it('prioritized overview stays triage-sized at 5000 vehicles', () => {
    const count = 5000;
    const vehicles = buildSyntheticFleetVehicles(count);
    const healthMap = buildSyntheticFleetHealthMap(count);
    const vm = buildFleetHealthServiceViewModel({
      vehicles,
      healthMap,
      healthLoading: false,
      taskList: [],
      vendors: [],
      serviceLoading: false,
      serviceError: null,
    });

    expect(vm.prioritizedOverviewRows.length).toBeLessThan(count);
    expect(vm.prioritizedOverviewRows.length / count).toBeLessThan(0.35);
    expect(vm.healthGroups.vehiclesNeedingAction.length).toBeLessThan(count);
  });
});
