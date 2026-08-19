import type { VehicleHealth } from '@modules/rental-health/rental-health.types';
import {
  deriveRentalReadiness,
  resolveRentalBlockedState,
} from '@modules/rental-health/rental-health.types';

describe('RentalHealth rental_blocked ↔ rental_readiness contract (P2.3)', () => {
  function productionReadiness(
    availability: VehicleHealth['availability'],
    blockingReasons: string[],
  ): VehicleHealth['rental_readiness'] {
    const rental_blocked = resolveRentalBlockedState(availability, blockingReasons);
    return deriveRentalReadiness(availability, rental_blocked);
  }

  it('availability=ready + rental_blocked=true → not_ready', () => {
    expect(productionReadiness('ready', ['tire critical'])).toBe('not_ready');
    expect(resolveRentalBlockedState('ready', ['tire critical'])).toBe(true);
  });

  it('availability=ready + rental_blocked=false → ready', () => {
    expect(productionReadiness('ready', [])).toBe('ready');
    expect(resolveRentalBlockedState('ready', [])).toBe(false);
  });

  it('availability!=ready → rental_blocked=null and rental_readiness=unevaluable', () => {
    for (const availability of ['partial', 'unavailable'] as const) {
      expect(resolveRentalBlockedState(availability, ['tire critical'])).toBeNull();
      expect(productionReadiness(availability, ['tire critical'])).toBe('unevaluable');
    }
  });

  it('deriveRentalReadiness is the exact ternary RentalHealthService uses', () => {
    const cases: Array<{
      availability: VehicleHealth['availability'];
      rental_blocked: boolean | null;
      expected: VehicleHealth['rental_readiness'];
    }> = [
      { availability: 'ready', rental_blocked: true, expected: 'not_ready' },
      { availability: 'ready', rental_blocked: false, expected: 'ready' },
      { availability: 'ready', rental_blocked: null, expected: 'unevaluable' },
      { availability: 'partial', rental_blocked: null, expected: 'unevaluable' },
      { availability: 'unavailable', rental_blocked: null, expected: 'unevaluable' },
    ];

    for (const { availability, rental_blocked, expected } of cases) {
      expect(deriveRentalReadiness(availability, rental_blocked)).toBe(expected);
    }
  });
});
