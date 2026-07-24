import {
  AI_DOMAIN_AUDIT_EVENTS,
  AI_DOMAIN_ERROR_CODES,
  AI_DOMAIN_HTTP_STATUS,
  type AiDomainAuditEvent,
  type AiDomainErrorCode,
  type AiDomainErrorRetryPolicy,
  type AiDomainErrorSeverity,
  type AiDomainHttpStatus,
} from './ai-domain-error.enums';
import type { AiDomainErrorCatalogEntry } from './ai-domain-error.types';

export const AI_DOMAIN_ERROR_CATALOG: Readonly<
  Record<AiDomainErrorCode, AiDomainErrorCatalogEntry>
> = {
  vehicle_not_found: {
    code: 'vehicle_not_found',
    publicMessageEn:
      'The requested vehicle could not be found in your organization.',
    publicMessageDe:
      'Das angeforderte Fahrzeug wurde in Ihrer Organisation nicht gefunden.',
    severity: 'warning',
    retryPolicy: 'non_retryable',
    httpStatus: AI_DOMAIN_HTTP_STATUS.NOT_FOUND,
    auditEvent: 'ai.domain_query.vehicle_not_found',
    maskEntityExistence: false,
    blockLlmInference: true,
  },
  vehicle_ambiguous: {
    code: 'vehicle_ambiguous',
    publicMessageEn:
      'Multiple vehicles match that description. Please specify the license plate, vehicle name, or VIN.',
    publicMessageDe:
      'Mehrere Fahrzeuge passen zu dieser Beschreibung. Bitte Kennzeichen, Fahrzeugname oder VIN angeben.',
    severity: 'warning',
    retryPolicy: 'non_retryable',
    httpStatus: AI_DOMAIN_HTTP_STATUS.BAD_REQUEST,
    auditEvent: 'ai.domain_query.vehicle_ambiguous',
    maskEntityExistence: false,
    blockLlmInference: true,
  },
  data_not_available: {
    code: 'data_not_available',
    publicMessageEn: 'No data is available for this request.',
    publicMessageDe: 'Für diese Anfrage sind keine Daten verfügbar.',
    severity: 'warning',
    retryPolicy: 'non_retryable',
    httpStatus: AI_DOMAIN_HTTP_STATUS.NOT_FOUND,
    auditEvent: 'ai.domain_query.data_not_available',
    maskEntityExistence: false,
    blockLlmInference: true,
  },
  data_too_old: {
    code: 'data_too_old',
    publicMessageEn:
      'The available data is too old to answer this question reliably.',
    publicMessageDe:
      'Die verfügbaren Daten sind zu alt, um diese Frage zuverlässig zu beantworten.',
    severity: 'warning',
    retryPolicy: 'non_retryable',
    httpStatus: AI_DOMAIN_HTTP_STATUS.BAD_REQUEST,
    auditEvent: 'ai.domain_query.data_too_old',
    maskEntityExistence: false,
    blockLlmInference: true,
  },
  integration_not_connected: {
    code: 'integration_not_connected',
    publicMessageEn:
      'The vehicle is not connected to a telemetry or provider integration.',
    publicMessageDe:
      'Das Fahrzeug ist mit keiner Telemetrie- oder Provider-Integration verbunden.',
    severity: 'warning',
    retryPolicy: 'non_retryable',
    httpStatus: AI_DOMAIN_HTTP_STATUS.BAD_REQUEST,
    auditEvent: 'ai.domain_query.integration_not_connected',
    maskEntityExistence: false,
    blockLlmInference: true,
  },
  integration_temporarily_unavailable: {
    code: 'integration_temporarily_unavailable',
    publicMessageEn:
      'The data provider is temporarily unavailable. Please try again shortly.',
    publicMessageDe:
      'Der Datenanbieter ist vorübergehend nicht erreichbar. Bitte versuchen Sie es später erneut.',
    severity: 'error',
    retryPolicy: 'retryable',
    httpStatus: AI_DOMAIN_HTTP_STATUS.SERVICE_UNAVAILABLE,
    auditEvent: 'ai.domain_query.integration_unavailable',
    maskEntityExistence: false,
    blockLlmInference: true,
  },
  signal_not_supported: {
    code: 'signal_not_supported',
    publicMessageEn:
      'This vehicle or configuration does not support the requested signal.',
    publicMessageDe:
      'Dieses Fahrzeug oder diese Konfiguration unterstützt das angeforderte Signal nicht.',
    severity: 'informational',
    retryPolicy: 'non_retryable',
    httpStatus: AI_DOMAIN_HTTP_STATUS.BAD_REQUEST,
    auditEvent: 'ai.domain_query.signal_not_supported',
    maskEntityExistence: false,
    blockLlmInference: true,
  },
  permission_denied: {
    code: 'permission_denied',
    publicMessageEn: 'You do not have access to this information.',
    publicMessageDe: 'Sie haben keinen Zugriff auf diese Information.',
    severity: 'warning',
    retryPolicy: 'non_retryable',
    httpStatus: AI_DOMAIN_HTTP_STATUS.FORBIDDEN,
    auditEvent: 'ai.domain_query.permission_denied',
    maskEntityExistence: true,
    blockLlmInference: true,
  },
  role_restricted: {
    code: 'role_restricted',
    publicMessageEn:
      'Your role does not allow access to this category of data.',
    publicMessageDe:
      'Ihre Rolle erlaubt keinen Zugriff auf diese Datenkategorie.',
    severity: 'warning',
    retryPolicy: 'non_retryable',
    httpStatus: AI_DOMAIN_HTTP_STATUS.FORBIDDEN,
    auditEvent: 'ai.domain_query.role_restricted',
    maskEntityExistence: true,
    blockLlmInference: true,
  },
  domain_status_inconsistent: {
    code: 'domain_status_inconsistent',
    publicMessageEn:
      'The operational data for this entity appears inconsistent. An operator review may be required.',
    publicMessageDe:
      'Die operativen Daten für diese Entität sind inkonsistent. Eine manuelle Prüfung kann erforderlich sein.',
    severity: 'error',
    retryPolicy: 'non_retryable',
    httpStatus: AI_DOMAIN_HTTP_STATUS.INTERNAL_SERVER_ERROR,
    auditEvent: 'ai.domain_query.domain_inconsistent',
    maskEntityExistence: false,
    blockLlmInference: true,
  },
  timeout: {
    code: 'timeout',
    publicMessageEn: 'The request timed out before data could be retrieved.',
    publicMessageDe:
      'Die Anfrage wurde wegen Zeitüberschreitung abgebrochen, bevor Daten geladen werden konnten.',
    severity: 'error',
    retryPolicy: 'retryable',
    httpStatus: AI_DOMAIN_HTTP_STATUS.GATEWAY_TIMEOUT,
    auditEvent: 'ai.domain_query.timeout',
    maskEntityExistence: false,
    blockLlmInference: true,
  },
  invalid_input: {
    code: 'invalid_input',
    publicMessageEn: 'The request input is invalid or incomplete.',
    publicMessageDe: 'Die Eingabe ist ungültig oder unvollständig.',
    severity: 'warning',
    retryPolicy: 'non_retryable',
    httpStatus: AI_DOMAIN_HTTP_STATUS.BAD_REQUEST,
    auditEvent: 'ai.domain_query.invalid_input',
    maskEntityExistence: false,
    blockLlmInference: true,
  },
  internal_processing_failed: {
    code: 'internal_processing_failed',
    publicMessageEn:
      'An internal error occurred while processing this request.',
    publicMessageDe:
      'Bei der Verarbeitung dieser Anfrage ist ein interner Fehler aufgetreten.',
    severity: 'critical',
    retryPolicy: 'retryable',
    httpStatus: AI_DOMAIN_HTTP_STATUS.INTERNAL_SERVER_ERROR,
    auditEvent: 'ai.domain_query.internal_failed',
    maskEntityExistence: false,
    blockLlmInference: true,
  },
} as const;

