import { registerAs } from '@nestjs/config';

export type SynqDriveProcessRole = 'all' | 'api' | 'document-worker';

export default registerAs('processRole', () => ({
  /** When false (default), single-process mode — all roles behave as `all`. */
  documentWorkerSplitEnabled:
    (process.env.DOCUMENT_EXTRACTION_WORKER_SPLIT ?? '').trim().toLowerCase() === 'true',
  /** Effective only when `documentWorkerSplitEnabled` is true. */
  role: (process.env.SYNQDRIVE_PROCESS_ROLE ?? 'all').trim().toLowerCase() as SynqDriveProcessRole,
}));
