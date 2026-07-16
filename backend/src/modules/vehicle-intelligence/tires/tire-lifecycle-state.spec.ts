import { TireSetupStatus } from '@prisma/client';
import {
  assertHealthEligibleSetup,
  assertSetupStatusTransition,
  isHealthEligibleSetupStatus,
  normalizeSetupLifecycleState,
  canTransitionSetupStatus,
  isTerminalSetupStatus,
  mapArchiveStatus,
  rethrowLifecycleInvariantViolation,
  isUniqueActiveSetupViolation,
  isUniqueActiveTirePositionViolation,
} from './tire-lifecycle-state';

describe('tire-lifecycle-state', () => {
  it('defines allowed lifecycle transitions', () => {
    expect(canTransitionSetupStatus(TireSetupStatus.NEW, TireSetupStatus.ACTIVE)).toBe(true);
    expect(canTransitionSetupStatus(TireSetupStatus.ACTIVE, TireSetupStatus.STORED)).toBe(true);
    expect(canTransitionSetupStatus(TireSetupStatus.STORED, TireSetupStatus.ACTIVE)).toBe(true);
    expect(canTransitionSetupStatus(TireSetupStatus.ACTIVE, TireSetupStatus.REMOVED)).toBe(true);
    expect(canTransitionSetupStatus(TireSetupStatus.STORED, TireSetupStatus.RETIRED)).toBe(true);
    expect(canTransitionSetupStatus(TireSetupStatus.REMOVED, TireSetupStatus.ACTIVE)).toBe(false);
    expect(canTransitionSetupStatus(TireSetupStatus.RETIRED, TireSetupStatus.ACTIVE)).toBe(false);
  });

  it('rejects invalid transitions with context', () => {
    expect(() =>
      assertSetupStatusTransition(TireSetupStatus.REMOVED, TireSetupStatus.ACTIVE, 'reactivate'),
    ).toThrow(/Invalid tire setup lifecycle transition/);
  });

  it('normalizes legacy DISCARDED/SOLD to RETIRED lifecycle bucket', () => {
    expect(normalizeSetupLifecycleState(TireSetupStatus.DISCARDED)).toBe('RETIRED');
    expect(normalizeSetupLifecycleState(TireSetupStatus.SOLD)).toBe('RETIRED');
    expect(normalizeSetupLifecycleState(TireSetupStatus.ACTIVE)).toBe('ACTIVE');
  });

  it('only ACTIVE setups are health-eligible', () => {
    expect(isHealthEligibleSetupStatus(TireSetupStatus.ACTIVE)).toBe(true);
    expect(isHealthEligibleSetupStatus(TireSetupStatus.STORED)).toBe(false);
    expect(isHealthEligibleSetupStatus(TireSetupStatus.NEW)).toBe(false);
    expect(() => assertHealthEligibleSetup(TireSetupStatus.STORED, 'rotate')).toThrow(
      /not eligible for current health operations/,
    );
  });

  it('maps legacy archive statuses to canonical targets', () => {
    expect(mapArchiveStatus(TireSetupStatus.DISCARDED)).toBe(TireSetupStatus.RETIRED);
    expect(mapArchiveStatus(TireSetupStatus.SOLD)).toBe(TireSetupStatus.RETIRED);
    expect(mapArchiveStatus(null)).toBe(TireSetupStatus.STORED);
  });

  it('detects unique-index violation codes for lifecycle conflicts', () => {
    expect(
      isUniqueActiveSetupViolation({
        code: 'P2002',
        meta: { target: ['vehicle_tire_setups_one_active_setup_per_vehicle'] },
      }),
    ).toBe(true);
    expect(
      isUniqueActiveTirePositionViolation({
        code: 'P2002',
        meta: { target: ['tires_one_active_tire_per_setup_position'] },
      }),
    ).toBe(true);
  });

  it('rethrows lifecycle unique violations as ConflictException', () => {
    expect(() =>
      rethrowLifecycleInvariantViolation({
        code: 'P2002',
        meta: { target: ['vehicle_tire_setups_one_active_setup_per_vehicle'] },
      }),
    ).toThrow(/already has an active tire setup/);
  });

  it('marks REMOVED and RETIRED as terminal', () => {
    expect(isTerminalSetupStatus(TireSetupStatus.REMOVED)).toBe(true);
    expect(isTerminalSetupStatus(TireSetupStatus.RETIRED)).toBe(true);
    expect(isTerminalSetupStatus(TireSetupStatus.ACTIVE)).toBe(false);
  });
});
