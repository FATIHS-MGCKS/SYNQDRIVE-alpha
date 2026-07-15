// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { BillingOrganizationsTab } from './BillingOrganizationsTab';
import type { AdminOrgBillingRowDto } from '../../types/admin-billing.types';

const sampleRow: AdminOrgBillingRowDto = {
  organization: { id: 'org-1', companyName: 'Acme GmbH', status: 'ACTIVE' },
  subscription: {
    id: 'sub-1',
    status: 'ACTIVE',
    currentPeriodStart: '2026-07-01T00:00:00.000Z',
    currentPeriodEnd: '2026-07-31T00:00:00.000Z',
  },
  tariffLabel: 'Rental',
  contract: { productKey: 'RENTAL', productName: 'Rental', priceBookId: null, priceBookName: null, priceVersionId: 'ver-1', priceVersionLabel: 'v1', priceVersionStatus: 'ACTIVE' },
  products: [],
  connectedVehicleCount: 3,
  billableVehicleCount: 2,
  currentTier: null,
  priceStatus: 'OK',
  projectedMonthlyAmountCents: 3570,
  discountCents: 0,
  paymentMethodStatus: 'ACTIVE',
  lastInvoice: null,
  openAmountCents: 0,
  nextChargeAt: '2026-07-31T00:00:00.000Z',
  syncStatus: 'SYNCED',
  nextInvoicePreview: {
    subtotalCents: 3570,
    totalCents: 3570,
    calculationStatus: 'OK',
    billableVehicleCount: 2,
  },
  warnings: [],
};

describe('BillingOrganizationsTab contract columns', () => {
  it('renders required master contract table headers', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(BillingOrganizationsTab, {
          organizations: [sampleRow],
          onSelectOrg: () => {},
        }),
      );
    });

    const headers = Array.from(container.querySelectorAll('th')).map((cell) => cell.textContent);
    expect(headers).toEqual([
      'Unternehmen',
      'Tarif',
      'Status',
      'Fahrzeuge',
      'Price Version',
      'Monatswert',
      'Rabatt',
      'Zahlung',
      'Letzte Rechnung',
      'Offen',
      'Nächste Abbuchung',
      'Sync',
    ]);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
