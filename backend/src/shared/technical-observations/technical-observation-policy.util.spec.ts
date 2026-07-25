import {
  handoverObservationIdempotencyKey,
  isObservationModuleCritical,
  resolveObservationBlocksRental,
  shouldAutoCreateTaskFromObservation,
  shouldAutoSetMaintenanceFromObservation,
} from './technical-observation-policy.util';

describe('technical-observation-policy.util', () => {
  it('never auto-sets maintenance from observations', () => {
    expect(shouldAutoSetMaintenanceFromObservation()).toBe(false);
  });

  it('never auto-creates tasks from observations', () => {
    expect(shouldAutoCreateTaskFromObservation()).toBe(false);
  });

  it('blocks rental only when explicitly true', () => {
    expect(resolveObservationBlocksRental(undefined)).toBe(false);
    expect(resolveObservationBlocksRental(false)).toBe(false);
    expect(resolveObservationBlocksRental(null)).toBe(false);
    expect(resolveObservationBlocksRental(true)).toBe(true);
  });

  it('critical severity is informational unless blocksRental is set', () => {
    expect(
      isObservationModuleCritical({ urgency: 'CRITICAL', blocksRental: false }),
    ).toBe(true);
    expect(
      isObservationModuleCritical({ urgency: 'MEDIUM', blocksRental: true }),
    ).toBe(true);
    expect(
      isObservationModuleCritical({ urgency: 'MEDIUM', blocksRental: false }),
    ).toBe(false);
  });

  it('handover idempotency key normalizes description', () => {
    const keyA = handoverObservationIdempotencyKey('proto-1', '  Wiper noise  ');
    const keyB = handoverObservationIdempotencyKey('proto-1', 'wiper noise');
    expect(keyA).toBe(keyB);
    expect(keyA).toBe('proto-1:wiper noise');
  });
});
