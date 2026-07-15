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
  const serviceOverdueTasks = {
    materializeFromSignal: jest.fn().mockResolvedValue({ id: 't1' }),
  };

  const svc = new ComplianceTaskMaterializeService(
    serviceCompliance as any,
    tasks as any,
    serviceOverdueTasks as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reuses dedupeKey on repeated materialize calls', async () => {
    await svc.upsertFromSignal('org1', 'v1', { ...signal, serviceOverdueContext: { overdue: true } as any });
    await svc.upsertFromSignal('org1', 'v1', { ...signal, serviceOverdueContext: { overdue: true } as any });

    expect(serviceOverdueTasks.materializeFromSignal).toHaveBeenCalledTimes(2);
  });

  it('delegates VEHICLE_SERVICE signals to ServiceOverdueTaskService', async () => {
    await svc.upsertFromSignal('org1', 'v1', { ...signal, serviceOverdueContext: { overdue: true } as any });
    expect(serviceOverdueTasks.materializeFromSignal).toHaveBeenCalledWith('org1', 'v1', expect.objectContaining({ dedupeKey: signal.dedupeKey }));
  });
});
