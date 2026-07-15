// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitForHook } from '../../../test/renderHook';

vi.mock('../../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      billing: {
        ...actual.api.billing,
        orgSubscriptionOverview: vi.fn(),
        orgBillableVehicles: vi.fn(),
        orgVehicleLicenses: vi.fn(),
        orgInvoices: vi.fn(),
        orgPaymentMethods: vi.fn(),
        orgPayments: vi.fn(),
      },
    },
  };
});

import { api } from '../../../lib/api';
import { useBillingData } from './useBillingData';
import {
  BILLING_ORG_MISSING_MESSAGE,
  BILLING_PERMISSION_DENIED_MESSAGE,
} from './billing-load.utils';

const emptyPage = { data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } };

describe('useBillingData isolation', () => {
  let unmountCurrent: (() => void) | null = null;

  afterEach(() => {
    unmountCurrent?.();
    unmountCurrent = null;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.billing.orgSubscriptionOverview).mockResolvedValue({
      plan: { kind: 'RENTAL', name: 'SynqDrive Rental' },
      contract: {
        status: 'ACTIVE',
        statusLabel: 'Aktiv',
        currentPeriodStart: '2026-07-01T00:00:00.000Z',
        currentPeriodEnd: '2026-07-31T00:00:00.000Z',
      },
      pricing: {
        billableVehicleCount: 2,
        connectedVehicleCount: 3,
        grossAmount: { cents: 3570, currency: 'EUR', formatted: '35,70 €' },
      },
      paymentMethod: { status: 'READY', defaultMethod: null },
      warnings: [],
    });
    vi.mocked(api.billing.orgBillableVehicles).mockResolvedValue({ billableVehicleCount: 2 });
    vi.mocked(api.billing.orgVehicleLicenses).mockResolvedValue(emptyPage);
    vi.mocked(api.billing.orgInvoices).mockResolvedValue(emptyPage);
    vi.mocked(api.billing.orgPaymentMethods).mockResolvedValue({
      configured: true,
      defaultMethodId: null,
      paymentMethods: [],
    });
    vi.mocked(api.billing.orgPayments).mockResolvedValue(emptyPage);
  });

  it('exposes independent section loaders without central Promise.all', () => {
    const { result, unmount } = renderHook(() => useBillingData('org-a'));
    unmountCurrent = unmount;

    expect(result.current.sections.overview).toBeDefined();
    expect(result.current.sections.invoices).toBeDefined();
    expect(result.current.sections.paymentMethods).toBeDefined();
    expect(result.current.sections.vehicles).toBeDefined();
    expect(result.current.sections.paymentHistory).toBeDefined();
  });

  it('keeps overview available when invoices endpoint fails', async () => {
    vi.mocked(api.billing.orgInvoices).mockRejectedValue(
      new Error('API error 503 (/billing/invoices)'),
    );

    const { result, unmount } = renderHook(() => useBillingData('org-a'));
    unmountCurrent = unmount;

    await waitForHook(() => !result.current.sections.overview.loading);
    await waitForHook(() => !result.current.sections.invoices.loading);

    expect(result.current.sections.overview.error).toBeNull();
    expect(result.current.sections.overview.summary).not.toBeNull();
    expect(result.current.sections.invoices.error).toMatch(/503|Abrechnungsdaten/);
    expect(result.current.sections.paymentMethods.error).toBeNull();
  });

  it('maps permission errors per section without blocking others', async () => {
    vi.mocked(api.billing.orgInvoices).mockRejectedValue(
      new Error('Missing permission: billing.read'),
    );
    vi.mocked(api.billing.orgPaymentMethods).mockRejectedValue(
      new Error('You do not have access to this organization'),
    );

    const { result, unmount } = renderHook(() => useBillingData('org-a'));
    unmountCurrent = unmount;

    await waitForHook(() => !result.current.sections.invoices.loading);
    await waitForHook(() => !result.current.sections.paymentMethods.loading);

    expect(result.current.sections.invoices.error).toBe(BILLING_PERMISSION_DENIED_MESSAGE);
    expect(result.current.sections.paymentMethods.error).toBe(BILLING_PERMISSION_DENIED_MESSAGE);
    expect(result.current.sections.overview.error).toBeNull();
  });

  it('requires explicit orgId and does not fetch without it', async () => {
    const { result, unmount } = renderHook(() => useBillingData(undefined));
    unmountCurrent = unmount;

    await waitForHook(() => !result.current.sections.overview.loading);

    expect(result.current.sections.overview.error).toBe(BILLING_ORG_MISSING_MESSAGE);
    expect(api.billing.orgSubscriptionOverview).not.toHaveBeenCalled();
    expect(api.billing.orgInvoices).not.toHaveBeenCalled();
  });
});
