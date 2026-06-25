import { registerAs } from '@nestjs/config';

/**
 * Didit workflow IDs — server-side only (never expose to the frontend bundle).
 *
 * Workflow IDs are NOT secrets per Didit documentation. They are sent in the
 * request body when creating a session (`POST /v3/session/`).
 *
 * IMPORTANT — document-only verification:
 * Each workflow MUST NOT include selfie capture, liveness detection, or face
 * match. SynqDrive uses Didit for ID document, driving license, and optional
 * proof-of-address checks only.
 *
 * If you only have a single Didit Free KYC workflow available, you may temporarily
 * point all three entries to that workflow ID — but ONLY if you have verified in
 * the Didit console that the workflow excludes LIVENESS, FACE_MATCH, and SELFIE
 * steps. Do not use a full KYC workflow with biometric checks.
 */
export const DIDIT_WORKFLOWS = {
  ID_DOCUMENT: 'REPLACE_WITH_DIDIT_ID_DOCUMENT_WORKFLOW_ID',
  DRIVING_LICENSE: 'REPLACE_WITH_DIDIT_DRIVER_LICENSE_WORKFLOW_ID',
  PROOF_OF_ADDRESS: 'REPLACE_WITH_DIDIT_PROOF_OF_ADDRESS_WORKFLOW_ID',
} as const;

export type DiditWorkflowKind = keyof typeof DIDIT_WORKFLOWS;

export default registerAs('didit', () => {
  const enabled = (process.env.DIDIT_ENABLED || 'false') === 'true';
  const defaultRetentionDays = parseInt(
    process.env.DIDIT_DEFAULT_RETENTION_DAYS || '90',
    10,
  );

  return {
    enabled,
    /** Didit Verification API base URL (server-side only). */
    baseUrl: process.env.DIDIT_BASE_URL || 'https://verification.didit.me',
    /** Public webhook URL registered in Didit (for documentation / callback metadata). */
    webhookPublicUrl:
      process.env.DIDIT_WEBHOOK_PUBLIC_URL ||
      'https://app.synqdrive.eu/api/v1/webhooks/didit',
    defaultRetentionDays,
    /**
     * Per-check-type workflow map. IDs are substituted before session creation.
     * Not loaded from env — replace placeholders in DIDIT_WORKFLOWS for your deploy.
     */
    workflows: { ...DIDIT_WORKFLOWS },
    /** API key — server-only; never log or expose to clients. */
    apiKey: process.env.DIDIT_API_KEY ?? '',
    /** Webhook HMAC secret — server-only. */
    webhookSecret: process.env.DIDIT_WEBHOOK_SECRET ?? '',
  };
});
