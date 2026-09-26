import { assertLegalRunStatusTransition } from '../di-v0-shadow-run-status';

describe('DiV0Shadow run status machine', () => {
  it('allows PENDING -> RUNNING and RUNNING -> COMPLETED', () => {
    expect(() => assertLegalRunStatusTransition('PENDING', 'RUNNING')).not.toThrow();
    expect(() => assertLegalRunStatusTransition('RUNNING', 'COMPLETED')).not.toThrow();
  });

  it('forbids COMPLETED -> RUNNING', () => {
    expect(() => assertLegalRunStatusTransition('COMPLETED', 'RUNNING')).toThrow(
      /ILLEGAL_RUN_STATUS_TRANSITION/,
    );
  });

  it('forbids FAILED -> RUNNING', () => {
    expect(() => assertLegalRunStatusTransition('FAILED', 'RUNNING')).toThrow(
      /ILLEGAL_RUN_STATUS_TRANSITION/,
    );
  });
});
