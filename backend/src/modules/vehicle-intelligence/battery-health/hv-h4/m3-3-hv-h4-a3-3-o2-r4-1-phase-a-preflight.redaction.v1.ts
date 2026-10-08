/** Redact credentials from a PostgreSQL URL — host + database only. */
export function redactPostgresDatabaseTargetV1(databaseUrl: string): string {
  try {
    const parsed = new URL(databaseUrl.trim().replace(/^postgresql:/, 'postgres:'));
    const host = parsed.hostname || 'unknown-host';
    const port = parsed.port ? `:${parsed.port}` : '';
    const database = parsed.pathname.replace(/^\//, '').split('/')[0] || 'unknown-db';
    return `postgresql://***@${host}${port}/${database}`;
  } catch {
    return 'postgresql://***@redacted/redacted';
  }
}

const POSTGRES_URL_WITH_USER_PATTERN = /postgres(?:ql)?:\/\/([^@]+)@/gi;

/** Reject raw credentials in reports; allow redacted placeholder user (`***`). */
export function assertNoSecretsInReportPayloadV1(payload: unknown): void {
  const serialized = JSON.stringify(payload);
  for (const match of serialized.matchAll(POSTGRES_URL_WITH_USER_PATTERN)) {
    const user = (match[1] ?? '').trim();
    if (user && user !== '***' && user !== 'redacted') {
      throw new Error('PHASE_A_REPORT_CREDENTIAL_LEAK');
    }
  }
}
