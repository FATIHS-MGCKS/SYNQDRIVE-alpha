import { Prisma } from '@prisma/client';

const POSTGRES_URL_IN_TEXT = /postgres(?:ql)?:\/\/[^\s'"]+/gi;
const PASSWORD_LIKE = /(password|secret|token)=/i;

export type M3_3HvH4A3PhaseAPreflightSanitizedErrorV1 = {
  reasonCode: string;
  sqlState?: string;
};

/** Map unknown failures to stable codes — never return raw driver/Prisma text. */
export function sanitizePhaseAPreflightErrorV1(error: unknown): M3_3HvH4A3PhaseAPreflightSanitizedErrorV1 {
  const sqlState = extractPostgresSqlStateV1(error);

  if (error instanceof Prisma.PrismaClientInitializationError) {
    return { reasonCode: 'PHASE_A_DATABASE_CONNECTION_FAILED', sqlState };
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P1001' || error.code === 'P1000') {
      return { reasonCode: 'PHASE_A_DATABASE_CONNECTION_FAILED', sqlState };
    }
    if (error.code === 'P2010') {
      if (sqlState === '25P02') {
        return { reasonCode: 'PHASE_A_TRANSACTION_ABORTED', sqlState };
      }
      if (sqlState === '25006' || sqlState === '42501') {
        return { reasonCode: 'PHASE_A_READ_ONLY_OR_INSUFFICIENT_PRIVILEGE', sqlState };
      }
      return { reasonCode: 'PHASE_A_SQL_EXECUTION_FAILED', sqlState };
    }
    return { reasonCode: 'PHASE_A_PRISMA_REQUEST_FAILED', sqlState };
  }

  if (error instanceof Error) {
    const code = error.message.trim();
    if (/^PHASE_A_[A-Z0-9_]+$/.test(code)) {
      return { reasonCode: code, sqlState };
    }
    if (error.message.includes('current transaction is aborted')) {
      return { reasonCode: 'PHASE_A_TRANSACTION_ABORTED', sqlState: sqlState ?? '25P02' };
    }
  }

  return { reasonCode: 'PHASE_A_RUNNER_FAILED', sqlState };
}

export function extractPostgresSqlStateV1(error: unknown): string | undefined {
  const text = error instanceof Error ? error.message : String(error);
  const codeMatch = text.match(/code:\s*`?([0-9A-Z]{5})`?/i);
  if (codeMatch?.[1]) return codeMatch[1].toUpperCase();
  const sqlStateMatch = text.match(/SQLSTATE\[([0-9A-Z]{5})\]/i);
  if (sqlStateMatch?.[1]) return sqlStateMatch[1].toUpperCase();
  return undefined;
}

/** Test helper — detect accidental secret/url leakage in outward-facing strings. */
export function assertNoRawSecretsInPhaseATextV1(text: string): void {
  if (POSTGRES_URL_IN_TEXT.test(text)) {
    throw new Error('PHASE_A_TEXT_CONTAINS_DATABASE_URL');
  }
  if (PASSWORD_LIKE.test(text)) {
    throw new Error('PHASE_A_TEXT_CONTAINS_CREDENTIAL_FRAGMENT');
  }
}

export function formatPhaseAPreflightPublicErrorV1(sanitized: M3_3HvH4A3PhaseAPreflightSanitizedErrorV1): string {
  const payload = sanitized.sqlState
    ? `${sanitized.reasonCode}|SQLSTATE=${sanitized.sqlState}`
    : sanitized.reasonCode;
  assertNoRawSecretsInPhaseATextV1(payload);
  return payload;
}
