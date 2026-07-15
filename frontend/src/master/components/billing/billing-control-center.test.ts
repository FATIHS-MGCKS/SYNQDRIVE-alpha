// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { waitForHook } from '../../../test/renderHook';

vi.mock('../../../lib/auth', () => ({
  hasMasterBillingAccess: vi.fn(() => true),
  isMasterAdmin: vi.fn(() => true),
  getStoredUser: vi.fn(() => ({ platformRole: 'MASTER_ADMIN' })),
}));

vi.mock('../../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      billing: {
        ...actual.api.billing,
        overview: vi.fn(),
        organizations: vi.fn(),
        pricebooks: vi.fn(),
        adminInvoices: vi.fn(),
        adminPaymentMethods: vi.fn(),
        adminStripeStatus: vi.fn(),
        adminWebhookEvents: vi.fn(),
        auditLog: vi.fn(),
      },
    },
  };
});

import { hasMasterBillingAccess } from '../../../lib/auth';
import { api } from '../../../lib/api';
import { SubscriptionsView } from '../SubscriptionsView';
import { BillingControlCenter } from './BillingControlCenter';
import { buildMasterBillingSearch } from './master-billing-navigation';

describe('Master billing navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, '', '/master');
    vi.mocked(hasMasterBillingAccess).mockReturnValue(true);
    vi.mocked(api.billing.overview).mockResolvedValue({
      mrr: 100,
      arr: 1200,
      activeSubscriptions: 2,
      trialingSubscriptions: 1,
      pastDueSubscriptions: 0,
      openInvoices: 0,
      missingPaymentMethods: 0,
      billableConnectedVehicles: 5,
      organizationsWithPriceNotConfigured: 0,
      stripeSyncErrors: 0,
      failedPayments: 0,
      reconciliationDrifts: 0,
      failedEmailDeliveries: 0,
      pricingConfigured: true,
    });
    vi.mocked(api.billing.organizations).mockResolvedValue([]);
    vi.mocked(api.billing.pricebooks).mockResolvedValue([]);
    vi.mocked(api.billing.adminInvoices).mockResolvedValue({ data: [], total: 0, page: 1, limit: 50 });
    vi.mocked(api.billing.adminPaymentMethods).mockResolvedValue([]);
    vi.mocked(api.billing.adminStripeStatus).mockResolvedValue({
      integrationStatus: 'CONNECTED',
      stripeSecretConfigured: true,
      stripeWebhookConfigured: true,
      stripeCustomerMappingCount: 1,
      webhookEventCount: 1,
      failedWebhookCount: 0,
      recentEvents: [],
    });
    vi.mocked(api.billing.adminWebhookEvents).mockResolvedValue({ data: [], total: 0, page: 1, limit: 50 });
    vi.mocked(api.billing.auditLog).mockResolvedValue({ data: [], total: 0, page: 1, limit: 100 });
  });

  it('SubscriptionsView is a deprecated alias for BillingControlCenter', () => {
    expect(SubscriptionsView).toBe(BillingControlCenter);
  });

  it('denies access without master billing permission', async () => {
    vi.mocked(hasMasterBillingAccess).mockReturnValue(false);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(BillingControlCenter));
    });

    await waitForHook(() => document.body.textContent?.includes('Kein Zugriff') ?? false);

    expect(document.body.textContent).toContain('Kein Zugriff');
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('reads active section from deep link on mount', async () => {
    window.history.replaceState(
      null,
      '',
      buildMasterBillingSearch({ section: 'pricing' }),
    );

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(BillingControlCenter));
    });

    await waitForHook(() =>
      Boolean(document.querySelector('[data-testid="master-billing-section-pricing"][aria-selected="true"]')),
    );

    expect(document.querySelector('[data-testid="master-billing-section-pricing"]')?.getAttribute('aria-selected')).toBe(
      'true',
    );

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('updates url when switching sections', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(BillingControlCenter));
    });

    await waitForHook(() =>
      Boolean(document.querySelector('[data-testid="master-billing-section-tabbar"]')),
    );

    const auditTab = document.querySelector(
      '[data-testid="master-billing-section-audit"]',
    ) as HTMLButtonElement;

    await act(async () => {
      auditTab.click();
    });

    await waitForHook(() => window.location.search.includes('masterBilling=audit'));

    expect(window.location.search).toContain('masterBilling=audit');
    expect(window.location.search).toContain('masterBillingTab=contracts');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('supports browser back and forward between sections', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(BillingControlCenter));
    });

    await waitForHook(() =>
      Boolean(document.querySelector('[data-testid="master-billing-section-tabbar"]')),
    );

    await act(async () => {
      (document.querySelector('[data-testid="master-billing-section-pricing"]') as HTMLButtonElement).click();
    });
    await waitForHook(() => window.location.search.includes('masterBilling=pricing'));

    await act(async () => {
      (document.querySelector('[data-testid="master-billing-section-audit"]') as HTMLButtonElement).click();
    });
    await waitForHook(() => window.location.search.includes('masterBilling=audit'));

    await act(async () => {
      window.history.back();
    });
    await waitForHook(() => window.location.search.includes('masterBilling=pricing'));
    await waitForHook(
      () =>
        document
          .querySelector('[data-testid="master-billing-section-pricing"]')
          ?.getAttribute('aria-selected') === 'true',
    );

    await act(async () => {
      window.history.forward();
    });
    await waitForHook(() => window.location.search.includes('masterBilling=audit'));
    await waitForHook(
      () =>
        document.querySelector('[data-testid="master-billing-section-audit"]')?.getAttribute('aria-selected') ===
        'true',
    );

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('renders section tab bar with horizontal scroll for mobile', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(BillingControlCenter));
    });

    await waitForHook(() =>
      Boolean(document.querySelector('[data-testid="master-billing-section-tabbar"]')),
    );

    const scroll = document.querySelector('[data-testid="master-billing-section-tabbar"] > div');
    expect(scroll?.className).toContain('overflow-x-auto');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
