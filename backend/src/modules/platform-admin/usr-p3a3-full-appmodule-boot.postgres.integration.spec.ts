/**
 * USR-P3A.3C — production-equivalent AppModule bootstrap on disposable PostgreSQL.
 *
 * RUN: USR_P3A3_FULL_APPMODULE_BOOT_PG=1 DATABASE_URL=postgresql://...@127.0.0.1:5432/usr_p2_... \
 *   npx jest usr-p3a3-full-appmodule-boot.postgres.integration.spec --runInBand
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import * as request from 'supertest';
import { AppModule } from '../../app.module';
import { MasterGlobalIdentityService } from '@modules/users/master-global-identity.service';

const OPT_IN = 'USR_P3A3_FULL_APPMODULE_BOOT_PG';
const run = process.env[OPT_IN] === '1';

function assertDisposableDatabaseUrl(): void {
  const url = process.env.DATABASE_URL ?? '';
  if (!url.includes('127.0.0.1') && !url.includes('localhost')) {
    throw new Error('DATABASE_URL must target loopback disposable PostgreSQL');
  }
  if (/srv1374778|app\.synqdrive|production/i.test(url)) {
    throw new Error('Refusing production-like DATABASE_URL');
  }
}

(run ? describe : describe.skip)('USR-P3A.3C full AppModule boot (PostgreSQL)', () => {
  jest.setTimeout(420_000);
  const envBackup = { ...process.env };
  const backendRoot = join(__dirname, '../../..');

  beforeAll(() => {
    assertDisposableDatabaseUrl();
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'usr-p3a3-full-appmodule-boot-secret';
    Object.assign(process.env, {
      IAM_MFA_MASTER_ADMIN_ENABLED: 'true',
      IAM_MFA_STEP_UP_ENFORCED: 'true',
    });
  });

  afterAll(() => {
    process.env = { ...envBackup };
  });

  it('SYNQDRIVE_BOOT_CHECK resolves full AppModule graph', () => {
    execFileSync('npm', ['run', 'build'], {
      cwd: backendRoot,
      stdio: 'pipe',
      env: { ...process.env, NODE_ENV: 'test' },
    });
    execFileSync(
      'node',
      ['dist/src/main.js'],
      {
        cwd: backendRoot,
        env: { ...process.env, SYNQDRIVE_BOOT_CHECK: '1' },
        stdio: 'pipe',
        timeout: 180_000,
      },
    );
  });

  it('Nest AppModule serves GET /api/v1/health and resolves MasterGlobalIdentityService', async () => {
    const appModule = await AppModule.forRootAsync();
    const app = await NestFactory.create(appModule, { logger: ['error'] });
    app.setGlobalPrefix('api/v1', {
      exclude: ['master', 'master/(.*)', 'rental', 'rental/(.*)'],
    });
    await app.init();
    const identity = app.get(MasterGlobalIdentityService);
    expect(identity).toBeInstanceOf(MasterGlobalIdentityService);
    await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    await app.close();
  });
});