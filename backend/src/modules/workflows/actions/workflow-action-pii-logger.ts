import { Logger } from '@nestjs/common';

const PII_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\+?\d{10,}/gi;

function redactPii(text: string): string {
  return text.replace(PII_PATTERN, '[REDACTED]');
}

export interface WorkflowActionPiiSafeLogger {
  debug(message: string, meta?: Record<string, unknown>): void;
  log(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export function createWorkflowActionPiiSafeLogger(scope: string): WorkflowActionPiiSafeLogger {
  const base = new Logger(scope);
  const sanitize = (meta?: Record<string, unknown>) => {
    if (!meta) return undefined;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(meta)) {
      if (typeof value === 'string') out[key] = redactPii(value);
      else if (value && typeof value === 'object') out[key] = '[object]';
      else out[key] = value;
    }
    return out;
  };

  return {
    debug: (message, meta) => base.debug(redactPii(message), sanitize(meta)),
    log: (message, meta) => base.log(redactPii(message), sanitize(meta)),
    warn: (message, meta) => base.warn(redactPii(message), sanitize(meta)),
    error: (message, meta) => base.error(redactPii(message), sanitize(meta)),
  };
}
