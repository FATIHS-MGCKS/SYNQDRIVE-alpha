import { Injectable, Logger, OnApplicationBootstrap, Optional } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ClickHouseClient } from '@clickhouse/client';
import { ClickHouseService } from './clickhouse.service';
import { TripMetricsService } from '../observability/trip-metrics.service';

/**
 * ClickHouseSchemaService
 *
 * Versioned migration runner for the ClickHouse analytics mirror.
 *
 * Behaviour:
 *   - Ensures the configured database + a `schema_migrations` tracking table.
 *   - Reads every `*.sql` file in ./migrations, sorted by filename.
 *   - version  = prefix before the first `_` (e.g. `001`)
 *   - name     = filename without `.sql`
 *   - checksum = SHA256 of the raw file content
 *   - Already-applied migrations (same version + matching checksum) are skipped.
 *   - A version that exists with a DIFFERENT checksum is a drift error: it is
 *     logged clearly and is NOT re-run.
 *   - Pending migrations run in order; each is recorded in `schema_migrations`.
 *
 * Runs in OnApplicationBootstrap so ClickHouseService has already completed its
 * async ping/connect. ClickHouse stays an optional analytics mirror: any failure
 * here is reported via ClickHouseService.reportSchemaStatus and never blocks the
 * operational (PostgreSQL-backed) request path.
 *
 * The `schema_migrations` table lives in the configured ClickHouse database and
 * never touches PostgreSQL.
 */

interface MigrationFile {
  version: string;
  name: string;
  checksum: string;
  statements: string[];
}

interface AppliedMigration {
  version: string;
  checksum: string;
}

const MIGRATIONS_DIR = join(__dirname, 'migrations');

/**
 * Splits a migration file into individual statements.
 *
 * Intentionally simple (no SQL parser dependency):
 *   - strips simple `--` line comments
 *   - splits on `;`
 *   - trims and drops empty statements
 */
export function splitSqlStatements(sql: string): string[] {
  const withoutLineComments = sql
    .split('\n')
    .map((line) => {
      const commentIdx = line.indexOf('--');
      return commentIdx >= 0 ? line.slice(0, commentIdx) : line;
    })
    .join('\n');

  return withoutLineComments
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

@Injectable()
export class ClickHouseSchemaService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ClickHouseSchemaService.name);

  constructor(
    private readonly ch: ClickHouseService,
    @Optional() private readonly metrics?: TripMetricsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.ch.isAvailable) {
      // disabled / degraded — handled by ClickHouseService status. Nothing to do.
      this.logger.debug('ClickHouse not available — skipping migrations.');
      return;
    }

    try {
      await this.runMigrations();
    } catch (err: unknown) {
      const message = (err as Error).message ?? String(err);
      this.metrics?.clickHouseMigrationFailures.inc();
      this.ch.reportSchemaStatus({ lastSchemaError: message });
      this.logger.error(
        `ClickHouse migration runner failed: ${message}. Analytics layer may be degraded.`,
      );
    }
  }

  private async runMigrations(): Promise<void> {
    const db = this.ch.databaseName;

    // Use an admin client on the `default` database so CREATE DATABASE and
    // fully-qualified CREATE TABLE statements succeed even before the target
    // database exists.
    const adminClient = this.ch.createAdminClient();

    try {
      await this.ensureMigrationsInfrastructure(adminClient, db);

      const files = this.loadMigrationFiles();
      const applied = await this.fetchAppliedMigrations(adminClient, db);
      const appliedByVersion = new Map(applied.map((m) => [m.version, m]));

      const pending: MigrationFile[] = [];
      let driftError: string | null = null;

      for (const file of files) {
        const existing = appliedByVersion.get(file.version);
        if (!existing) {
          pending.push(file);
          continue;
        }
        if (existing.checksum !== file.checksum) {
          const msg = `Checksum mismatch for migration ${file.name} (version ${file.version}): recorded=${existing.checksum.slice(0, 12)}… file=${file.checksum.slice(0, 12)}…. Migration will NOT be re-run.`;
          this.logger.error(msg);
          driftError = driftError ? `${driftError}; ${msg}` : msg;
          this.metrics?.clickHouseMigrationFailures.inc();
        }
      }

      this.ch.reportSchemaStatus({ pendingMigrationCount: pending.length });

      let appliedNow = 0;
      for (const migration of pending) {
        await this.applyMigration(adminClient, db, migration);
        appliedNow++;
      }

      const totalApplied = applied.length + appliedNow;
      this.ch.reportSchemaStatus({
        lastSchemaInitAt: new Date(),
        lastSchemaError: driftError,
        appliedMigrationCount: totalApplied,
        pendingMigrationCount: 0,
      });

      this.logger.log(
        `ClickHouse migrations complete — ${appliedNow} applied this run, ${totalApplied} total${driftError ? ' (with checksum drift, see error log)' : ''}.`,
      );
    } finally {
      await adminClient.close();
    }
  }

  private async ensureMigrationsInfrastructure(
    client: ClickHouseClient,
    db: string,
  ): Promise<void> {
    await client.command({
      query: `CREATE DATABASE IF NOT EXISTS ${db}`,
    });
    await client.command({
      query: `
        CREATE TABLE IF NOT EXISTS ${db}.schema_migrations (
          version     String,
          name        String,
          applied_at  DateTime64(3, 'UTC'),
          checksum    String
        )
        ENGINE = ReplacingMergeTree(applied_at)
        ORDER BY (version)
      `,
    });
  }

  private loadMigrationFiles(): MigrationFile[] {
    if (!existsSync(MIGRATIONS_DIR)) {
      this.logger.warn(
        `Migrations directory not found at ${MIGRATIONS_DIR} — no migrations to apply.`,
      );
      return [];
    }

    const fileNames = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.toLowerCase().endsWith('.sql'))
      .sort((a, b) => a.localeCompare(b));

    return fileNames.map((fileName) => {
      const raw = readFileSync(join(MIGRATIONS_DIR, fileName), 'utf8');
      const version = fileName.split('_')[0];
      const name = fileName.replace(/\.sql$/i, '');
      const checksum = createHash('sha256').update(raw).digest('hex');
      return {
        version,
        name,
        checksum,
        statements: splitSqlStatements(raw),
      };
    });
  }

  private async fetchAppliedMigrations(
    client: ClickHouseClient,
    db: string,
  ): Promise<AppliedMigration[]> {
    const result = await client.query({
      query: `SELECT version, checksum FROM ${db}.schema_migrations FINAL`,
      format: 'JSONEachRow',
    });
    return result.json<AppliedMigration>();
  }

  private async applyMigration(
    client: ClickHouseClient,
    db: string,
    migration: MigrationFile,
  ): Promise<void> {
    for (const statement of migration.statements) {
      try {
        await client.command({ query: statement });
      } catch (err: unknown) {
        const message = (err as Error).message ?? String(err);
        const excerpt = statement.replace(/\s+/g, ' ').slice(0, 200);
        this.metrics?.clickHouseMigrationFailures.inc();
        throw new Error(
          `Migration ${migration.name} failed on statement: "${excerpt}" — ${message}`,
        );
      }
    }

    await client.insert({
      table: `${db}.schema_migrations`,
      values: [
        {
          version: migration.version,
          name: migration.name,
          applied_at: new Date()
            .toISOString()
            .replace('T', ' ')
            .replace('Z', ''),
          checksum: migration.checksum,
        },
      ],
      format: 'JSONEachRow',
    });

    this.logger.log(
      `Applied ClickHouse migration ${migration.name} (version ${migration.version}, ${migration.statements.length} statement(s)).`,
    );
  }
}
