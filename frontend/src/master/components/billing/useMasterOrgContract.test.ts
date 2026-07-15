// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      billing: {
        ...actual.api.billing,
        masterSubscriptionContract: vi.fn(),
        masterSubscriptionOverview: vi.fn(),
        masterSubscriptionHistory: vi.fn(),
        masterSubscriptionPreview: vi.fn(),
        masterSubscriptionCreateDraft: vi.fn(),
        masterSubscriptionPause: vi.fn(),
        adminSyncStripe: vi.fn(),
      },
    },
  };
});

import { api } from '../../../lib/api';
import type { AdminOrgBillingRowDto } from '../../types/admin-billing.types';

const row: AdminOrgBillingRowDto = {
  organization: { id: 'org-1', companyName: 'Acme GmbH', status: 'ACTIVE' },
  subscription: {
    id: 'sub-1',
    status: 'ACTIVE',
    lockVersion: 2,
    currentPeriodStart: '2026-07-01T00:00:00.000Z',
    currentPeriodEnd: '2026-07-31T00:00:00.000Z',
  },
  products: [],
  connectedVehicleCount: 3,
  billableVehicleCount: 2,
  currentTier: null,
  priceStatus: 'OK',
  projectedMonthlyAmountCents: 3570,
  paymentMethodStatus: 'ACTIVE',
  lastInvoice: null,
  nextInvoicePreview: {
    subtotalCents: 3570,
    totalCents: 3570,
    calculationStatus: 'OK',
    billableVehicleCount: 2,
  },
  warnings: [],
};

describe('useMasterOrgContract core actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.billing.masterSubscriptionContract).mockResolvedValue({
      organizationId: 'org-1',
      subscription: { id: 'sub-1', lockVersion: 2 },
      contract: { lockVersion: 2, domainStatus: 'ACTIVE', baseItem: null, items: [] },
    });
    vi.mocked(api.billing.masterSubscriptionOverview).mockResolvedValue({
      contract: { statusLabel: 'Aktiv' },
      pricing: { billableVehicleCount: 2, discounts: [] },
      billing: { nextChargeAt: '2026-07-31T00:00:00.000Z' },
      paymentMethod: { statusLabel: 'Bereit' },
    });
    vi.mocked(api.billing.masterSubscriptionHistory).mockResolvedValue({
      organizationId: 'org-1',
      auditEntries: [],
      items: [],
      subscription: null,
    });
    vi.mocked(api.billing.masterSubscriptionCreateDraft).mockResolvedValue({ organizationId: 'org-1' });
    vi.mocked(api.billing.masterSubscriptionPause).mockResolvedValue({ organizationId: 'org-1' });
    vi.mocked(api.billing.adminSyncStripe).mockResolvedValue({ message: 'Stripe vorbereitet' });
    vi.mocked(api.billing.masterSubscriptionPreview).mockResolvedValue({
      organizationId: 'org-1',
      mutating: false,
      effectiveAt: '2026-07-15T00:00:00.000Z',
      current: {
        productKey: 'RENTAL',
        priceBookId: null,
        priceVersionId: 'ver-1',
        priceVersionLabel: 'v1',
        quantity: 2,
        baseAmountCents: 3570,
        amountAfterDiscountCents: 3570,
        discounts: [],
      },
      proposed: {
        productKey: 'RENTAL',
        priceVersionId: 'ver-2',
        anchorDay: null,
        quantity: 2,
        baseAmountCents: 4200,
        amountAfterDiscountCents: 4200,
        discounts: [],
      },
      proration: { proratedBillableQuantity: 2, proratedSubtotalCents: 2100 },
      warnings: [],
    });
  });

  it('loads contract data for an organization', async () => {
    const { useMasterOrgContract } = await import('./useMasterOrgContract');
    const { renderHook, waitForHook } = await import('../../../test/renderHook');

    const { result, unmount } = renderHook(
      ({ open }: { open: boolean }) => useMasterOrgContract(row, open),
      { initialProps: { open: true } },
    );

    await waitForHook(() => !result.current.loading);
    expect(api.billing.masterSubscriptionContract).toHaveBeenCalledWith('org-1');
    expect(result.current.overview?.contract?.statusLabel).toBe('Aktiv');
    unmount();
  });

  it('sends idempotency key for draft creation', async () => {
    const { useMasterOrgContract } = await import('./useMasterOrgContract');
    const { renderHook, waitForHook } = await import('../../../test/renderHook');

    const { result, unmount } = renderHook(() => useMasterOrgContract(row, true));
    await waitForHook(() => !result.current.loading);

    await result.current.runMutation('draft', { currency: 'EUR' });

    expect(api.billing.masterSubscriptionCreateDraft).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({ currency: 'EUR', lockVersion: 2 }),
      expect.stringContaining('master-contract:draft:org-1:'),
    );
    unmount();
  });

  it('runs preview before mutating price version changes', async () => {
    const { useMasterOrgContract } = await import('./useMasterOrgContract');
    const { renderHook, waitForHook } = await import('../../../test/renderHook');

    const { result, unmount } = renderHook(() => useMasterOrgContract(row, true));
    await waitForHook(() => !result.current.loading);

    const preview = await result.current.runPreview({ priceVersionId: 'ver-2' });
    expect(preview?.proposed.priceVersionId).toBe('ver-2');
    expect(api.billing.masterSubscriptionPreview).toHaveBeenCalledWith('org-1', {
      priceVersionId: 'ver-2',
    });
    unmount();
  });
});
