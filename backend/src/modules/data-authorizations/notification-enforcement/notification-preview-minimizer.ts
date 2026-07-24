import type { NotificationTemplateParams } from '@modules/notifications/notification.types';
import { NOTIFICATION_AUTH_TEMPLATE_PREFIX } from './notification-enforcement.constants';
import type { NotificationAuthGateSpec } from './notification-enforcement.types';

const DEFAULT_SENSITIVE_KEYS = new Set([
  'latitude',
  'longitude',
  'lat',
  'lng',
  'coordinates',
  'lastPosition',
  'driverName',
  'customerName',
  'customerEmail',
  'dtcCode',
  'dtcDescription',
  'faultCode',
  'misuseType',
  'evidenceCount',
  'severityScore',
  'wearPct',
  'voltage',
  'treadDepth',
  'padThickness',
  'tripId',
  'bookingRef',
]);

/** Strip sensitive preview fields when authorization scope does not allow detail. */
export function minimizeNotificationPreviewParams(
  params: NotificationTemplateParams,
  spec: NotificationAuthGateSpec,
  allowed: boolean,
): NotificationTemplateParams {
  if (allowed) return stripInternalAuthParams(params);

  const sensitive = new Set([
    ...DEFAULT_SENSITIVE_KEYS,
    ...(spec.sensitivePreviewParams ?? []),
  ]);

  const minimized: NotificationTemplateParams = {};
  for (const [key, value] of Object.entries(params)) {
    if (key.startsWith(NOTIFICATION_AUTH_TEMPLATE_PREFIX)) continue;
    if (sensitive.has(key)) {
      minimized[key] = null;
      continue;
    }
    if (key === 'label' || key === 'plate' || key === 'stationName') {
      minimized[key] = value;
    }
  }

  if (!minimized.label && params.label) minimized.label = params.label;
  if (!minimized.plate && params.plate) minimized.plate = params.plate;

  minimized._previewMinimized = true;
  return minimized;
}

/** Data-minimized email/push body — generic message without sensitive derived data. */
export function minimizeNotificationDeliveryBody(
  titleKey: string,
  bodyKey: string,
  params: NotificationTemplateParams,
  allowed: boolean,
): { titleKey: string; bodyKey: string; params: NotificationTemplateParams } {
  if (allowed) {
    return {
      titleKey,
      bodyKey,
      params: stripInternalAuthParams(params),
    };
  }

  return {
    titleKey: 'notification.title.genericAlert',
    bodyKey: 'notification.body.genericAlert',
    params: {
      label: params.label ?? params.plate ?? null,
      _previewMinimized: true,
    },
  };
}

export function stripInternalAuthParams(
  params: NotificationTemplateParams,
): NotificationTemplateParams {
  const cleaned: NotificationTemplateParams = {};
  for (const [key, value] of Object.entries(params)) {
    if (!key.startsWith(NOTIFICATION_AUTH_TEMPLATE_PREFIX)) {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

export function attachAuthDecisionToParams(
  params: NotificationTemplateParams,
  decision: {
    correlationId: string;
    auditEventId: string | null;
    reasonCode: string;
    gateKind: string;
  },
): NotificationTemplateParams {
  return {
    ...params,
    [`${NOTIFICATION_AUTH_TEMPLATE_PREFIX}CorrelationId`]: decision.correlationId,
    [`${NOTIFICATION_AUTH_TEMPLATE_PREFIX}AuditEventId`]: decision.auditEventId,
    [`${NOTIFICATION_AUTH_TEMPLATE_PREFIX}ReasonCode`]: decision.reasonCode,
    [`${NOTIFICATION_AUTH_TEMPLATE_PREFIX}GateKind`]: decision.gateKind,
  };
}
