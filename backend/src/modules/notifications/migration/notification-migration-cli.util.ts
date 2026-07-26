import * as fs from 'fs';

export interface MigrationCliArgs {
  orgId?: string;
  outPath?: string;
  checkpointPath?: string;
  batchSize?: number;
  includeInactive: boolean;
  apply: boolean;
  dryRun: boolean;
}

export function parseMigrationCliArgs(argv: string[] = process.argv): MigrationCliArgs {
  const argValue = (flag: string): string | undefined => {
    const idx = argv.indexOf(flag);
    return idx >= 0 ? argv[idx + 1] : undefined;
  };

  const apply = argv.includes('--apply');
  const dryRun = argv.includes('--dry-run') || !apply;
  const batchSizeRaw = argValue('--batch-size');
  const batchSize = batchSizeRaw ? Number.parseInt(batchSizeRaw, 10) : undefined;

  return {
    orgId: argValue('--org'),
    outPath: argValue('--out'),
    checkpointPath: argValue('--checkpoint'),
    batchSize: Number.isFinite(batchSize) && batchSize! > 0 ? batchSize : undefined,
    includeInactive: argv.includes('--include-inactive'),
    apply,
    dryRun,
  };
}

export function writeMigrationJsonReport(
  payload: unknown,
  outPath?: string,
  label = 'migration',
): void {
  const json = JSON.stringify(payload, null, 2);
  if (outPath) {
    fs.writeFileSync(outPath, json, 'utf8');
    console.error(`[${label}] Wrote JSON report to ${outPath}`);
  } else {
    console.log(json);
  }
}

export function loadCheckpoint<T extends { organizationId: string }>(
  checkpointPath: string | undefined,
  expectedOrgId: string,
): T | null {
  if (!checkpointPath || !fs.existsSync(checkpointPath)) {
    return null;
  }

  const checkpoint = JSON.parse(fs.readFileSync(checkpointPath, 'utf8')) as T;
  if (checkpoint.organizationId !== expectedOrgId) {
    throw new Error(
      `Checkpoint organization mismatch: checkpoint=${checkpoint.organizationId} cli=${expectedOrgId}`,
    );
  }
  return checkpoint;
}

export function saveCheckpoint(
  checkpointPath: string | undefined,
  checkpoint: unknown,
  options: { apply: boolean },
): void {
  if (!checkpointPath || !options.apply) {
    return;
  }
  fs.writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2), 'utf8');
  console.error(`[backfill] Checkpoint saved to ${checkpointPath}`);
}
