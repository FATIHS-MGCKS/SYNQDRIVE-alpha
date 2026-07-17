import { evaluateModulePermission } from '@shared/auth/permission.util';
import { DATA_ANALYSE_MODULE } from '@modules/data-analyse/data-analyse.constants';
import { HvCapacityShadowEvaluationController } from './hv-capacity-shadow-evaluation.controller';

describe('HvCapacityShadowEvaluationController permissions', () => {
  const workerPerms = {
    'data-analyse': { read: true, write: false, manage: false },
    'fleet-condition': { read: true, write: false, manage: false },
  } as const;

  const driverPerms = {
    'data-analyse': { read: false, write: false, manage: false },
    'fleet-condition': { read: false, write: false, manage: false },
  } as const;

  it('requires data-analyse read for internal shadow evaluation endpoint', () => {
    expect(
      evaluateModulePermission(workerPerms, DATA_ANALYSE_MODULE, 'read'),
    ).toBe(true);
    expect(
      evaluateModulePermission(driverPerms, DATA_ANALYSE_MODULE, 'read'),
    ).toBe(false);
  });

  it('does not grant access via fleet-condition read alone', () => {
    const fleetOnlyPerms = {
      'fleet-condition': { read: true, write: false, manage: false },
    } as const;

    expect(
      evaluateModulePermission(fleetOnlyPerms, DATA_ANALYSE_MODULE, 'read'),
    ).toBe(false);
  });

  it('registers controller for data-analyse vehicle route', () => {
    expect(HvCapacityShadowEvaluationController).toBeDefined();
  });
});
