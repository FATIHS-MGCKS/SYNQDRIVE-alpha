import {
  DI_S4_HISTORICAL_BACKLOG_QUARANTINE_ACCEPTED_ACK,
  evaluateHistoricalBacklogQuarantinePreflight,
  evaluateHistoricalBacklogSafetyProof,
  type HistoricalBacklogManifest,
  type WorkItemSnapshotRow,
} from '../di-v0-s4-historical-backlog-quarantine';

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

function pendingRow(id: string, vehicleId = V2): WorkItemSnapshotRow {
  return {
    id,
    status: 'PENDING',
    organizationId: ORG,
    vehicleId,
    leaseOwner: null,
    leaseExpired: true,
    supersededReason: null,
    failureReason: null,
  };
}

function supersededRow(id: string): WorkItemSnapshotRow {
  return {
    ...pendingRow(id),
    status: 'SUPERSEDED',
    supersededReason: 'OPERATOR',
  };
}

describe('di-v0-s4-historical-backlog-quarantine (pure)', () => {
  const pending = Array.from({ length: 18 }, (_, i) =>
    `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
  );
  const completed = '00000000-0000-4000-8000-000000000099';
  const m = manifest(pending, completed);

  it('preflight requires ack and GLOBAL KILLED', () => {
    const rows = [...pending.map((id) => pendingRow(id)), { ...pendingRow(completed, V1), status: 'COMPLETED' }];
    expect(
      evaluateHistoricalBacklogQuarantinePreflight({
        ack: undefined,
        globalKillState: 'KILLED',
        manifest: m,
        rows,
      }).failures,
    ).toContain('QUARANTINE_ACK_INVALID');
    expect(
      evaluateHistoricalBacklogQuarantinePreflight({
        ack: DI_S4_HISTORICAL_BACKLOG_QUARANTINE_ACCEPTED_ACK,
        globalKillState: 'NOT_KILLED',
        manifest: m,
        rows,
      }).failures,
    ).toContain('GLOBAL_NOT_KILLED');
  });

  it('preflight passes for 18 pending + 1 completed', () => {
    const rows = [...pending.map((id) => pendingRow(id)), { ...pendingRow(completed, V1), status: 'COMPLETED' }];
    expect(
      evaluateHistoricalBacklogQuarantinePreflight({
        ack: DI_S4_HISTORICAL_BACKLOG_QUARANTINE_ACCEPTED_ACK,
        globalKillState: 'KILLED',
        manifest: m,
        rows,
      }).ok,
    ).toBe(true);
  });

  it('rejects unexpected runnable work outside manifest', () => {
    const extra = '00000000-0000-4000-8000-0000000000aa';
    const rows = [
      ...pending.map((id) => pendingRow(id)),
      pendingRow(extra),
      { ...pendingRow(completed, V1), status: 'COMPLETED' },
    ];
    const m2 = { ...m, expectedTotalWorkItems: rows.length };
    expect(
      evaluateHistoricalBacklogQuarantinePreflight({
        ack: DI_S4_HISTORICAL_BACKLOG_QUARANTINE_ACCEPTED_ACK,
        globalKillState: 'KILLED',
        manifest: m2,
        rows,
      }).failures,
    ).toContain('UNEXPECTED_RUNNABLE_WORK');
  });

  it('safety proof requires all quarantined SUPERSEDED and zero runnable', () => {
    const rows = [
      ...pending.map((id) => supersededRow(id)),
      { ...pendingRow(completed, V1), status: 'COMPLETED' },
    ];
    const safety = evaluateHistoricalBacklogSafetyProof({ manifest: m, rows });
    expect(safety.ok).toBe(true);
    expect(safety.runnableCount).toBe(0);
  });

  it('idempotent preflight accepts already superseded manifest ids', () => {
    const rows = [
      ...pending.map((id) => supersededRow(id)),
      { ...pendingRow(completed, V1), status: 'COMPLETED' },
    ];
    expect(
      evaluateHistoricalBacklogQuarantinePreflight({
        ack: DI_S4_HISTORICAL_BACKLOG_QUARANTINE_ACCEPTED_ACK,
        globalKillState: 'KILLED',
        manifest: m,
        rows,
      }).ok,
    ).toBe(true);
  });
});
