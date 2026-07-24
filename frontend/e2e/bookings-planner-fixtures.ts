/**
 * Playwright fixtures for Booking planner E2E (rental bookings view).
 */
import { expect, type Page, type Route } from '@playwright/test';

export const BOOKING_E2E_ORG_ID = 'org-booking-e2e';
export const BOOKING_E2E_FOREIGN_ORG_ID = 'org-foreign-booking';

export const mockUser = {
  id: 'user-booking-e2e',
  email: 'bookings@synqdrive.eu',
  name: 'Booking E2E',
  platformRole: 'ORG_USER',
  membershipRole: 'ORG_ADMIN',
  organizationId: BOOKING_E2E_ORG_ID,
  organizationName: 'Booking E2E GmbH',
  organizationLogoUrl: null,
  permissions: {
    bookings: { read: true, write: true, manage: true },
    fleet: { read: true, write: true, manage: true },
    customers: { read: true, write: true, manage: true },
    invoices: { read: true, write: true, manage: true },
    tasks: { read: true, write: true, manage: true },
  },
};

type BookingRow = {
  id: string;
  vehicleId: string;
  customerId: string;
  customerName: string;
  vehicleName: string;
  vehicleLicense: string;
  startDate: string;
  endDate: string;
  status: string;
  statusEnum: string;
  pickupProtocol: null | { id: string; kind: string; odometerKm: number; hasCustomerSignature?: boolean };
  returnProtocol: null;
  dailyRateCents: number;
  totalPriceCents: number;
  currency: string;
  kmIncluded: number;
  kmDriven: number;
  notes: string | null;
  insuranceOptions: unknown[];
  extras: unknown[];
  station: string;
  pickupStationName: string;
  returnStationName: string;
  pickupStationId: string;
  returnStationId: string;
  isOneWayRental: boolean;
  actualPickupStationId: string | null;
  actualReturnStationId: string | null;
};

const state = {
  failNextList: false,
  bookings: new Map<string, BookingRow>(),
};

function seedBookings() {
  state.bookings.clear();
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() + 1);
  const end = new Date(start);
  end.setDate(end.getDate() + 3);

  state.bookings.set('bk-e2e-confirmed', {
    id: 'bk-e2e-confirmed',
    vehicleId: 'veh-e2e-1',
    customerId: 'cust-e2e-1',
    customerName: 'Anna Schmidt',
    vehicleName: 'BMW 320i',
    vehicleLicense: 'M-E2E 100',
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    status: 'Bestätigt',
    statusEnum: 'CONFIRMED',
    pickupProtocol: null,
    returnProtocol: null,
    dailyRateCents: 8900,
    totalPriceCents: 26700,
    currency: 'EUR',
    kmIncluded: 300,
    kmDriven: 0,
    notes: null,
    insuranceOptions: [],
    extras: [],
    station: 'Hauptstation',
    pickupStationName: 'Hauptstation',
    returnStationName: 'Hauptstation',
    pickupStationId: 'st-e2e-1',
    returnStationId: 'st-e2e-1',
    isOneWayRental: false,
    actualPickupStationId: null,
    actualReturnStationId: null,
  });

  state.bookings.set('bk-e2e-active', {
    ...state.bookings.get('bk-e2e-confirmed')!,
    id: 'bk-e2e-active',
    customerName: 'Max Müller',
    vehicleName: 'Audi A4',
    vehicleLicense: 'M-E2E 200',
    status: 'Aktiv',
    statusEnum: 'ACTIVE',
    pickupProtocol: { id: 'proto-1', kind: 'PICKUP', odometerKm: 12000, hasCustomerSignature: true },
  });
}

export function resetBookingMockState() {
  state.failNextList = false;
  seedBookings();
}

export function setFailNextBookingList(value: boolean) {
  state.failNextList = value;
}

