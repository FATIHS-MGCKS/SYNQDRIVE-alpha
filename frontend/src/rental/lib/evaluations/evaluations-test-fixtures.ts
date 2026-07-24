/**
 * Shared fixtures for Auswertungen baseline / characterization tests.
 * Scenarios mirror Prompt 3 audit requirements — not production seed data.
 */
import type { DashboardInsight, InsightSeverity, InsightType } from '../../DashboardInsightsContext';

export const FIXTURE_NOW = new Date('2026-06-16T12:00:00.000Z');
export const FIXTURE_MONTH_START = new Date('2026-06-01T00:00:00.000Z');
export const FIXTURE_PREV_MONTH_START = new Date('2026-05-01T00:00:00.000Z');
export const FIXTURE_PREV_MONTH_END = new Date('2026-05-31T23:59:59.999Z');

export interface InvoiceFixture {
  id: string;
  type: string;
  status: string;
  totalCents: number | null;
  currency: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  paidAt: string | null;
  createdAt: string | null;
  customerId?: string | null;
  vehicleId?: string | null;
  bookingId?: string | null;
}

export function invoice(
  overrides: Partial<InvoiceFixture> & { id: string },
): InvoiceFixture {
  return {
    type: 'OUTGOING_BOOKING',
    status: 'SENT',
    totalCents: 10_000,
    currency: 'EUR',
    invoiceDate: '2026-06-10',
    dueDate: '2026-06-20',
    paidAt: null,
    createdAt: '2026-06-10',
    customerId: null,
    vehicleId: null,
    bookingId: null,
    ...overrides,
  };
}

export function insight(
  overrides: Partial<DashboardInsight> & { id: string; type: InsightType },
): DashboardInsight {
  return {
    severity: 'WARNING' as InsightSeverity,
    priority: 50,
    title: overrides.title ?? 'Test insight',
    message: 'Test message',
    entityScope: 'VEHICLE',
    entityIds: ['vehicle-1'],
    isGrouped: false,
    groupCount: 1,
    createdAt: '2026-06-15T10:00:00.000Z',
    ...overrides,
  };
}

/** Organisation ohne Rechnungen und Insights. */
export const SCENARIO_EMPTY = {
  invoices: [] as InvoiceFixture[],
  insights: [] as DashboardInsight[],
  customers: [] as { id: string; name?: string }[],
};

/** Organisation mit vollständigen MTD-Daten (EUR). */
export const SCENARIO_FULL = {
  invoices: [
    invoice({ id: 'rev-1', customerId: 'cust-a', vehicleId: 'veh-1', totalCents: 50_000, invoiceDate: '2026-06-05' }),
    invoice({ id: 'rev-2', customerId: 'cust-b', vehicleId: 'veh-2', totalCents: 30_000, invoiceDate: '2026-06-08' }),
    invoice({
      id: 'paid-1',
      status: 'PAID',
      paidAt: '2026-06-12',
      totalCents: 20_000,
      invoiceDate: '2026-05-20',
    }),
    invoice({ id: 'exp-1', type: 'INCOMING_VENDOR', totalCents: 15_000, invoiceDate: '2026-06-04' }),
    invoice({ id: 'open-1', status: 'SENT', dueDate: '2026-07-01', totalCents: 12_000, invoiceDate: '2026-06-01' }),
    invoice({ id: 'over-1', status: 'SENT', dueDate: '2026-06-01', totalCents: 8_000, invoiceDate: '2026-05-15' }),
  ],
  insights: [
    insight({ id: 'i1', type: 'STATION_SHORTAGE', severity: 'CRITICAL', priority: 90 }),
    insight({
      id: 'i2',
      type: 'LOW_UTILIZATION',
      severity: 'OPPORTUNITY',
      priority: 40,
      metrics: {
        idleDays: 7,
        lostRevenueAmountMinor: 35_000,
        lostRevenueCurrency: 'EUR',
      },
    }),
  ],
  customers: [
    { id: 'cust-a', name: 'Alpha GmbH' },
    { id: 'cust-b', name: 'Beta AG' },
  ],
};

