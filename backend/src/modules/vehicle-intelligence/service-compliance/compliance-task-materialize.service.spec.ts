import { ComplianceTaskMaterializeService } from './compliance-task-materialize.service';
import type { ComplianceTaskSignalDto } from './service-compliance.types';

describe('ComplianceTaskMaterializeService deduplication', () => {
  const signal: ComplianceTaskSignalDto = {
    signalKey: 'service_overdue:v1',
    dedupeKey: 'service_overdue:v1',
    kind: 'SERVICE_URGENT',
    insightType: 'SERVICE_OVERDUE',
    title: 'Service dringend prüfen',
    message: 'Test',
    actionLabel: 'Service terminieren',
    severity: 'CRITICAL',
    suggestionOnly: false,
    blocksRental: false,
    dueDate: null,
    category: 'Maintenance',
    taskType: 'VEHICLE_SERVICE',
  };

  const tasks = {
    upsertByDedup: jest.fn().mockResolvedValue({ id: 't1', dedupKey: signal.dedupeKey }),
  };
  const serviceCompliance = {
    buildServiceInfoStatus: jest.fn(),
  };

  const svc = new ComplianceTaskMaterializeService(serviceCompliance as any, tasks as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reuses dedupeKey on repeated materialize calls', async () => {
    await svc.upsertFromSignal('org1', 'v1', signal);
    await svc.upsertFromSignal('org1', 'v1', signal);

    expect(tasks.upsertByDedup).toHaveBeenCalledTimes(2);
    expect(tasks.upsertByDedup).toHaveBeenNthCalledWith(
      1,
      'org1',
      'service_overdue:v1',
      expect.objectContaining({ title: signal.title }),
    );
    expect(tasks.upsertByDedup).toHaveBeenNthCalledWith(
      2,
      'org1',
      'service_overdue:v1',
      expect.objectContaining({ title: signal.title }),
    );
  });

  it('due-soon signals are marked suggestionOnly in metadata', async () => {
    await svc.upsertFromSignal('org1', 'v1', { ...signal, severity: 'WARNING', suggestionOnly: true });
    expect(tasks.upsertByDedup).toHaveBeenCalledWith(
      'org1',
      signal.dedupeKey,
      expect.objectContaining({
        metadata: expect.objectContaining({ suggestionOnly: true }),
      }),
    );
  });
});
