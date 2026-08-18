/**
 * Internal-only temporary master-admin smoke account lifecycle.
 *
 * Commands: setup | status | cleanup | run
 *
 * Production requires:
 *   MASTER_ADMIN_SMOKE_PROVISIONING_ENABLED=true
 *   --confirm-production-smoke
 *
 * Usage:
 *   cd backend
 *   MASTER_ADMIN_SMOKE_PROVISIONING_ENABLED=true \
 *     npx ts-node -r tsconfig-paths/register scripts/ops/master-admin-smoke-lifecycle.ts setup --confirm-production-smoke
 */
import * as fs from 'fs';
import * as path from 'path';
import { createMasterAdminSmokeOpsContext } from '../../src/modules/master-admin-smoke-lifecycle/master-admin-smoke-ops.context';
import { MasterAdminSmokeLifecycleService } from '../../src/modules/master-admin-smoke-lifecycle/master-admin-smoke-lifecycle.service';
import { readSmokeCredential } from '../../src/modules/master-admin-smoke-lifecycle/master-admin-smoke-credential.store';
import { runMasterAdminReadonlySmoke } from '../../src/modules/master-admin-smoke-lifecycle/master-admin-smoke-readonly.runner';

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function command(): string {
  const arg = process.argv[2];
  if (!arg || arg.startsWith('-')) {
    throw new Error('Command required: setup | status | cleanup | run');
  }
  return arg;
}

function loadEnv(): void {
  const envPath = path.resolve(__dirname, '..', '..', '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
}

function redactOutput(value: unknown): unknown {
  const text = JSON.stringify(value);
  if (/password|secret|credential/i.test(text) && !/credentialFilePath|credentialFilePresent|credentialDestroyed/i.test(text)) {
    throw new Error('Refusing to print output that may contain credentials');
  }
  return value;
}

async function main(): Promise<void> {
  loadEnv();
  const cmd = command();
  const confirmProductionSmoke = hasFlag('--confirm-production-smoke');
  const app = await createMasterAdminSmokeOpsContext();
  const lifecycle = app.get(MasterAdminSmokeLifecycleService);

  try {
    if (cmd === 'status') {
      const result = await lifecycle.status();
      console.log(JSON.stringify(redactOutput(result), null, 2));
      return;
    }

    if (cmd === 'setup') {
      const result = await lifecycle.setup({ confirmProductionSmoke });
      console.log(
        JSON.stringify(
          redactOutput({
            command: 'setup',
            userId: result.userId,
            email: result.email,
            expiresAt: result.expiresAt,
            credentialFilePath: result.credentialFilePath,
            reactivated: result.reactivated,
          }),
          null,
          2,
        ),
      );
      return;
    }

    if (cmd === 'cleanup') {
      const result = await lifecycle.cleanup({
        confirmProductionSmoke,
        reason: 'ops lifecycle cleanup',
      });
      const verification = await lifecycle.verifyPostCleanup();
      console.log(
        JSON.stringify(
          redactOutput({
            command: 'cleanup',
            ...result,
            verification,
          }),
          null,
          2,
        ),
      );
      if (!verification.ok) process.exitCode = 1;
      return;
    }

    if (cmd === 'run') {
      let setupResult: Awaited<ReturnType<MasterAdminSmokeLifecycleService['setup']>> | null = null;
      try {
        setupResult = await lifecycle.setup({ confirmProductionSmoke });
        const password = readSmokeCredential();
        if (!password) {
          throw new Error('Smoke credential file missing after setup');
        }
        const smoke = await runMasterAdminReadonlySmoke({ password });
        console.log(
          JSON.stringify(
            redactOutput({
              command: 'run',
              setup: {
                userId: setupResult.userId,
                email: setupResult.email,
                expiresAt: setupResult.expiresAt,
                credentialFilePath: setupResult.credentialFilePath,
              },
              smoke,
            }),
            null,
            2,
          ),
        );
        if (!smoke.login.ok || smoke.failed > 0) {
          process.exitCode = 1;
        }
      } finally {
        const cleanup = await lifecycle.cleanup({
          confirmProductionSmoke,
          reason: 'run command finally cleanup',
        });
        const postCleanup = await lifecycle.verifyPostCleanup();
        console.log(
          JSON.stringify(
            redactOutput({
              command: 'run',
              phase: 'finally',
              cleanup,
              postCleanup,
            }),
            null,
            2,
          ),
        );
        if (!postCleanup.ok) process.exitCode = 1;
      }
      return;
    }

    throw new Error(`Unknown command: ${cmd}`);
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({ error: message }));
  process.exit(1);
});
