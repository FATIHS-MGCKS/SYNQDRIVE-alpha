import { DrivingIntelligenceJobHandlerRegistry } from './driving-intelligence-jobs.handler.registry';
import { DRIVING_INTELLIGENCE_JOB_TYPES } from './driving-intelligence-jobs.types';

describe('DrivingIntelligenceJobHandlerRegistry', () => {
  it('registers stub handlers for all canonical job types', () => {
    const registry = new DrivingIntelligenceJobHandlerRegistry();
    expect(registry.listRegisteredJobTypes()).toEqual([...DRIVING_INTELLIGENCE_JOB_TYPES]);
  });

  it('dispatches without throwing for each job type', async () => {
    const registry = new DrivingIntelligenceJobHandlerRegistry();
    for (const jobType of DRIVING_INTELLIGENCE_JOB_TYPES) {
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
