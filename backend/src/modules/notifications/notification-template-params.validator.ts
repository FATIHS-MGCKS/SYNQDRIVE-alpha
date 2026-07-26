import type { NotificationTemplateParams } from './notification.types';

const SECRET_KEY_PATTERN =
  /(?:secret|password|token|api[_-]?key|authorization|bearer|credential|private[_-]?key)/i;
const MAX_STRING_LENGTH = 500;

const BLOCKED_PARAM_KEYS = new Set([
  'documentContent',
  'html',
  'rawPayload',
  'payload',
  'emailBody',
  'customerEmail',
  'customerPhone',
  'customerAddress',
  'iban',
  'ssn',
]);

export class NotificationTemplateParamsValidationError extends Error {
  constructor(
    public readonly field: string,
    message: string,
  ) {
    super(message);
    this.name = 'NotificationTemplateParamsValidationError';
  }
}

function sanitizeParamValue(
  value: unknown,
): string | number | boolean | null | undefined {
  if (value === null) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const withoutHtml = trimmed.replace(/<[^>]+>/g, '').trim();
    if (!withoutHtml) return undefined;
    return withoutHtml.length > MAX_STRING_LENGTH
      ? withoutHtml.slice(0, MAX_STRING_LENGTH)
      : withoutHtml;
  }
  return undefined;
}

export function sanitizeTemplateParams(
  params: NotificationTemplateParams,
  allowedKeys?: readonly string[],
): NotificationTemplateParams {
  const result: NotificationTemplateParams = {};

  for (const [key, raw] of Object.entries(params ?? {})) {
    if (SECRET_KEY_PATTERN.test(key) || BLOCKED_PARAM_KEYS.has(key)) continue;
    if (allowedKeys && !allowedKeys.includes(key)) continue;

    const sanitized = sanitizeParamValue(raw);
    if (sanitized !== undefined) {
      result[key] = sanitized;
    }
  }

  return result;
}

export function assertAllowedTemplateParamKeys(
  params: NotificationTemplateParams,
  allowedKeys: readonly string[],
): void {
  for (const key of Object.keys(params ?? {})) {
    if (!allowedKeys.includes(key)) {
      throw new NotificationTemplateParamsValidationError(
        `templateParams.${key}`,
        `Disallowed template param "${key}" — not in registry allowedTemplateParams`,
      );
    }
  }
}
