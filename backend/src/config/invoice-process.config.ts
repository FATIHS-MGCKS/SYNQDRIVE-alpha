import { registerAs } from '@nestjs/config';

export default registerAs('invoiceProcess', () => ({
  enabled: process.env.INVOICE_PROCESS_ENABLED !== 'false',
  maxAttempts: parseInt(process.env.INVOICE_PROCESS_MAX_ATTEMPTS ?? '5', 10),
  backoffMs: parseInt(process.env.INVOICE_PROCESS_BACKOFF_MS ?? '60000', 10),
  pollBatchSize: parseInt(process.env.INVOICE_PROCESS_POLL_BATCH ?? '25', 10),
  reconciliationIntervalMs: parseInt(
    process.env.INVOICE_PROCESS_RECONCILE_INTERVAL_MS ?? String(15 * 60_000),
    10,
  ),
  emailStuckSendingMinutes: parseInt(
    process.env.INVOICE_PROCESS_EMAIL_STUCK_MINUTES ?? '30',
    10,
  ),
}));
