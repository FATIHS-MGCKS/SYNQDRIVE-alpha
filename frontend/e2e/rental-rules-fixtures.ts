import { expect, type Page } from '@playwright/test';

export const TEST_ORG_ID = 'org-rental-rules-e2e';

export const mockUser = {
  id: 'user-rental-rules-e2e',
  email: 'ops@synqdrive.eu',
  name: 'Rental Rules E2E',
  platformRole: 'ORG_USER',
  membershipRole: 'ORG_ADMIN',
  organizationId: TEST_ORG_ID,
  organizationName: 'Rental Rules E2E GmbH',
  organizationLogoUrl: null,
  permissions: {
    rental_rules: {
      read: true,
      write: true,
      publish: true,
      manage_overrides: true,
      assign_vehicles: true,
    },
    booking_eligibility: { review: true, override: true },
    bookings: { read: true, write: true, manage: true },
    fleet: { read: true, write: true, manage: true },
    vehicles: { read: true, write: true, manage: true },
    settings: { read: true, write: true, manage: true },
  },
};

const overview = {
  organizationDefaults: {
    id: 'org-defaults-e2e',
    organizationId: TEST_ORG_ID,
    minimumAgeYears: 21,
    minimumLicenseHoldingMonths: 12,
    depositAmountCents: 50000,
    depositCurrency: 'EUR',
    creditCardRequired: true,
    foreignTravelPolicy: 'EU_ONLY',
    additionalDriverPolicy: 'ALLOWED',
    youngDriverPolicy: 'SURCHARGE',
    insuranceRequirement: 'FULL',
    manualApprovalRequired: false,
    notes: null,
    isActive: true,
    version: 3,
    createdAt: '2026-07-01T10:00:00.000Z',
    updatedAt: '2026-07-23T10:00:00.000Z',
    draftRevision: null,
    activeRevision: {
      id: 'rev-active-e2e',
      version: 3,
      status: 'ACTIVE',
      rulesHash: 'abc123',
      publishedAt: '2026-07-23T10:00:00.000Z',
    },
  },
  categories: [
    {
      id: 'cat-suv-e2e',
      name: 'SUV Premium',
      status: 'ACTIVE',
      vehicleCount: 4,
      isComplete: true,
      hasDraft: false,
      activeVersion: 2,
    },
  ],
  overrideVehicles: [],
  stats: {
    activeCategoryCount: 1,
    draftCount: 0,
    overrideCount: 0,
    affectedVehicleCount: 4,
  },
};

export function resetRentalRulesMockState(): void {
  // Playwright route handlers are registered per page in openRentalRulesSettings.
}

export async function openRentalRulesSettings(page: Page): Promise<void> {
  await page.route('**/api/v1/auth/me', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockUser) });
  });

  await page.route(`**/api/v1/organizations/${TEST_ORG_ID}/rental-rules/overview`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(overview) });
  });

  await page.route(`**/api/v1/organizations/${TEST_ORG_ID}/rental-rules/categories**`, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'cat-suv-e2e',
            organizationId: TEST_ORG_ID,
            name: 'SUV Premium',
            status: 'ACTIVE',
            vehicleType: 'SUV',
            version: 2,
            minimumAgeYears: null,
            isActive: true,
            vehicleCount: 4,
          },
        ]),
      });
      return;
    }
    await route.continue();
  });

  await page.route(`**/api/v1/organizations/${TEST_ORG_ID}/rental-rules/fleet-vehicles`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
  });

  await page.route(`**/api/v1/organizations/${TEST_ORG_ID}/rental-rules/defaults`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(overview.organizationDefaults),
    });
  });

  await page.route(`**/api/v1/organizations/${TEST_ORG_ID}/rental-rules/defaults/preview**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ mode: 'active', rules: overview.organizationDefaults }),
    });
  });

  await page.goto(`/rental/${TEST_ORG_ID}/settings?tab=rental-rules`);
  await expect(page.getByRole('heading', { name: /Mietregeln/i })).toBeVisible({ timeout: 30_000 });
}