/** Teilweise fehlende Daten (kein paidAt, fehlende Kunden im Lookup). */
export const SCENARIO_PARTIAL = {
  invoices: [
    invoice({ id: 'no-paid-at', status: 'PAID', paidAt: null, invoiceDate: '2026-06-09' }),
    invoice({ id: 'no-customer', customerId: 'missing-cust', totalCents: 5_000, invoiceDate: '2026-06-07' }),
    invoice({ id: 'no-date', invoiceDate: null, createdAt: null, totalCents: 1_000 }),
  ],
  insights: [
    insight({ id: 'p1', type: 'SERVICE_WINDOW', severity: 'INFO', priority: 10 }),
  ],
  customers: [] as { id: string; name?: string }[],
};

/** Mehrere Währungen — ohne FX nur EUR; mit FX-Kontext werden Fremdwährungen umgerechnet. */
export const SCENARIO_MULTI_CURRENCY = {
  invoices: [
    invoice({ id: 'eur', totalCents: 10_000, currency: 'EUR' }),
    invoice({ id: 'usd', totalCents: 99_000, currency: 'USD' }),
    invoice({ id: 'eur-exp', type: 'INCOMING_VENDOR', totalCents: 2_000, currency: 'EUR' }),
  ],
  insights: [] as DashboardInsight[],
  customers: [] as { id: string; name?: string }[],
};

/** Überfällige und offene Forderungen, teilweise bezahlt (Status PAID mit paidAt). */
export const SCENARIO_OVERDUE_PARTIAL = {
  invoices: [
    invoice({ id: 'overdue', dueDate: '2026-06-01', status: 'SENT', totalCents: 25_000 }),
    invoice({ id: 'open-ok', dueDate: '2026-06-30', status: 'SENT', totalCents: 10_000 }),
    invoice({
      id: 'paid-partial-flow',
      status: 'PAID',
      paidAt: '2026-06-14',
      totalCents: 7_500,
      invoiceDate: '2026-06-02',
    }),
  ],
  insights: [] as DashboardInsight[],
  customers: [] as { id: string; name?: string }[],
};

/** Mehr als vier aktive Insights (API würde auf 4 limitieren — Partition arbeitet auf voller Liste). */
export function buildManyInsights(count: number): DashboardInsight[] {
  const types: InsightType[] = [
    'TIGHT_HANDOVER',
    'STATION_SHORTAGE',
    'LOW_UTILIZATION',
    'PICKUP_OVERDUE',
    'SERVICE_OVERDUE',
    'RETURN_NEEDS_INSPECTION',
  ];
  return Array.from({ length: count }, (_, i) =>
    insight({
      id: `many-${i}`,
      type: types[i % types.length],
      severity: i % 2 === 0 ? 'CRITICAL' : 'WARNING',
      priority: 100 - i,
      title: `Insight ${i}`,
    }),
  );
}

/** Gruppiertes Insight (Fleet/Station group). */
export const SCENARIO_GROUPED_INSIGHT = insight({
  id: 'grouped-1',
  type: 'LOW_UTILIZATION',
  severity: 'WARNING',
  priority: 55,
  isGrouped: true,
  groupCount: 3,
  entityIds: ['veh-1', 'veh-2', 'veh-3'],
  metrics: { entities: [{ id: 'veh-1' }, { id: 'veh-2' }, { id: 'veh-3' }] },
  title: '3 vehicles idle',
});

/** Mehrere Stationen für Station-Filter-Tests. */
export const VEHICLE_STATION_MAP = new Map<string, string | null | undefined>([
  ['veh-station-a', 'station-a'],
  ['veh-station-b', 'station-b'],
  ['vehicle-1', 'station-a'],
]);

export const INSIGHT_STATION_A = insight({
  id: 'sta-a',
  type: 'STATION_SHORTAGE',
  entityIds: ['veh-station-a'],
  metrics: { affectedVehicleId: 'veh-station-a' },
});

export const INSIGHT_STATION_B = insight({
  id: 'sta-b',
  type: 'STATION_SHORTAGE',
  entityIds: ['veh-station-b'],
  metrics: { affectedVehicleId: 'veh-station-b' },
});

/** Simuliert fehlgeschlagene API-Quellen (leere Arrays / null totals). */
export const SCENARIO_FAILED_SOURCES = {
  invoices: [] as InvoiceFixture[],
  insights: [] as DashboardInsight[],
  customers: [] as { id: string; name?: string }[],
};
