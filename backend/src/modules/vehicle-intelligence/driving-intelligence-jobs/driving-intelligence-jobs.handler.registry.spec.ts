import { DrivingEventContextEnrichJobHandler } from '../event-context/driving-event-context-enrich.handler';
import { DrivingMisuseReconcileJobHandler } from '../misuse-cases/misuse-case-reconcile/driving-misuse-reconcile.handler';
import { DrivingAttributionResolveJobHandler } from '../driver-attribution/driving-attribution-resolve.handler';
import { DrivingIntelligenceJobHandlerRegistry } from './driving-intelligence-jobs.handler.registry';
import { DRIVING_INTELLIGENCE_JOB_TYPES } from './driving-intelligence-jobs.types';

describe('DrivingIntelligenceJobHandlerRegistry', () => {
  it('registers handlers for all canonical job types after init', () => {
    const registry = new DrivingIntelligenceJobHandlerRegistry();
    registry.onModuleInit();
    expect(registry.listRegisteredJobTypes()).toEqual([...DRIVING_INTELLIGENCE_JOB_TYPES]);
  });

  it('dispatches DRIVING_EVENT_CONTEXT_ENRICH to the real handler when wired', async () => {
    const handle = jest.fn(async () => undefined);
    const registry = new DrivingIntelligenceJobHandlerRegistry({
      handle,
    } as unknown as DrivingEventContextEnrichJobHandler);
    registry.onModuleInit();

    await registry.dispatch({
      id: 'job-1',
      jobType: 'DRIVING_EVENT_CONTEXT_ENRICH',
      organizationId: 'org-1',
      vehicleId: 'vehicle-1',
      analysisRunId: 'run-1',
    } as any);

    expect(handle).toHaveBeenCalledTimes(1);
  });

  it('dispatches DRIVING_MISUSE_RECONCILE to the real handler when wired', async () => {
    const handle = jest.fn(async () => undefined);
    const registry = new DrivingIntelligenceJobHandlerRegistry(
      undefined,
      undefined,
      { handle } as unknown as DrivingMisuseReconcileJobHandler,
    );
    registry.onModuleInit();

    await registry.dispatch({
      id: 'job-misuse',
      jobType: 'DRIVING_MISUSE_RECONCILE',
      organizationId: 'org-1',
      vehicleId: 'vehicle-1',
      tripId: 'trip-1',
      analysisRunId: 'run-1',
    } as any);

    expect(handle).toHaveBeenCalledTimes(1);
  });

  it('dispatches DRIVING_ATTRIBUTION_RESOLVE to the real handler when wired', async () => {
    const handle = jest.fn(async () => undefined);
    const registry = new DrivingIntelligenceJobHandlerRegistry(
      undefined,
      undefined,
      undefined,
      { handle } as unknown as DrivingAttributionResolveJobHandler,
    );
    registry.onModuleInit();

    await registry.dispatch({
      id: 'job-attr',
      jobType: 'DRIVING_ATTRIBUTION_RESOLVE',
      organizationId: 'org-1',
      vehicleId: 'vehicle-1',
      tripId: 'trip-1',
      analysisRunId: 'run-1',
    } as any);

    expect(handle).toHaveBeenCalledTimes(1);
  });

  it('dispatches stub handlers for other job types', async () => {
    const registry = new DrivingIntelligenceJobHandlerRegistry();
    registry.onModuleInit();
    for (const jobType of DRIVING_INTELLIGENCE_JOB_TYPES) {
      if (
        jobType === 'DRIVING_EVENT_CONTEXT_ENRICH' ||
        jobType === 'DRIVING_MISUSE_RECONCILE' ||
        jobType === 'DRIVING_ATTRIBUTION_RESOLVE'
      ) {
        continue;
      }
      await expect(
        registry.dispatch({
          id: 'job-1',
          jobType,
          organizationId: 'org-1',
          vehicleId: 'vehicle-1',
          analysisRunId: 'run-1',
        } as any),
      ).resolves.toBeUndefined();
    }
  });
});
