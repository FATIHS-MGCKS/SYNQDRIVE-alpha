import { parsePdiP1b2UninstallOperatorScope } from './pdi-p1b2-uninstall-operator.lib';
import { assertP1b2PilotSafeUninstallPolicy } from './physical-device-inventory-p1b2.writes';
import { PhysicalDeviceUninstallCondition } from './dto/uninstall-physical-device.dto';
import { PHYSICAL_DEVICE_P1B2_PILOT_UNINSTALL_POLICY_VIOLATION } from './physical-device-inventory.errors';

describe('pdi-p1b2-uninstall-operator.lib', () => {
  it('parses required scope flags', () => {
    const scope = parsePdiP1b2UninstallOperatorScope({
      physicalDeviceId: '11111111-1111-4111-8111-111111111111',
      vehicleId: '22222222-2222-4222-8222-222222222222',
      assignmentId: '33333333-3333-4333-8333-333333333333',
      idempotencyKey: 'pilot-uninstall-key-1',
      uninstallReason: 'Workshop removal confirmed',
    });
    expect(scope.physicalDeviceId).toMatch(/11111111/);
    expect(scope.idempotencyKey).toBe('pilot-uninstall-key-1');
  });

  it('rejects missing scope fields', () => {
    expect(() =>
      parsePdiP1b2UninstallOperatorScope({ physicalDeviceId: 'x' }),
    ).toThrow(/requires/);
  });
});

describe('assertP1b2PilotSafeUninstallPolicy', () => {
  const prior = process.env.PHYSICAL_DEVICE_INVENTORY_P1B2_PILOT_SAFE_UNINSTALL;

  afterEach(() => {
    process.env.PHYSICAL_DEVICE_INVENTORY_P1B2_PILOT_SAFE_UNINSTALL = prior;
  });

  it('blocks direct return to AVAILABLE when pilot flag enabled', () => {
    process.env.PHYSICAL_DEVICE_INVENTORY_P1B2_PILOT_SAFE_UNINSTALL = 'true';
    try {
      assertP1b2PilotSafeUninstallPolicy({
        vehicleId: 'v',
        assignmentId: 'a',
        physicalUninstallConfirmed: true,
        uninstallReason: 'r',
        deviceConditionAfterUninstall: PhysicalDeviceUninstallCondition.FUNCTIONAL,
        physicalReturnConfirmed: true,
        warehouseLocation: 'WH',
      });
      fail('expected policy violation');
    } catch (error: any) {
      expect(error?.response?.code).toBe(PHYSICAL_DEVICE_P1B2_PILOT_UNINSTALL_POLICY_VIOLATION);
    }
  });
});