export function getAiDomainErrorCatalogEntry(
  code: AiDomainErrorCode,
): AiDomainErrorCatalogEntry {
  return AI_DOMAIN_ERROR_CATALOG[code];
}

export function isAiDomainErrorCode(value: string): value is AiDomainErrorCode {
  return (AI_DOMAIN_ERROR_CODES as readonly string[]).includes(value);
}

export function isAiDomainAuditEvent(value: string): value is AiDomainAuditEvent {
  return (AI_DOMAIN_AUDIT_EVENTS as readonly string[]).includes(value);
}

export function listAiDomainErrorCatalogEntries(): readonly AiDomainErrorCatalogEntry[] {
  return AI_DOMAIN_ERROR_CODES.map((code) => AI_DOMAIN_ERROR_CATALOG[code]);
}

/** Maps catalog severity/retry/http for tests and documentation. */
export function describeAiDomainErrorCode(code: AiDomainErrorCode): {
  severity: AiDomainErrorSeverity;
  retryPolicy: AiDomainErrorRetryPolicy;
  httpStatus: AiDomainHttpStatus;
  auditEvent: AiDomainAuditEvent;
} {
  const entry = AI_DOMAIN_ERROR_CATALOG[code];
  return {
    severity: entry.severity,
    retryPolicy: entry.retryPolicy,
    httpStatus: entry.httpStatus,
    auditEvent: entry.auditEvent,
  };
}
