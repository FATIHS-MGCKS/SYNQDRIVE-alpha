import {
  computeInvoiceTotals,
  parseLegacyLineItems,
} from './invoice-line-items.util';

describe('invoice-line-items.util — tax fallback', () => {
  const org19 = { defaultVatRate: 19, isSmallBusiness: false };
  const org7 = { defaultVatRate: 7, isSmallBusiness: false };
  const org0 = { isSmallBusiness: true };

  describe('computeInvoiceTotals', () => {
    it('0% small business: gross equals net', () => {
      const totals = computeInvoiceTotals(
        [{ description: 'Miete', quantity: 1, unitPriceNetCents: 10000, taxRate: 0 }],
        undefined,
        { orgTax: org0 },
      );
      expect(totals.subtotalCents).toBe(10000);
      expect(totals.taxCents).toBe(0);
      expect(totals.totalCents).toBe(10000);
    });

    it('7% org default on empty lines splits gross', () => {
      const totals = computeInvoiceTotals([], 10700, { orgTax: org7 });
      expect(totals.subtotalCents).toBe(10000);
      expect(totals.taxCents).toBe(700);
      expect(totals.totalCents).toBe(10700);
      expect(totals.taxMeta?.assumedTaxRatePercent).toBe(7);
    });

    it('19% line items sum consistently', () => {
      const totals = computeInvoiceTotals(
        [
          { description: 'A', quantity: 2, unitPriceNetCents: 1000, taxRate: 19 },
          { description: 'B', quantity: 1, unitPriceNetCents: 5000, taxRate: 19 },
        ],
        undefined,
        { orgTax: org19 },
      );
      expect(totals.subtotalCents).toBe(7000);
      expect(totals.taxCents).toBe(1330);
      expect(totals.totalCents).toBe(8330);
    });

    it('mixed 0% and 19% positions', () => {
      const totals = computeInvoiceTotals(
        [
          { description: 'steuerfrei', quantity: 1, unitPriceNetCents: 2000, taxRate: 0 },
          { description: 'standard', quantity: 1, unitPriceNetCents: 10000, taxRate: 19 },
        ],
        undefined,
        { orgTax: org19 },
      );
      expect(totals.subtotalCents).toBe(12000);
      expect(totals.taxCents).toBe(1900);
      expect(totals.totalCents).toBe(13900);
    });

    it('rounding: per-line tax rounds before sum', () => {
      const totals = computeInvoiceTotals(
        [{ description: 'x', quantity: 3, unitPriceNetCents: 333, taxRate: 19 }],
        undefined,
        { orgTax: org19 },
      );
      expect(totals.lineItems[0].netCents).toBe(999);
      expect(totals.lineItems[0].taxCents).toBe(190);
      expect(totals.totalCents).toBe(1189);
    });

    it('cent-precise gross split fallback without /1.19 hardcode', () => {
      const totals = computeInvoiceTotals([], 11900, { orgTax: org19 });
      expect(totals.subtotalCents + totals.taxCents).toBe(11900);
      expect(totals.taxMeta?.usedLegacyGrossSplit).toBe(true);
    });
  });

  describe('parseLegacyLineItems', () => {
    it('infers tax from net/tax cents on legacy row', () => {
      const items = parseLegacyLineItems(
        [{ description: 'Pos', quantity: 1, netCents: 10000, taxCents: 700 }],
        { orgTax: org7 },
      );
      expect(items[0].taxRate).toBe(7);
    });

    it('splits legacy gross using org default rate', () => {
      const items = parseLegacyLineItems(
        [{ description: 'Pos', quantity: 1, totalCents: 10700 }],
        { orgTax: org7 },
      );
      expect(items[0].unitPriceNetCents).toBe(10000);
      expect(items[0].taxRate).toBe(7);
    });
  });
});
