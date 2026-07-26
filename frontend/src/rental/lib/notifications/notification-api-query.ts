import type { ApiNotificationListParams } from './notification-api.types';

function appendEnumList(
  q: URLSearchParams,
  key: string,
  value: string | string[] | undefined,
): void {
  if (value == null) return;
  const values = Array.isArray(value) ? value : [value];
  if (!values.length) return;
  q.set(key, values.join(','));
}

/** Serializes notification list/count query params for the V2 REST API. */
export function appendNotificationQueryParams(
  q: URLSearchParams,
  params?: ApiNotificationListParams,
): void {
  if (!params) return;
  if (params.page != null) q.set('page', String(params.page));
  if (params.limit != null) q.set('limit', String(params.limit));
  if (params.cursor) q.set('cursor', params.cursor);
  if (params.activeOnly != null) q.set('activeOnly', String(params.activeOnly));
  if (params.unreadOnly != null) q.set('unreadOnly', String(params.unreadOnly));
  if (params.resolvedOnly != null) q.set('resolvedOnly', String(params.resolvedOnly));
  if (params.from) q.set('from', params.from);
  if (params.to) q.set('to', params.to);
  if (params.sortBy) q.set('sortBy', params.sortBy);
  if (params.sortOrder) q.set('sortOrder', params.sortOrder);
  appendEnumList(q, 'status', params.status);
  appendEnumList(q, 'severity', params.severity);
  if (params.domain) q.set('domain', params.domain);
  if (params.entityType) q.set('entityType', params.entityType);
  if (params.entityId) q.set('entityId', params.entityId);
  if (params.vehicleId) q.set('vehicleId', params.vehicleId);
  if (params.stationId) q.set('stationId', params.stationId);
  if (params.bookingId) q.set('bookingId', params.bookingId);
  if (params.search) q.set('search', params.search);
  if (params.readState) q.set('readState', params.readState);
  if (params.timeField) q.set('timeField', params.timeField);
}

export function buildNotificationQuerySuffix(params?: ApiNotificationListParams): string {
  const q = new URLSearchParams();
  appendNotificationQueryParams(q, params);
  const serialized = q.toString();
  return serialized ? `?${serialized}` : '';
}
