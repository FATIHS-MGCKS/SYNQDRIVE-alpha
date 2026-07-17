import type { SynqDriveProcessRole } from '@config/process-role.config';

const VALID_ROLES = new Set<SynqDriveProcessRole>(['all', 'api', 'document-worker']);

function readSplitEnabled(): boolean {
  return (process.env.DOCUMENT_EXTRACTION_WORKER_SPLIT ?? '').trim().toLowerCase() === 'true';
}

function readRoleToken(): string {
  return (process.env.SYNQDRIVE_PROCESS_ROLE ?? 'all').trim().toLowerCase();
}

/** Resolved process role — `all` when split is disabled (safe rollback default). */
export function getProcessRole(): SynqDriveProcessRole {
  if (!readSplitEnabled()) {
    return 'all';
  }
  const token = readRoleToken();
  return VALID_ROLES.has(token as SynqDriveProcessRole)
    ? (token as SynqDriveProcessRole)
    : 'all';
}

export function isDocumentWorkerSplitEnabled(): boolean {
  return readSplitEnabled();
}

/** BullMQ consumer + recovery scheduler for document.extraction. */
export function shouldRegisterDocumentExtractionConsumers(): boolean {
  const role = getProcessRole();
  return role === 'all' || role === 'document-worker';
}

/** HTTP controllers and upload enqueue API surface. */
export function shouldRegisterDocumentExtractionApi(): boolean {
  const role = getProcessRole();
  return role === 'all' || role === 'api';
}

/**
 * Non–document-extraction schedulers pulled in via shared modules (e.g. Invoices, Tasks).
 * Disabled on the dedicated document-worker process.
 */
export function shouldRunColocatedSchedulers(): boolean {
  return getProcessRole() !== 'document-worker';
}
