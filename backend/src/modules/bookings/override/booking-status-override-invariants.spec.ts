import { inferOverrideInvariants } from './booking-status-override-invariants';

describe('booking-status-override-invariants', () => {
  it('infers terminal reactivation invariant', () => {
    const invariants = inferOverrideInvariants({
      fromStatus: 'CANCELLED',
      toStatus: 'CONFIRMED',
    });
    expect(invariants).toContain('STATUS_MACHINE_BYPASS');
    expect(invariants).toContain('TERMINAL_REACTIVATION');
  });

  it('infers financial invariants when cancelling via override', () => {
    const invariants = inferOverrideInvariants({
      fromStatus: 'ACTIVE',
      toStatus: 'CANCELLED',
    });
    expect(invariants).toContain('INVOICE_STATE');
    expect(invariants).toContain('PAYMENT_STATE');
    expect(invariants).toContain('DOCUMENT_STATE');
  });
});
