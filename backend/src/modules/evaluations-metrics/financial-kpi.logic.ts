/**
 * Server-side financial KPI aggregation for Auswertungen metric responses.
 * Rules aligned with frontend `financial-insights.logic.ts`.
 */

import {
  EXPENSE_EXCLUDED_STATUSES,
  isIncomingInvoiceType,
  isOutgoingInvoiceType,
  REVENUE_EXCLUDED_STATUSES,
} from '@modules/invoices/invoice-domain.util';
import type { OrgInvoiceStatus } from '@prisma/client';

export interface FinancialKpiInvoiceRow {
  id: string;
  type: string;
  status: string;
  totalCents: number | null;
  currency: string | null;
  invoiceDate: Date | string | null;
  dueDate: Date | string | null;
  paidAt: Date | string | null;
  createdAt: Date | string | null;
  updatedAt?: Date | string | null;
}

export function isEurInvoice(inv: FinancialKpiInvoiceRow): boolean {
  const c = (inv.currency ?? 'EUR').toUpperCase();
  return c === 'EUR' || c === '€';
}

export function effectiveInvoiceDate(inv: FinancialKpiInvoiceRow): Date | null {
  for (const value of [inv.invoiceDate, inv.createdAt]) {
    if (value == null) continue;
    const d = value instanceof Date ? value : new Date(String(value));
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

function normalizeStatus(status: string): string {
  return status.trim().toUpperCase();
}

export function isRevenueInvoice(inv: FinancialKpiInvoiceRow): boolean {
  if (!isOutgoingInvoiceType(inv.type)) return false;
  return !REVENUE_EXCLUDED_STATUSES.includes(normalizeStatus(inv.status) as OrgInvoiceStatus);
}

export function isExpenseInvoice(inv: FinancialKpiInvoiceRow): boolean {
  if (!isIncomingInvoiceType(inv.type)) return false;
  return !EXPENSE_EXCLUDED_STATUSES.includes(normalizeStatus(inv.status) as OrgInvoiceStatus);
}

export function isReceivableInvoice(inv: FinancialKpiInvoiceRow): boolean {
  if (!isOutgoingInvoiceType(inv.type)) return false;
  const status = normalizeStatus(inv.status);
  return !['DRAFT', 'CANCELLED', 'CANCELED', 'VOID', 'CREDITED', 'PAID'].includes(status);
}

export function isOverdueReceivable(inv: FinancialKpiInvoiceRow, now: Date): boolean {
  if (!isReceivableInvoice(inv)) return false;
  if (!inv.dueDate) return false;
  const due = inv.dueDate instanceof Date ? inv.dueDate : new Date(String(inv.dueDate));
  return !Number.isNaN(due.getTime()) && due.getTime() < now.getTime();
}

export function sumCents(rows: FinancialKpiInvoiceRow[]): number {
  return rows.reduce((acc, r) => acc + (r.totalCents ?? 0), 0);
}

export function issuedRevenueInRange(
  invoices: FinancialKpiInvoiceRow[],
  from: Date,
  to: Date,
): FinancialKpiInvoiceRow[] {
  return invoices.filter((inv) => {
    if (!isRevenueInvoice(inv) || !isEurInvoice(inv)) return false;
    const d = effectiveInvoiceDate(inv);
    return d != null && d >= from && d <= to;
  });
}

export function paidRevenueInRange(
  invoices: FinancialKpiInvoiceRow[],
  from: Date,
  to: Date,
): FinancialKpiInvoiceRow[] {
  return invoices.filter((inv) => {
    if (!isRevenueInvoice(inv) || !isEurInvoice(inv)) return false;
    if (normalizeStatus(inv.status) !== 'PAID' || !inv.paidAt) return false;
    const d = inv.paidAt instanceof Date ? inv.paidAt : new Date(String(inv.paidAt));
    return !Number.isNaN(d.getTime()) && d >= from && d <= to;
  });
}

export function mtdRevenueInRange(
  invoices: FinancialKpiInvoiceRow[],
  from: Date,
  to: Date,
): FinancialKpiInvoiceRow[] {
  const byId = new Map<string, FinancialKpiInvoiceRow>();
  for (const row of [...issuedRevenueInRange(invoices, from, to), ...paidRevenueInRange(invoices, from, to)]) {
    byId.set(row.id, row);
  }
  return [...byId.values()];
}

export function expensesInRange(
  invoices: FinancialKpiInvoiceRow[],
  from: Date,
  to: Date,
): FinancialKpiInvoiceRow[] {
  return invoices.filter((inv) => {
    if (!isExpenseInvoice(inv) || !isEurInvoice(inv)) return false;
    const d = effectiveInvoiceDate(inv);
    return d != null && d >= from && d <= to;
  });
}

export function openOutgoingReceivables(
  invoices: FinancialKpiInvoiceRow[],
  now: Date,
): FinancialKpiInvoiceRow[] {
  return invoices.filter((inv) => isReceivableInvoice(inv) && isEurInvoice(inv) && !isOverdueReceivable(inv, now));
}

export function overdueOutgoingReceivables(
  invoices: FinancialKpiInvoiceRow[],
  now: Date,
): FinancialKpiInvoiceRow[] {
  return invoices.filter((inv) => isReceivableInvoice(inv) && isEurInvoice(inv) && isOverdueReceivable(inv, now));
}

export function latestInvoiceSourceAt(invoices: FinancialKpiInvoiceRow[]): Date | null {
  let latest: Date | null = null;
  for (const inv of invoices) {
    for (const raw of [inv.updatedAt, inv.createdAt]) {
      if (raw == null) continue;
      const d = raw instanceof Date ? raw : new Date(String(raw));
      if (Number.isNaN(d.getTime())) continue;
      if (!latest || d > latest) latest = d;
    }
  }
  return latest;
}

export const FINANCIAL_KPI_EXCLUSIONS = {
  revenue: REVENUE_EXCLUDED_STATUSES,
  expense: EXPENSE_EXCLUDED_STATUSES,
  nonEur: 'non_eur_currency_rows',
} as const;
