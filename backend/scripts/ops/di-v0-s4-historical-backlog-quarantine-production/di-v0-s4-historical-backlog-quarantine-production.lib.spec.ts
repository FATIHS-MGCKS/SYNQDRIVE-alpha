import {
  DI_S4_HISTORICAL_BACKLOG_QUARANTINE_ACCEPTED_ACK,
  DI_S4_HISTORICAL_BACKLOG_QUARANTINE_MARKER,
  evaluateHistoricalBacklogQuarantinePreflight,
  evaluateHistoricalBacklogSafetyProof,
  evaluateManifestCompleteness,
  hasQuarantineMarker,
  isClaimEligibleWorkItemRow,
  type HistoricalBacklogManifest,
  type WorkItemSnapshotRow,
} from './di-v0-s4-historical-backlog-quarantine-production.lib';

const ORG = 'faa710c9-0000-4000-8000-000000000001';
const V1 = 'c10351f8-0000-4000-8000-000000000001';
const V2 = '19fedd4b-0000-4000-8000-000000000002';

function manifest(pendingIds: string[], completedId?: string): HistoricalBacklogManifest {
  const preserve = completedId ? [completedId] : [];
  return {
    quarantineWorkItemIds: pendingIds,
    preserveCompletedWorkItemIds: preserve,
    expectedTotalWorkItems: pendingIds.length + preserve.length,
    organizationId: ORG,
    allowedVehicleIds: [V1, V2],
  };
}

function row(
  id: string,
  status: string,
  overrides: Partial<WorkItemSnapshotRow> = {},
): WorkItemSnapshotRow {
  return {
    id,
    status,
    organizationId: ORG,
    vehicleId: V2,
    leaseOwner: null,
    leaseExpired: true,
    nextAttemptAt: null,
    nextAttemptEligible: true,
    attemptCount: 0,
    supersededReason: null,
    failureReason: null,
    ...overrides,
  };
}

describe('historical backlog quarantine lib', () => {
  const pending = Array.from({ length: 18 }, (_, i) =>
    `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
  );
  const completed = '00000000-0000-4000-8000-000000000099';
  const m = manifest(pending, completed);

  it('claim eligibility matches repository semantics', () => {
    expect(isClaimEligibleWorkItemRow(row('a', 'PENDING'))).toBe(true);
    expect(
      isClaimEligibleWorkItemRow(row('a', 'PENDING', { nextAttemptEligible: false, nextAttemptAt: new Date('2099-01-01') })),
    ).toBe(false);
    expect(
      isClaimEligibleWorkItemRow(row('a', 'FAILED_RETRYABLE', { nextAttemptEligible: true })),
    ).toBe(true);
    expect(
      isClaimEligibleWorkItemRow(row('a', 'LEASED', { leaseExpired: true, leaseOwner: 'worker-1' })),
    ).toBe(true);
    expect(
      isClaimEligibleWorkItemRow(row('a', 'LEASED', { leaseExpired: false, leaseOwner: 'worker-1' })),
    ).toBe(false);
    expect(isClaimEligibleWorkItemRow(row('a', 'PENDING', { attemptCount: 5 }))).toBe(false);
  });

  it('manifest completeness requires exact global id set', () => {
    const globalRows = [...pending.map((id) => row(id, 'PENDING')), row(completed, 'COMPLETED', { vehicleId: V1 })];
    expect(evaluateManifestCompleteness(m, globalRows)).toEqual([]);
    const extra = [...globalRows, row('00000000-0000-4000-8000-00000000aa', 'PENDING')];
    const drift = evaluateManifestCompleteness({ ...m, expectedTotalWorkItems: 20 }, extra);
    expect(drift.some((f) => f === 'GLOBAL_WORK_ITEM_COUNT_DRIFT' || f === 'UNKNOWN_TENANT_WORK_ITEM')).toBe(true);
  });

  it('preflight rejects outside-allowlist claimable work', () => {
    const outsider = '00000000-0000-4000-8000-00000000aa';
    const globalRows = [
      ...pending.map((id) => row(id, 'PENDING')),
      row(completed, 'COMPLETED', { vehicleId: V1 }),
      row(outsider, 'PENDING', { organizationId: 'other-org' }),
    ];
    const scopedRows = globalRows.filter((r) => r.organizationId === ORG);
    const r = evaluateHistoricalBacklogQuarantinePreflight({
      ack: DI_S4_HISTORICAL_BACKLOG_QUARANTINE_ACCEPTED_ACK,
      globalKillState: 'KILLED',
      manifest: { ...m, expectedTotalWorkItems: globalRows.length },
      globalRows,
      scopedRows,
    });
    expect(r.failures).toContain('UNKNOWN_TENANT_WORK_ITEM');
  });

  it('safety proof requires quarantine marker on superseded rows', () => {
    const supersededNoMarker = row(pending[0], 'SUPERSEDED', {
      supersededReason: 'OPERATOR',
      failureReason: null,
    });
    const globalRows = [
      supersededNoMarker,
      ...pending.slice(1).map((id) =>
        row(id, 'SUPERSEDED', {
          supersededReason: 'OPERATOR',
          failureReason: `${DI_S4_HISTORICAL_BACKLOG_QUARANTINE_MARKER}:op`,
        }),
      ),
      row(completed, 'COMPLETED', { vehicleId: V1 }),
    ];
    const safety = evaluateHistoricalBacklogSafetyProof({
      manifest: m,
      globalRows,
      scopedRows: globalRows,
    });
    expect(safety.failures).toContain('QUARANTINE_MARKER_DRIFT');
    expect(hasQuarantineMarker(`${DI_S4_HISTORICAL_BACKLOG_QUARANTINE_MARKER}:op`)).toBe(true);
  });

  it('expired LEASED row is claimable and must be listed or superseded', () => {
    const leased = row(pending[0], 'LEASED', { leaseOwner: 'w', leaseExpired: true });
    const globalRows = [leased, ...pending.slice(1).map((id) => row(id, 'PENDING')), row(completed, 'COMPLETED', { vehicleId: V1 })];
    const r = evaluateHistoricalBacklogQuarantinePreflight({
      ack: DI_S4_HISTORICAL_BACKLOG_QUARANTINE_ACCEPTED_ACK,
      globalKillState: 'KILLED',
      manifest: m,
      globalRows,
      scopedRows: globalRows,
    });
    expect(r.failures).toContain('WORK_ITEM_STATUS_DRIFT');
  });
});