async function installBookingMocks(page: Page) {
  await page.route('**/api/**', async (route: Route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes('/auth/me') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockUser),
      });
    }

    if (url.includes(`/organizations/${BOOKING_E2E_ORG_ID}/bookings`) && method === 'GET' && !url.includes('/bookings/')) {
      if (state.failNextList) {
        state.failNextList = false;
        return route.fulfill({ status: 503, body: 'Service unavailable' });
      }
      const data = Array.from(state.bookings.values());
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data, meta: { total: data.length, page: 1, limit: 500 } }),
      });
    }

    if (url.includes(`/organizations/${BOOKING_E2E_ORG_ID}/fleet-map`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'veh-e2e-1',
            vehicleName: 'BMW 320i',
            make: 'BMW',
            model: '320i',
            year: 2024,
            licensePlate: 'M-E2E 100',
            license: 'M-E2E 100',
            lat: 52.52,
            lng: 13.405,
            status: 'Available',
          },
          {
            id: 'veh-e2e-2',
            vehicleName: 'Audi A4',
            make: 'Audi',
            model: 'A4',
            year: 2023,
            licensePlate: 'M-E2E 200',
            license: 'M-E2E 200',
            lat: 52.53,
            lng: 13.41,
            status: 'Rented',
          },
        ]),
      });
    }

    if (url.includes(`/organizations/${BOOKING_E2E_ORG_ID}/vehicles`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'veh-e2e-1',
            make: 'BMW',
            model: '320i',
            year: 2024,
            licensePlate: 'M-E2E 100',
            status: 'AVAILABLE',
          },
          {
            id: 'veh-e2e-2',
            make: 'Audi',
            model: 'A4',
            year: 2023,
            licensePlate: 'M-E2E 200',
            status: 'RENTED',
          },
        ]),
      });
    }

    if (url.includes(`/organizations/${BOOKING_E2E_ORG_ID}/stations`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: 'st-e2e-1', name: 'Hauptstation' }]),
      });
    }

    if (url.includes(`/organizations/${BOOKING_E2E_ORG_ID}/customers`) && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
    }

    if (url.includes(`/organizations/${BOOKING_E2E_ORG_ID}/users`) && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    }

    if (url.includes('/support/unread-count') && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ count: 0 }) });
    }

    if (url.includes('/activity-log') && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [], meta: { total: 0 } }) });
    }

    if (url.includes('/dashboard-insights') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          generatedAt: new Date().toISOString(),
          hasRun: true,
          stale: false,
          activeInsightCount: 0,
          error: null,
          insights: [],
          summary: { total: 0, critical: 0, warning: 0, opportunity: 0, info: 0 },
        }),
      });
    }

    return route.continue();
  });
}

export async function navigateToBookingsView(page: Page) {
  const heading = page.getByRole('heading', { name: /^(Buchungen|Bookings)$/ });
  if (await heading.isVisible().catch(() => false)) return;

  const bookingsLabel = /^(Buchungen|Bookings)$/;
  const viewport = page.viewportSize();

  if (viewport && viewport.width < 1024) {
    await page.locator('div.lg\\:hidden.fixed.top-0.left-0.right-0 button').first().click();
    await page.locator('div.lg\\:hidden.fixed.top-0').getByRole('button', { name: bookingsLabel }).click();
  } else {
    await page.getByRole('button', { name: bookingsLabel }).click();
  }

  await heading.waitFor({ state: 'visible', timeout: 30000 });
}

export async function openBookingsPage(
  page: Page,
  options?: { locale?: 'de' | 'en'; failFirstList?: boolean },
) {
  resetBookingMockState();
  if (options?.failFirstList) {
    state.failNextList = true;
  }
  await page.addInitScript(
    ({ token, user, locale }) => {
      localStorage.setItem('synqdrive_token', token);
      localStorage.setItem('synqdrive_user', JSON.stringify(user));
      localStorage.setItem('synqdrive.locale', locale);
    },
    { token: 'booking-e2e-token', user: mockUser, locale: options?.locale ?? 'de' },
  );
  await installBookingMocks(page);
  await page.goto('/rental', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /^(Dashboard|Übersicht)$/ }).first().waitFor({ state: 'visible', timeout: 30000 }).catch(() => undefined);
  await navigateToBookingsView(page);
}

export async function openBookingsTableView(page: Page) {
  await page.getByRole('button', { name: /Tabelle|Table/i }).click();
}

export async function expectBookingVisible(page: Page, customerName: string) {
  await openBookingsTableView(page);
  await expect(page.getByText(customerName, { exact: false }).first()).toBeVisible({ timeout: 15000 });
}
