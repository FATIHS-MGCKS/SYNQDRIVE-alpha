import { OrganizationPaymentAccountStatus } from '@prisma/client';
import { mapStripeAccountToConnectedStatus, extractSafeBankLast4 } from './stripe-account.mapper';

describe('stripe-account.mapper', () => {
  it('maps active express account with capabilities', () => {
    const status = mapStripeAccountToConnectedStatus(
      {
        id: 'acct_test',
        charges_enabled: true,
        payouts_enabled: true,
        details_submitted: true,
        country: 'DE',
        default_currency: 'eur',
        requirements: {
          currently_due: [],
          past_due: [],
          pending_verification: [],
          disabled_reason: null,
        },
      } as never,
      false,
    );
    expect(status.status).toBe(OrganizationPaymentAccountStatus.ACTIVE);
    expect(status.country).toBe('DE');
    expect(status.defaultCurrency).toBe('EUR');
  });

  it('maps restricted account when requirements are due', () => {
    const status = mapStripeAccountToConnectedStatus(
      {
        charges_enabled: false,
        payouts_enabled: false,
        details_submitted: true,
        requirements: {
          currently_due: ['individual.verification.document'],
          past_due: [],
          pending_verification: [],
          disabled_reason: null,
        },
      } as never,
      false,
    );
    expect(status.status).toBe(OrganizationPaymentAccountStatus.RESTRICTED);
    expect(status.requirements.currentlyDue).toContain('individual.verification.document');
  });

  it('extracts only bank last4 from external accounts', () => {
    const last4 = extractSafeBankLast4({
      data: [
        {
          object: 'bank_account',
          last4: '3000',
          account: 'acct_test',
        } as never,
      ],
    } as never);
    expect(last4).toBe('3000');
  });
});
