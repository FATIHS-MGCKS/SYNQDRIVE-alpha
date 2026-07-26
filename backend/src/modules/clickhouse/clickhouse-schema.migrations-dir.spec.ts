import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { resolveMigrationsDir } from './clickhouse-schema.service';

/**
 * Regression guard for a silent production failure: nest-cli copied the
 * migration .sql assets to `dist/modules/...` while the compiled service ran
 * from `dist/src/modules/...`, so the runner found no files and reported
 * "0 pending" forever. ClickHouse migration 007 never applied in production.
 */
describe('ClickHouse migrations directory resolution', () => {
  const backendRoot = join(__dirname, '..', '..', '..');

  it('picks the first existing candidate', () => {
    const exists = (p: string) => p === '/b';
    expect(resolveMigrationsDir(['/a', '/b', '/c'], exists)).toBe('/b');
  });

  it('returns null when no candidate exists so the caller can fail loudly', () => {
    expect(resolveMigrationsDir(['/a', '/b'], () => false)).toBeNull();
  });

  it('nest-cli copies the .sql assets next to the compiled service', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nestCli = require(join(backendRoot, 'nest-cli.json'));
    const assets = nestCli.compilerOptions?.assets ?? [];

    const migrationAsset = assets.find(
      (a: unknown) =>
        typeof a === 'object' &&
        a !== null &&
        String((a as { include?: string }).include).includes(
          'modules/clickhouse/migrations',
        ),
    );

    expect(migrationAsset).toBeDefined();
    // Assets are copied relative to sourceRoot, but tsc emits to dist/src
    // because prisma/ and scripts/ widen the inferred rootDir. Without this
    // outDir the two paths diverge and every migration is skipped.
    expect(migrationAsset.outDir).toBe('dist/src');
  });

  it('every source migration is a candidate for the runner', () => {
    const srcDir = join(backendRoot, 'src', 'modules', 'clickhouse', 'migrations');
    expect(existsSync(srcDir)).toBe(true);

    const sqlFiles = readdirSync(srcDir).filter((f) => f.endsWith('.sql'));
    expect(sqlFiles.length).toBeGreaterThan(0);
    // Versions must be unique — the runner keys schema_migrations on them.
    const versions = sqlFiles.map((f) => f.split('_')[0]);
    expect(new Set(versions).size).toBe(versions.length);
  });
});
