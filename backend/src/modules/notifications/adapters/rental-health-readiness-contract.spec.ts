import type { VehicleHealth } from '@modules/rental-health/rental-health.types';
import { resolveRentalBlockedState } from '@modules/rental-health/rental-health.types';

describe('RentalHealth rental_blocked ↔ rental_readiness contract (P2.3)', () => {
  function deriveReadiness(
    availability: VehicleHealth['availability'],
    blockingReasons: string[],
  ): VehicleHealth['rental_readiness'] {
    const rental_blocked = resolveRentalBlockedState(availability, blockingReasons);
    return availability !== 'ready' || rental_blocked === null
      ? 'unevaluable'
      : rental_blocked
        ? 'not_ready'
        : 'ready';
  }

  it('availability=ready: rental_blocked=true ⇔ rental_readiness=not_ready', () => {
    expect(deriveReadiness('ready', ['tire critical'])).toBe('not_ready');
    expect(resolveRentalBlockedState('ready', ['tire critical'])).toBe(true);
  });

  it('availability=ready: rental_blocked=false ⇔ rental_readiness=ready', () => {
    expect(deriveReadiness('ready', [])).toBe('ready');
    expect(resolveRentalBlockedState('ready', [])).toBe(false);
  });

  it('availability!=ready: rental_blocked=null and rental_readiness=unevaluable', () => {
    for (const availability of ['partial', 'unavailable'] as const) {
      expect(resolveRentalBlockedState(availability, ['tire critical'])).toBeNull();
      expect(deriveReadiness(availability, ['tire critical'])).toBe('unevaluable');
    }
  });
});
