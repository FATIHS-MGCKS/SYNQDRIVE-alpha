import { registerAs } from '@nestjs/config';

/**
 * File storage configuration.
 *
 * Two drivers:
 *   - `local` (default): files live on the server disk under `uploads/` and are
 *     served by the static handler. This is the historical behavior — zero change.
 *   - `s3`: files are uploaded to an S3-compatible object store (AWS S3,
 *     Cloudflare R2, Hetzner Object Storage, Supabase Storage, MinIO). The DB
 *     stores only the public URL/key. Requires `@aws-sdk/client-s3`
 *     (`npm i @aws-sdk/client-s3`) and the S3_* env vars below.
 *
 * Switching to `s3` is opt-in via `STORAGE_DRIVER=s3` and does not affect any
 * files already stored locally (their URLs keep working through the static handler).
 */
export default registerAs('storage', () => ({
  driver: (process.env.STORAGE_DRIVER || 'local').toLowerCase(),
  uploadsDir: process.env.UPLOADS_DIR || 'uploads',

  s3: {
    bucket: process.env.S3_BUCKET || '',
    region: process.env.S3_REGION || 'auto',
    // Empty for AWS; set for R2/Hetzner/Supabase/MinIO, e.g.
    // https://<account>.r2.cloudflarestorage.com
    endpoint: process.env.S3_ENDPOINT || '',
    accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
    forcePathStyle: (process.env.S3_FORCE_PATH_STYLE || 'true') === 'true',
    // Public base URL used to build returned object URLs (a CDN domain or the
    // bucket's public URL). e.g. https://cdn.synqdrive.io
    publicBaseUrl: (process.env.S3_PUBLIC_BASE_URL || '').replace(/\/$/, ''),
    // Optional key namespace within the bucket (e.g. "prod").
    keyPrefix: (process.env.S3_KEY_PREFIX || '').replace(/^\/|\/$/g, ''),
  },

  // Per-organization storage quota in bytes (0 = disabled). Enforced for
  // org-scoped uploads when a quota source is available.
  orgQuotaBytes: parseInt(process.env.STORAGE_ORG_QUOTA_BYTES || '0', 10),

  // Orphan sweep: detect uploaded files no longer referenced in the DB.
  orphanSweep: {
    enabled: (process.env.STORAGE_ORPHAN_SWEEP_ENABLED || 'false') === 'true',
    // Dry-run unless explicitly enabled — only logs candidates by default.
    delete: (process.env.STORAGE_ORPHAN_SWEEP_DELETE || 'false') === 'true',
    minAgeHours: parseInt(process.env.STORAGE_ORPHAN_MIN_AGE_HOURS || '24', 10),
  },
}));
