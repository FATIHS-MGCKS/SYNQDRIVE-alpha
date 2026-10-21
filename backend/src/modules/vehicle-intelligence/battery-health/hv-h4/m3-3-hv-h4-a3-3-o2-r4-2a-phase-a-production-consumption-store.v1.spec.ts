import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertPhaseAProductionApprovalNotConsumedV1,
  markPhaseAProductionApprovalConsumedAtomicV1,
  provisionPhaseAProductionConsumptionStoreFixtureV1,
  validatePhaseAProductionConsumptionStoreV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-consumption-store.v1';

describe('validatePhaseAProductionConsumptionStoreV1', () => {
  it('rejects ephemeral /tmp paths', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'phase-a-consume-'));
    provisionPhaseAProductionConsumptionStoreFixtureV1(tmp);
    const result = validatePhaseAProductionConsumptionStoreV1(tmp);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasonCode).toBe('PHASE_A_PRODUCTION_CONSUMPTION_STORE_EPHEMERAL_FORBIDDEN');
    }
    rmSync(tmp, { recursive: true, force: true });
  });

  it('accepts provisioned workspace store and blocks replay', () => {
    const storePath = join(process.cwd(), `.phase-a-store-${Date.now()}`);
    provisionPhaseAProductionConsumptionStoreFixtureV1(storePath);
    const validated = validatePhaseAProductionConsumptionStoreV1(storePath);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    const approvalId = 'apr-replay-001';
    expect(assertPhaseAProductionApprovalNotConsumedV1(validated.resolvedPath, approvalId).ok).toBe(
      true,
    );
    const first = markPhaseAProductionApprovalConsumedAtomicV1(
      validated.resolvedPath,
      approvalId,
      'nonce-1',
      new Date(),
    );
    expect(first.ok).toBe(true);
    const second = markPhaseAProductionApprovalConsumedAtomicV1(
      validated.resolvedPath,
      approvalId,
      'nonce-2',
      new Date(),
    );
    expect(second.ok).toBe(false);
    rmSync(storePath, { recursive: true, force: true });
  });
});
