import { canCancelInvoice } from './invoice-domain.util';

describe('invoice-domain.util', () => {
  describe('canCancelInvoice', () => {
    it('allows cancel on issued unpaid invoice', () => {
      expect(canCancelInvoice('ISSUED', 0, 10000)).toBe(true);
    });

    it('blocks cancel on paid invoice', () => {
      expect(canCancelInvoice('PAID', 10000, 10000)).toBe(false);
    });

    it('blocks cancel when fully paid by cents', () => {
      expect(canCancelInvoice('ISSUED', 5000, 5000)).toBe(false);
    });

    it('blocks cancel on terminal statuses', () => {
      expect(canCancelInvoice('CANCELLED', 0, 10000)).toBe(false);
      expect(canCancelInvoice('VOID', 0, 10000)).toBe(false);
    });
  });
});
