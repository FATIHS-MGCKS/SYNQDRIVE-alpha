import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type PhaseAProductionApprovalConsumptionMarkerV1 = {
  approvalId: string;
  consumedAt: string;
  executeNonce: string;
};

function consumptionFilePathV1(consumptionDir: string, approvalId: string): string {
  const safeId = approvalId.replace(/[^a-zA-Z0-9._-]/g, '_');
  return join(consumptionDir, `${safeId}.consumed.json`);
}

export function readPhaseAProductionApprovalConsumptionV1(
  consumptionDir: string,
  approvalId: string,
): PhaseAProductionApprovalConsumptionMarkerV1 | null {
  const file = consumptionFilePathV1(consumptionDir, approvalId);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as PhaseAProductionApprovalConsumptionMarkerV1;
  } catch {
    return { approvalId, consumedAt: 'UNKNOWN', executeNonce: 'UNKNOWN' };
  }
}

export function assertPhaseAProductionApprovalNotConsumedV1(
  consumptionDir: string | undefined,
  approvalId: string,
): { ok: true } | { ok: false; reasonCode: string } {
  if (!consumptionDir?.trim()) {
    return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_APPROVAL_CONSUMPTION_DIR_REQUIRED' };
  }
  const existing = readPhaseAProductionApprovalConsumptionV1(consumptionDir, approvalId);
  if (existing) {
    return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_APPROVAL_ALREADY_CONSUMED' };
  }
  return { ok: true };
}

export function markPhaseAProductionApprovalConsumedV1(
  consumptionDir: string,
  approvalId: string,
  executeNonce: string,
  consumedAt: Date,
): void {
  mkdirSync(consumptionDir, { recursive: true });
  const marker: PhaseAProductionApprovalConsumptionMarkerV1 = {
    approvalId,
    executeNonce,
    consumedAt: consumedAt.toISOString(),
  };
  writeFileSync(consumptionFilePathV1(consumptionDir, approvalId), JSON.stringify(marker), {
    encoding: 'utf8',
    flag: 'wx',
  });
}
