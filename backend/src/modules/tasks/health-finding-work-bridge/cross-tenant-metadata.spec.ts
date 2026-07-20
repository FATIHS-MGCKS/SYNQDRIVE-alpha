import { BadRequestException } from '@nestjs/common';
import { sanitizeHealthTaskMetadata } from '../../../modules/tasks/health-task-metadata.util';

describe('health-finding-work-bridge/cross-tenant-metadata', () => {
  it('rejects health task metadata with foreign organizationId', () => {
    expect(() =>
      sanitizeHealthTaskMetadata(
        {
          sourceType: 'HEALTH',
          organizationId: 'org-foreign',
          vehicleId: 'veh-1',
          healthModule: 'tires',
        },
        { organizationId: 'org-1', vehicleId: 'veh-1', sourceType: 'HEALTH' },
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects health task metadata with foreign vehicleId', () => {
    expect(() =>
      sanitizeHealthTaskMetadata(
        {
          sourceType: 'HEALTH',
          organizationId: 'org-1',
          vehicleId: 'veh-foreign',
          healthModule: 'tires',
        },
        { organizationId: 'org-1', vehicleId: 'veh-1', sourceType: 'HEALTH' },
      ),
    ).toThrow(/vehicleId/);
  });
});
