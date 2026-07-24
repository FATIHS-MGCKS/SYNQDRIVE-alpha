import { resolveOrgReportingCurrency } from '@synq/fx/fx.org-reporting-currency';

describe('resolveOrgReportingCurrency', () => {
  it('prefers explicit organization reporting currency', () => {
    const r = resolveOrgReportingCurrency({
      organizationReportingCurrency: 'GBP',
      paymentAccountDefaultCurrency: 'EUR',
      primaryPriceBookCurrency: 'USD',
    });
    expect(r).toEqual({ currency: 'GBP', source: 'organization_explicit' });
  });

  it('falls back to payment account default', () => {
    const r = resolveOrgReportingCurrency({
      paymentAccountDefaultCurrency: 'chf',
      primaryPriceBookCurrency: 'USD',
    });
    expect(r).toEqual({ currency: 'CHF', source: 'payment_account_default' });
  });

  it('falls back to price book primary', () => {
    const r = resolveOrgReportingCurrency({
      primaryPriceBookCurrency: 'pln',
    });
    expect(r).toEqual({ currency: 'PLN', source: 'price_book_primary' });
  });

  it('uses platform default only for org config — not document currency', () => {
    const r = resolveOrgReportingCurrency({ platformDefaultCurrency: 'EUR' });
    expect(r).toEqual({ currency: 'EUR', source: 'platform_default' });
  });

  it('uses platform default EUR when no org sources configured', () => {
    expect(resolveOrgReportingCurrency({})).toEqual({
      currency: 'EUR',
      source: 'platform_default',
    });
  });
});
