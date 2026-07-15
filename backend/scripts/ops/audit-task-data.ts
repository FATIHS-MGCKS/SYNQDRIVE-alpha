/**
 * Read-only task data diagnostic — audits OrgTask integrity without mutating data.
 *
 * NEVER run against production. Only use with an explicitly configured local/test DATABASE_URL.
 *
 * Usage:
 *   cd backend
 *   npx ts-node -r tsconfig-paths/register scripts/ops/audit-task-data.ts
 *   npx ts-node -r tsconfig-paths/register scripts/ops/audit-task-data.ts --organization-id=<uuid>
 *   npx ts-node -r tsconfig-paths/register scripts/ops/audit-task-data.ts --format=markdown
 *   npx ts-node -r tsconfig-paths/register scripts/ops/audit-task-data.ts --output=./tmp/task-audit.json
 *   npx ts-node -r tsconfig-paths/register scripts/ops/audit-task-data.ts --output=./tmp/task-audit.md --format=markdown
 *   npx ts-node -r tsconfig-paths/register scripts/ops/audit-task-data.ts --limit=10 --include-findings
 *   npx ts-node -r tsconfig-paths/register scripts/ops/audit-task-data.ts --dry-run
 *
 * Environment:
 *   ORG_ID=<uuid>                         alias for --organization-id
 *   TASK_DATA_DIAGNOSTIC_ALLOW_REMOTE=1   allow non-local DATABASE_URL (still blocks prod patterns)
 *   TASK_DATA_DIAGNOSTIC_ALLOW_PROD=1     override production block (strongly discouraged)
 *
 * Exit codes:
 *   0 — completed successfully (findings do not affect exit code)
 *   1 — runtime / configuration error
 */
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { TaskDataDiagnosticService } from '../../src/modules/tasks/diagnostic/task-data-diagnostic.service';
import {
  renderTaskDiagnosticConsole,
  renderTaskDiagnosticMarkdown,
} from '../../src/modules/tasks/diagnostic/task-data-diagnostic-markdown.util';
import { assertSafeDiagnosticDatabaseTarget } from '../../src/modules/tasks/diagnostic/task-data-diagnostic.safety.util';

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

function parseFormat(): 'json' | 'markdown' | 'console' {
  const raw = parseArg('--format') ?? 'json';
  if (raw === 'json' || raw === 'markdown' || raw === 'console') return raw;
  throw new Error(`Unsupported --format=${raw} (use json, markdown, or console)`);
}

async function main() {
  const organizationId =
    parseArg('--organization-id') ?? process.env.ORG_ID?.trim() ?? undefined;
  const limitRaw = parseArg('--limit');
  const sampleLimit = limitRaw ? Number(limitRaw) : undefined;
  if (sampleLimit != null && (!Number.isFinite(sampleLimit) || sampleLimit < 1)) {
    throw new Error('--limit must be a positive number');
  }
  const outputPath = parseArg('--output');
  const format = parseFormat();
  const includeFindings = process.argv.includes('--include-findings');
  const dryRun = process.argv.includes('--dry-run') || !process.argv.includes('--no-dry-run');
  const allowRemote = process.argv.includes('--allow-remote-db');

  assertSafeDiagnosticDatabaseTarget({ allowRemote });

  const appModule = await AppModule.forRootAsync();
  const app = await NestFactory.createApplicationContext(appModule, {
    logger: ['error', 'warn'],
  });

  try {
    const diagnostic = app.get(TaskDataDiagnosticService);
    const report = await diagnostic.runDiagnostic({
      organizationId,
      sampleLimit,
      includeFindings,
    });

    if (!dryRun) {
      console.error('This tool is always read-only; --no-dry-run is ignored.');
    }

    const json = JSON.stringify(report, null, 2);
    const markdown = renderTaskDiagnosticMarkdown(report);
    const consoleReport = renderTaskDiagnosticConsole(report);

    if (outputPath) {
      const abs = path.resolve(outputPath);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      if (abs.endsWith('.md')) {
        fs.writeFileSync(abs, markdown, 'utf8');
      } else {
        fs.writeFileSync(abs, json, 'utf8');
      }
      console.log(`Wrote report to ${abs}`);
    }

    if (format === 'json') {
      console.log(json);
    } else if (format === 'markdown') {
      console.log(markdown);
    } else {
      console.log(consoleReport);
    }
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
