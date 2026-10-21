import {
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  writeSync,
  closeSync,
} from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

export const M3_3_HV_H4_A3_PHASE_A_PRODUCTION_CONSUMPTION_STORE_MARKER =
  '.synqdrive_phase_a_production_consumption_store_v1' as const;

export const M3_3_HV_H4_A3_PHASE_A_PRODUCTION_APPROVAL_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;

export function assertPhaseAProductionApprovalIdSafeV1(
  approvalId: string,
): { ok: true } | { ok: false; reasonCode: string } {
  const trimmed = approvalId.trim();
  if (!trimmed || trimmed.length > 128) {
    return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_APPROVAL_ID_INVALID' };
  }
  if (!M3_3_HV_H4_A3_PHASE_A_PRODUCTION_APPROVAL_ID_PATTERN.test(trimmed)) {
    return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_APPROVAL_ID_INVALID' };
  }
  if (trimmed.includes('..') || trimmed.includes('/') || trimmed.includes('\\')) {
    return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_APPROVAL_ID_INVALID' };
  }
  return { ok: true };
}

function isUnsafeEphemeralConsumptionPathV1(resolvedPath: string): boolean {
  const lower = resolvedPath.toLowerCase();
  return (
    lower.startsWith('/tmp/') ||
    lower === '/tmp' ||
    lower.includes('/tmp/') ||
    lower.startsWith('/var/folders/') ||
    lower.includes('/temp/')
  );
}

/**
 * Production consumption store must pre-exist, be absolute, non-symlink, and carry a marker file.
 * Fresh arbitrary directories (e.g. mkdtemp) are not trusted as replay-protection evidence.
 */
export function validatePhaseAProductionConsumptionStoreV1(
  consumptionDir: string | undefined,
): { ok: true; resolvedPath: string } | { ok: false; reasonCode: string } {
  if (!consumptionDir?.trim()) {
    return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_APPROVAL_CONSUMPTION_DIR_REQUIRED' };
  }

  if (!isAbsolute(consumptionDir)) {
    return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_CONSUMPTION_STORE_NOT_ABSOLUTE' };
  }

  let resolved: string;
  try {
    resolved = realpathSync(resolve(consumptionDir));
  } catch {
    return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_CONSUMPTION_STORE_UNRESOLVABLE' };
  }

  if (isUnsafeEphemeralConsumptionPathV1(resolved)) {
    return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_CONSUMPTION_STORE_EPHEMERAL_FORBIDDEN' };
  }

  let stat;
  try {
    stat = lstatSync(resolved);
  } catch {
    return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_CONSUMPTION_STORE_MISSING' };
  }

  if (!stat.isDirectory()) {
    return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_CONSUMPTION_STORE_NOT_DIRECTORY' };
  }

  const markerPath = join(resolved, M3_3_HV_H4_A3_PHASE_A_PRODUCTION_CONSUMPTION_STORE_MARKER);
  if (!existsSync(markerPath)) {
    return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_CONSUMPTION_STORE_MARKER_MISSING' };
  }

  return { ok: true, resolvedPath: resolved };
}

export function consumptionMarkerPathV1(resolvedStorePath: string, approvalId: string): string {
  const idOk = assertPhaseAProductionApprovalIdSafeV1(approvalId);
  if (!idOk.ok) {
    throw new Error(idOk.reasonCode);
  }
  return join(resolvedStorePath, `${approvalId.trim()}.consumed.json`);
}

export type PhaseAProductionApprovalConsumptionMarkerV1 = {
  approvalId: string;
  consumedAt: string;
  executeNonce: string;
  operationOutcome: 'ADMITTED_AND_CONSUMED';
};

export function readPhaseAProductionConsumptionMarkerV1(
  resolvedStorePath: string,
  approvalId: string,
): PhaseAProductionApprovalConsumptionMarkerV1 | null {
  const file = consumptionMarkerPathV1(resolvedStorePath, approvalId);
  if (!existsSync(file)) return null;
  try {
    const raw = readFileSync(file, 'utf8');
    return JSON.parse(raw) as PhaseAProductionApprovalConsumptionMarkerV1;
  } catch {
    return {
      approvalId,
      consumedAt: 'CORRUPT',
      executeNonce: 'CORRUPT',
      operationOutcome: 'ADMITTED_AND_CONSUMED',
    };
  }
}

export function assertPhaseAProductionApprovalNotConsumedV1(
  resolvedStorePath: string,
  approvalId: string,
): { ok: true } | { ok: false; reasonCode: string } {
  const existing = readPhaseAProductionConsumptionMarkerV1(resolvedStorePath, approvalId);
  if (existing) {
    return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_APPROVAL_ALREADY_CONSUMED' };
  }
  return { ok: true };
}

/** Atomic O_EXCL create — concurrent replay loses race with EEXIST. */
export function markPhaseAProductionApprovalConsumedAtomicV1(
  resolvedStorePath: string,
  approvalId: string,
  executeNonce: string,
  consumedAt: Date,
): { ok: true } | { ok: false; reasonCode: string } {
  const file = consumptionMarkerPathV1(resolvedStorePath, approvalId);
  const marker: PhaseAProductionApprovalConsumptionMarkerV1 = {
    approvalId: approvalId.trim(),
    executeNonce,
    consumedAt: consumedAt.toISOString(),
    operationOutcome: 'ADMITTED_AND_CONSUMED',
  };
  const payload = JSON.stringify(marker);
  try {
    const fd = openSync(file, 'wx', 0o600);
    try {
      writeSync(fd, payload, 0, 'utf8');
    } finally {
      closeSync(fd);
    }
    return { ok: true };
  } catch (error: unknown) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === 'EEXIST') {
      return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_APPROVAL_ALREADY_CONSUMED' };
    }
    return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_CONSUMPTION_WRITE_FAILED' };
  }
}

/** Integration tests: provision a store directory with marker (does not weaken production validators). */
export function provisionPhaseAProductionConsumptionStoreFixtureV1(absolutePath: string): void {
  mkdirSync(absolutePath, { recursive: true, mode: 0o700 });
  const marker = join(absolutePath, M3_3_HV_H4_A3_PHASE_A_PRODUCTION_CONSUMPTION_STORE_MARKER);
  if (!existsSync(marker)) {
    const fd = openSync(marker, 'w', 0o600);
    writeSync(fd, 'synqdrive-phase-a-production-consumption-store-v1\n', 0, 'utf8');
    closeSync(fd);
  }
}
