import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { join, basename } from 'path';
import { readFile, unlink } from 'fs/promises';

interface S3Config {
  bucket: string;
  region: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  publicBaseUrl: string;
  keyPrefix: string;
}

/**
 * StorageService — driver-agnostic file storage.
 *
 * The `local` driver preserves the historical behavior exactly (files written to
 * disk by multer are served from `/uploads/...`). The `s3` driver uploads the
 * multer temp file to an S3-compatible bucket and returns its public URL, storing
 * nothing but the URL in the DB. The S3 SDK is loaded lazily so it is only
 * required when `STORAGE_DRIVER=s3`.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private s3Client: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private s3Mod: any = null;

  constructor(private readonly config: ConfigService) {}

  get driver(): string {
    return this.config.get<string>('storage.driver', 'local');
  }

  /**
   * Finalizes a multer-uploaded file and returns its public URL.
   *  - local: no-op, returns the existing `/uploads/<subdir>/<filename>` URL.
   *  - s3: uploads the temp file, deletes the local temp, returns the object URL.
   *
   * `orgId` (optional) namespaces the object key for per-org accounting/quota.
   */
  async finalizeUpload(
    subdir: string,
    file: Express.Multer.File,
    orgId?: string,
  ): Promise<string> {
    if (this.driver !== 's3') {
      return `/uploads/${subdir}/${file.filename}`;
    }

    const key = this.objectKey(subdir, file.filename, orgId);
    const body = await readFile(file.path);
    await this.s3Put(key, body, file.mimetype);
    await unlink(file.path).catch(() => undefined);
    return this.publicUrl(key);
  }

  /**
   * Best-effort deletion of a previously stored file by its public URL.
   * Safe across drivers; never throws.
   */
  async removeByPublicUrl(url: string | null | undefined): Promise<void> {
    if (!url) return;
    try {
      if (this.driver === 's3') {
        const key = this.keyFromPublicUrl(url);
        if (key) await this.s3Delete(key);
        return;
      }
      if (url.startsWith('/uploads/')) {
        const rel = url.replace(/^\/uploads\//, '');
        // basename each segment to defend against path traversal.
        const safe = rel.split('/').filter(Boolean).map((s) => basename(s)).join('/');
        const uploadsDir = this.config.get<string>('storage.uploadsDir', 'uploads');
        await unlink(join(process.cwd(), uploadsDir, safe)).catch(() => undefined);
      }
    } catch (err) {
      this.logger.debug(`removeByPublicUrl(${url}) failed: ${(err as Error).message}`);
    }
  }

  // ── S3 internals (lazy SDK) ───────────────────────────────────────────────

  private get s3(): S3Config {
    return this.config.get<S3Config>('storage.s3') as S3Config;
  }

  private objectKey(subdir: string, filename: string, orgId?: string): string {
    const parts = [this.s3.keyPrefix, subdir, orgId, filename].filter(Boolean);
    return parts.join('/');
  }

  private publicUrl(key: string): string {
    const { publicBaseUrl, endpoint, bucket } = this.s3;
    if (publicBaseUrl) return `${publicBaseUrl}/${key}`;
    if (endpoint) return `${endpoint.replace(/\/$/, '')}/${bucket}/${key}`;
    return `https://${bucket}.s3.amazonaws.com/${key}`;
  }

  private keyFromPublicUrl(url: string): string | null {
    const { publicBaseUrl, endpoint, bucket } = this.s3;
    try {
      if (publicBaseUrl && url.startsWith(publicBaseUrl)) {
        return url.slice(publicBaseUrl.length + 1);
      }
      const u = new URL(url);
      // path-style: /<bucket>/<key>
      const path = u.pathname.replace(/^\//, '');
      if (path.startsWith(`${bucket}/`)) return path.slice(bucket.length + 1);
      // virtual-hosted style: <bucket>.host/<key>
      if (endpoint || u.hostname.startsWith(`${bucket}.`)) return path;
      return path || null;
    } catch {
      return null;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async ensureS3(): Promise<any> {
    if (this.s3Client) return this.s3Client;
    try {
      // Lazy import — only required when the s3 driver is active. A non-literal
      // specifier keeps the AWS SDK an OPTIONAL runtime dependency (TS won't try
      // to resolve it at build time, so the default local driver needs nothing).
      const sdkModule: string = '@aws-sdk/client-s3';
      this.s3Mod = await import(sdkModule);
    } catch {
      throw new Error(
        'STORAGE_DRIVER=s3 requires @aws-sdk/client-s3. Install it: npm i @aws-sdk/client-s3',
      );
    }
    const cfg = this.s3;
    this.s3Client = new this.s3Mod.S3Client({
      region: cfg.region,
      endpoint: cfg.endpoint || undefined,
      forcePathStyle: cfg.forcePathStyle,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    });
    return this.s3Client;
  }

  private async s3Put(key: string, body: Buffer, contentType?: string): Promise<void> {
    const client = await this.ensureS3();
    await client.send(
      new this.s3Mod.PutObjectCommand({
        Bucket: this.s3.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  private async s3Delete(key: string): Promise<void> {
    const client = await this.ensureS3();
    await client.send(
      new this.s3Mod.DeleteObjectCommand({ Bucket: this.s3.bucket, Key: key }),
    );
  }
}
