/**
 * Controlled task data repair (dry-run by default).
 *
 * NEVER run against production. Only use with an explicitly configured local/test DATABASE_URL.
 *
 * Usage:
 *   cd backend
 *   npx ts-node -r tsconfig-paths/register scripts/ops/repair-task-data.ts
 *   npx ts-node -r tsconfig-paths/register scripts/ops/repair-task-data.ts --organization-id=<uuid>
 *   npx ts-node -r tsconfig-paths/register scripts/ops/repair-task-data.ts --organization-id=<uuid> --apply
 *   npx ts-node -r tsconfig-paths/register scripts/ops/repair-task-data.ts --output=./tmp/task-repair.json
 *   npx ts-node -r tsconfig-paths/register scripts/ops/repair-task-data.ts --batch-size=10
 *
 * Environment:
 *   ORG_ID=<uuid>                      alias for --organization-id
 *   TASK_DATA_REPAIR_ALLOW_REMOTE=1    allow non-local DATABASE_URL (still blocks prod patterns)
 *   TASK_DATA_REPAIR_ALLOW_PROD=1      override production block (strongly discouraged)
 *
 * Exit codes:
 *   0 — completed successfully
 *   1 — runtime / configuration error
 */
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { TaskDataRepairService } from '../../src/modules/tasks/diagnostic/task-data-repair.service';
import { assertSafeRepairDatabaseTarget } from '../../src/modules/tasks/diagnostic/task-data-diagnostic.safety.util';

{
  const envPath = path.resolve(__dirname, '..', '..', '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

function parseArg(prefix: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`${prefix}=`));
  return arg?.split('=').slice(1).join('=').trim() || undefined;
}

function parseArgs() {
  const apply = process.argv.includes('--apply');
  const organizationId = parseArg('--organization-id') ?? process.env.ORG_ID?.trim() ?? undefined;
  const batchSizeRaw = parseArg('--batch-size');
  const batchSize = batchSizeRaw ? Number(batchSizeRaw) : undefined;
  if (batchSize != null && (!Number.isFinite(batchSize) || batchSize < 1)) {
    throw new Error('--batch-size must be a positive number');
  }
  const outputPath = parseArg('--output');
  const allowRemote = process.argv.includes('--allow-remote-db');

  return { apply, organizationId, batchSize, outputPath, allowRemote };
}

async function main() {
  const args = parseArgs();
  assertSafeRepairDatabaseTarget({ allowRemote: args.allowRemote });

  const appModule = await AppModule.forRootAsync();
  const app = await NestFactory.createApplicationContext(appModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const repair = app.get(TaskDataRepairService);
    const report = await repair.runRepair({
      organizationId: args.organizationId,
      apply: args.apply,
      batchSize: args.batchSize,
    });

    const json = JSON.stringify(report, null, 2);
    if (args.outputPath) {
      const abs = path.resolve(args.outputPath);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, json, 'utf8');
      console.log(`Wrote report to ${abs}`);
    }
    console.log(json);

    if (!args.apply) {
      console.error('\nDry-run only — pass --apply to execute repairs.');
    }
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
