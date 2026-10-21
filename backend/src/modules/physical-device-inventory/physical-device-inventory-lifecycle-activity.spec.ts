import { ActivityAction, ActivityEntity } from '@prisma/client';
import { AuditService } from '@modules/activity-log/audit.service';
import {
  assertPhysicalDeviceLifecycleActivityRecorded,
  recordPhysicalDeviceLifecycleActivityAudit,
} from './physical-device-inventory-lifecycle-activity';
import { PHYSICAL_DEVICE_LIFECYCLE_COMMITTED_ACTIVITY_AUDIT_FAILURE } from './physical-device-inventory.errors';
import type { PhysicalDeviceListItemDto } from './physical-device-inventory.types';

describe('physical-device-inventory-lifecycle-activity', () => {
  const baseResult: PhysicalDeviceListItemDto = {
    id: 'dev-1',
    internalInventoryNumber: 'PDI-TEST',
    manufacturer: 'Ruptela',
    modelCode: 'RUPTELA_R1',
    status: 'PENDING_RETURN',
    identityStatus: 'VERIFIED',
    ownerOrganizationId: null,
    warehouseLocation: 'WH',
    serialNumberMasked: 'R1-***',
    imeiMasked: null,
    currentVehicleId: null,
    installEligible: false,
    recordedAt: new Date().toISOString(),
  };

  it('throws when activity audit returns null after domain commit', async () => {
    const audit = {
      record: jest.fn().mockResolvedValue(null),
    } as unknown as AuditService;

    await expect(
      assertPhysicalDeviceLifecycleActivityRecorded(audit, {
        lifecycleAction: 'UNINSTALL',
        actorUserId: 'actor-1',
        result: baseResult,
        changeSummary: 'vehicleId=v1',
      }),
    ).rejects.toMatchObject({
      response: { code: PHYSICAL_DEVICE_LIFECYCLE_COMMITTED_ACTIVITY_AUDIT_FAILURE },
    });
  });

  it('records uninstall activity with lifecycle metadata', async () => {
    const audit = {
      record: jest.fn().mockResolvedValue('log-1'),
    } as unknown as AuditService;

    const id = await recordPhysicalDeviceLifecycleActivityAudit(audit, {
      lifecycleAction: 'UNINSTALL',
      actorUserId: 'actor-1',
      result: baseResult,
      changeSummary: 'vehicleId=v1',
    });

    expect(id).toBe('log-1');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: ActivityAction.UPDATE,
        entity: ActivityEntity.ADMIN_OPERATION,
        changeSummary: 'vehicleId=v1',
      }),
    );
  });
});
