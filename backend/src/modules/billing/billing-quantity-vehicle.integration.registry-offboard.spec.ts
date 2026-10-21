import { BillingQuantityVehicleIntegration } from './billing-quantity-vehicle.integration';

describe('BillingQuantityVehicleIntegration registry offboard boundary', () => {
  it('onVehicleRemoved skips decrement when post-offboard billable probe is empty', async () => {
    const quantity = {
      resolveBaseSubscriptionItem: jest.fn().mockResolvedValue({
        id: 'item-1',
        subscriptionId: 'sub-1',
      }),
      recordVehicleLicenseRemoved: jest.fn(),
    };
    const billableVehicles = {
      getBillableConnectedVehiclesForOrganization: jest.fn().mockResolvedValue({
        billableVehicles: [],
        excludedVehicles: [],
        billableVehicleCount: 0,
        connectedVehicleCount: 0,
      }),
    };
    const registryOffboardProjection = {
      onVehicleOffboardedLifecycleEvent: jest.fn(),
    };

    const integration = new BillingQuantityVehicleIntegration(
      quantity as any,
      billableVehicles as any,
      registryOffboardProjection as any,
    );

    const result = await integration.onVehicleRemoved({
      organizationId: 'org-1',
      vehicleId: 'veh-offboarded',
    });

    expect(result).toBeNull();
    expect(quantity.recordVehicleLicenseRemoved).not.toHaveBeenCalled();
  });
});
