import type { InvoiceDirectionFilter } from './invoiceConstants';
import type { InvoiceListMeta } from './invoiceTypes';

export type InvoiceListSortField = 'invoiceDate' | 'dueDate' | 'totalGross' | 'status' | 'createdAt';
export type InvoiceListSortOrder = 'asc' | 'desc';

export type InvoiceDocumentStatusFilter = 'all' | 'present' | 'missing' | 'failed';
export type InvoiceSendStatusFilter =
  | 'all'
  | 'QUEUED'
  | 'SENDING'
  | 'SENT'
  | 'FAILED'
  | 'SENT_SIMULATED';

export interface InvoiceListFilters {
  search: string;
  direction: InvoiceDirectionFilter;
  status: string;
  type: string;
  documentStatus: InvoiceDocumentStatusFilter;
  sendStatus: InvoiceSendStatusFilter;
  stationId: string;
  dateFrom: string;
  dateTo: string;
  overdue: boolean;
  sortBy: InvoiceListSortField;
  sortOrder: InvoiceListSortOrder;
  page: number;
  limit: number;
}

export const DEFAULT_INVOICE_LIST_FILTERS: InvoiceListFilters = {
  search: '',
  direction: 'all',
  status: 'all',
  type: 'all',
  documentStatus: 'all',
  sendStatus: 'all',
  stationId: '',
  dateFrom: '',
  dateTo: '',
  overdue: false,
  sortBy: 'invoiceDate',
  sortOrder: 'desc',
  page: 1,
  limit: 20,
};

const URL_KEYS = {
  search: 'invQ',
  direction: 'invDir',
  status: 'invStatus',
  type: 'invType',
  documentStatus: 'invDoc',
  sendStatus: 'invSend',
  stationId: 'invStation',
  dateFrom: 'invFrom',
  dateTo: 'invTo',
  overdue: 'invOverdue',
  sortBy: 'invSort',
  sortOrder: 'invOrder',
  page: 'invPage',
} as const;

export function readInvoiceListFiltersFromUrl(): Partial<InvoiceListFilters> {
  if (typeof window === 'undefined') return {};
  const params = new URLSearchParams(window.location.search);
  const next: Partial<InvoiceListFilters> = {};

  const search = params.get(URL_KEYS.search);
  if (search) next.search = search;

  const direction = params.get(URL_KEYS.direction);
  if (direction === 'outgoing' || direction === 'incoming' || direction === 'all') {
    next.direction = direction;
  }

  const status = params.get(URL_KEYS.status);
  if (status) next.status = status;

  const type = params.get(URL_KEYS.type);
  if (type) next.type = type;

  const documentStatus = params.get(URL_KEYS.documentStatus);
  if (documentStatus === 'present' || documentStatus === 'missing' || documentStatus === 'failed') {
    next.documentStatus = documentStatus;
  }

  const sendStatus = params.get(URL_KEYS.sendStatus);
  if (
    sendStatus === 'QUEUED' ||
    sendStatus === 'SENDING' ||
    sendStatus === 'SENT' ||
    sendStatus === 'FAILED' ||
    sendStatus === 'SENT_SIMULATED'
  ) {
    next.sendStatus = sendStatus;
  }

  const stationId = params.get(URL_KEYS.stationId);
  if (stationId) next.stationId = stationId;

  const dateFrom = params.get(URL_KEYS.dateFrom);
  if (dateFrom) next.dateFrom = dateFrom;

  const dateTo = params.get(URL_KEYS.dateTo);
  if (dateTo) next.dateTo = dateTo;

  if (params.get(URL_KEYS.overdue) === '1') next.overdue = true;

  const sortBy = params.get(URL_KEYS.sortBy);
  if (
    sortBy === 'invoiceDate' ||
    sortBy === 'dueDate' ||
    sortBy === 'totalGross' ||
    sortBy === 'status' ||
    sortBy === 'createdAt'
  ) {
    next.sortBy = sortBy;
  }

  const sortOrder = params.get(URL_KEYS.sortOrder);
  if (sortOrder === 'asc' || sortOrder === 'desc') next.sortOrder = sortOrder;

  const page = Number(params.get(URL_KEYS.page));
  if (Number.isInteger(page) && page > 0) next.page = page;

  return next;
}

export function syncInvoiceListFiltersToUrl(filters: InvoiceListFilters): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);

  const entries: Array<[string, string | null]> = [
    [URL_KEYS.search, filters.search.trim() || null],
    [URL_KEYS.direction, filters.direction !== 'all' ? filters.direction : null],
    [URL_KEYS.status, filters.status !== 'all' ? filters.status : null],
    [URL_KEYS.type, filters.type !== 'all' ? filters.type : null],
    [URL_KEYS.documentStatus, filters.documentStatus !== 'all' ? filters.documentStatus : null],
    [URL_KEYS.sendStatus, filters.sendStatus !== 'all' ? filters.sendStatus : null],
    [URL_KEYS.stationId, filters.stationId || null],
    [URL_KEYS.dateFrom, filters.dateFrom || null],
    [URL_KEYS.dateTo, filters.dateTo || null],
    [URL_KEYS.overdue, filters.overdue ? '1' : null],
    [URL_KEYS.sortBy, filters.sortBy !== 'invoiceDate' ? filters.sortBy : null],
    [URL_KEYS.sortOrder, filters.sortOrder !== 'desc' ? filters.sortOrder : null],
    [URL_KEYS.page, filters.page > 1 ? String(filters.page) : null],
  ];

  for (const [key, value] of entries) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }

  window.history.replaceState({}, '', url.toString());
}

export function buildInvoiceListApiParams(filters: InvoiceListFilters, search: string) {
  const params: Record<string, string | number | boolean | undefined> = {
    page: filters.page,
    limit: filters.limit,
    sortBy: filters.sortBy,
    sortOrder: filters.sortOrder,
  };

  const q = search.trim();
  if (q) params.search = q;
  if (filters.direction !== 'all') params.direction = filters.direction;
  if (filters.status !== 'all') params.status = filters.status;
  if (filters.type !== 'all') params.type = filters.type;
  if (filters.documentStatus !== 'all') params.documentStatus = filters.documentStatus;
  if (filters.sendStatus !== 'all') params.sendStatus = filters.sendStatus;
  if (filters.stationId) params.stationId = filters.stationId;
  if (filters.dateFrom) params.dateFrom = filters.dateFrom;
  if (filters.dateTo) params.dateTo = filters.dateTo;
  if (filters.overdue) params.overdue = true;

  return params;
}

export function hasActiveInvoiceListFilters(filters: InvoiceListFilters, search: string): boolean {
  return (
    Boolean(search.trim()) ||
    filters.direction !== 'all' ||
    filters.status !== 'all' ||
    filters.type !== 'all' ||
    filters.documentStatus !== 'all' ||
    filters.sendStatus !== 'all' ||
    Boolean(filters.stationId) ||
    Boolean(filters.dateFrom) ||
    Boolean(filters.dateTo) ||
    filters.overdue
  );
}

export function paginationLabel(meta: InvoiceListMeta | null): string {
  if (!meta || meta.total === 0) return '0 Einträge';
  const from = (meta.page - 1) * meta.limit + 1;
  const to = Math.min(meta.page * meta.limit, meta.total);
  return `${from}–${to} von ${meta.total}`;
}
