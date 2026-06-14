import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@shared/database/prisma.service';
import { join, basename } from 'path';
import { readdir, stat, unlink } from 'fs/promises';

/**
 * StorageOrphanSweepScheduler
 *
 * Detects uploaded files that are no longer referenced by any DB record and
 * (optionally) deletes them. DISABLED by default and DRY-RUN unless explicitly
 * enabled — it only logs candidates until `STORAGE_ORPHAN_SWEEP_DELETE=true`.
 *
 * Scope (conservative on purpose): the `org-logos` directory, whose only
 * reference column is `Organization.logoUrl`. Sweeping other upload dirs
 * (customer-documents, fines, invoices, support) requires first mapping ALL
 * columns that can reference those files — adding a dir here before that mapping
 * exists risks deleting still-referenced files. Extend deliberately.
 *
 * Local driver only. For the s3 driver, the same logic applies via ListObjects
 * but is intentionally not enabled here yet.
 */
@Injectable()
export class StorageOrphanSweepScheduler {
  private readonly logger = new Logger(StorageOrphanSweepScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  // Weekly, Sunday 04:00 — well after nightly retention/reclamation windows.
  @Cron('0 4 * * 0')
  async sweep(): Promise<void> {
    const enabled = this.config.get<boolean>('storage.orphanSweep.enabled', false);
    if (!enabled) return;

    const driver = this.config.get<string>('storage.driver', 'local');
    if (driver !== 'local') {
      this.logger.debug(`Orphan sweep skipped — driver "${driver}" not supported yet (local only).`);
      return;
    }

    const doDelete = this.config.get<boolean>('storage.orphanSweep.delete', false);
    const minAgeHours = this.config.get<number>('storage.orphanSweep.minAgeHours', 24);
    const uploadsDir = this.config.get<string>('storage.uploadsDir', 'uploads');
    const dir = join(process.cwd(), uploadsDir, 'org-logos');

    let files: string[];
    try {
      files = await readdir(dir);
    } catch {
      this.logger.debug(`Orphan sweep: ${dir} not present — nothing to do.`);
      return;
    }

    // Referenced basenames from Organization.logoUrl.
    const orgs = await this.prisma.organization.findMany({
      where: { logoUrl: { not: null } },
      select: { logoUrl: true },
    });
    const referenced = new Set(
      orgs
        .map((o) => o.logoUrl)
        .filter((u): u is string => !!u)
        .map((u) => basename(u)),
    );

    const cutoffMs = Date.now() - minAgeHours * 60 * 60 * 1000;
    let candidates = 0;
    let deleted = 0;

    for (const name of files) {
      if (referenced.has(name)) continue;
      const full = join(dir, name);
      try {
        const s = await stat(full);
        if (!s.isFile() || s.mtimeMs > cutoffMs) continue; // skip fresh files
        candidates += 1;
        if (doDelete) {
          await unlink(full);
          deleted += 1;
        } else {
          this.logger.log(`Orphan candidate (dry-run): org-logos/${name} (${(s.size / 1024).toFixed(0)} KB)`);
        }
      } catch {
        // ignore per-file errors
      }
    }

    if (candidates > 0) {
      this.logger.log(
        `Orphan sweep [org-logos]: ${candidates} candidate(s)${doDelete ? `, ${deleted} deleted` : ' (dry-run, nothing deleted)'}.`,
      );
    }
  }
}
