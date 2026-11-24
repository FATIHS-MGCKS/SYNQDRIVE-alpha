/**
 * V2A — registration and billing safety contracts (characterization only).
 * Documents current runtime rails without changing production behavior.
 */
import { POST_ACTIVATION_INITIALIZATION_PLAN } from '../post-commit/post-activation-initialization.plan';
import { buildRegistryActivateBillingIdempotencyKey } from '@modules/billing/registry-lifecycle/validate-vehicle-activated-registry-event';
import { buildQuantityIdempotencyKey } from '@modules/billing/domain/billing-quantity-ledger';
import { HighMobilityRegistrationService } from '@modules/high-mobility/high-mobility-registration.service';
import { VehiclesService } from '@modules/vehicles/vehicles.service';
import { ConflictException } from '@nestjs/common';

describe('V2A registration & billing safety characterization', () => {
  describe('A — Canonical DIMO rail (contract)', () => {
    it('documents VO5B-AB1 outbox billing idempotency key shape', () => {
      expect(buildRegistryActivateBillingIdempotencyKey('evt-abc')).toBe(
        'vehicle-registry:evt-abc:billing-activate:v1',
      );
    });

    it('documents registerFromDimo does not use legacy create billing hook (delegation only)', async () => {
      const billingQuantity = { onVehicleProvisioned: jest.fn() };
      const masterDimo = {
        register: jest.fn().mockResolvedValue({
          vehicle: { id: 'veh-canonical' },
          idempotentReplay: false,
        }),
        masterManualSpecsNeedLegacyTireTreadPass: jest.fn().mockReturnValue(false),
      };
      const stub = (): unknown => ({});
      const prisma = {
        vehicle: {
          findUniqueOrThrow: jest.fn().mockResolvedValue({
            id: 'veh-canonical',
            organizationId: 'org-a',
            dimoVehicleId: 'dimo-1',
          }),
        },
      };
      const service = new (VehiclesService as unknown as { new (...args: unknown[]): VehiclesService })(
        prisma,
        stub(),
        stub(),
        stub(),
        stub(),
        { upsertSetupAndMeasurement: jest.fn() } as never,
        stub(),
        { ensureDimoTelemetryAuthorization: jest.fn() } as never,
        stub(),
        stub(),
        stub(),
        stub(),
        stub(),
        { apiUrl: 'https://dimo.test' },
        stub(),
        { invalidate: jest.fn() } as never,
        masterDimo,
        billingQuantity,
      );

      await service.registerFromDimo('org-a', null, 'dimo-1');
      expect(masterDimo.register).toHaveBeenCalled();
      expect(billingQuantity.onVehicleProvisioned).not.toHaveBeenCalled();
    });

    it('POST_ACTIVATION_INITIALIZATION_PLAN classifies billing as outbox-consumer rail', () => {
      const billing = POST_ACTIVATION_INITIALIZATION_PLAN.find(
        (row) => row.effect === 'billingQuantity.onVehicleProvisioned',
      );
      expect(billing?.classification).toBe('POST_COMMIT_IDEMPOTENT');
      expect(billing?.notes).toMatch(/VEHICLE_ACTIVATED/i);
    });
  });

  describe('B — HM_ONLY rail', () => {
    it('creates vehicle in TX without calling billing integration', async () => {
      const txHandlers = {
        vehicle: {
          create: jest.fn().mockResolvedValue({ id: 'veh-hm', organizationId: 'org-hm' }),
        },
        vehicleDataSourceLink: { create: jest.fn().mockResolvedValue({}) },
        highMobilityVehicle: { update: jest.fn().mockResolvedValue({}) },
        highMobilityStatusHistory: { create: jest.fn().mockResolvedValue({}) },
        vehicleRegistryLifecycleOutbox: { create: jest.fn().mockResolvedValue({}) },
      };
      const prisma = {
        highMobilityVehicle: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'hm-1',
            vin: 'VINHM001',
            brand: 'Test',
            clearanceStatus: 'APPROVED',
            sourceMode: 'HM_ONLY',
            registrationState: 'PENDING',
            organizationId: 'org-hm',
          }),
        },
        organization: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE' }) },
        vehicle: { findFirst: jest.fn().mockResolvedValue(null) },
        $transaction: jest.fn(async (fn: (tx: typeof txHandlers) => Promise<unknown>) => fn(txHandlers)),
      };

      const service = new HighMobilityRegistrationService(prisma as never);
      const result = await service.registerHmOnlyVehicle(
        {
          hmVehicleId: 'hm-1',
          organizationId: 'org-hm',
          vehicleName: 'HM Test',
        },
        { tenantOrganizationId: 'org-hm', isMasterAdmin: false, actorUserId: null },
      );

      expect(result.synqdriveVehicleId).toBe('veh-hm');
      expect(txHandlers.vehicleRegistryLifecycleOutbox.create).not.toHaveBeenCalled();
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('rejects duplicate VIN within organization', async () => {
      const prisma = {
        highMobilityVehicle: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'hm-1',
            vin: 'DUPVIN',
            brand: 'Test',
            clearanceStatus: 'APPROVED',
            sourceMode: 'HM_ONLY',
            registrationState: 'PENDING',
            organizationId: 'org-hm',
          }),
        },
        organization: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE' }) },
        vehicle: { findFirst: jest.fn().mockResolvedValue({ id: 'existing' }) },
      };
      const service = new HighMobilityRegistrationService(prisma as never);
      await expect(
        service.registerHmOnlyVehicle(
          { hmVehicleId: 'hm-1', organizationId: 'org-hm' },
          { tenantOrganizationId: 'org-hm', isMasterAdmin: false, actorUserId: null },
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects cross-organization body for non-master admin', async () => {
      const prisma = {
        highMobilityVehicle: { findUnique: jest.fn() },
      };
      const service = new HighMobilityRegistrationService(prisma as never);
      await expect(
        service.registerHmOnlyVehicle(
          { hmVehicleId: 'hm-1', organizationId: 'org-other' },
          { tenantOrganizationId: 'org-hm', isMasterAdmin: false, actorUserId: null },
        ),
      ).rejects.toThrow(/organizationId does not match/);
    });
  });

  describe('C — Manual legacy create rail (retired V2B-PR4)', () => {
    it('rejects public manual create; harness path retains legacy billing hook for fixtures only', async () => {
      const billingQuantity = {
        onVehicleProvisioned: jest.fn().mockResolvedValue({ created: true }),
      };
      const stub = (): unknown => ({});
      const prisma = {
        vehicle: {
          create: jest.fn().mockResolvedValue({
            id: 'veh-manual',
            organizationId: 'org-man',
            vin: 'VINMAN001',
          }),
        },
      };
      const service = new (VehiclesService as unknown as { new (...args: unknown[]): VehiclesService })(
        prisma,
        stub(),
        stub(),
        stub(),
        stub(),
        stub(),
        stub(),
        stub(),
        stub(),
        stub(),
        stub(),
        stub(),
        stub(),
        stub(),
        stub(),
        stub(),
        stub(),
        billingQuantity,
      );

      await expect(
        service.create('org-man', { vin: 'VINMAN001', make: 'M', model: 'X', year: 2024 } as never, 'user-1'),
      ).rejects.toMatchObject({ response: { code: 'MANUAL_VEHICLE_REGISTRATION_RETIRED' } });

      await service.createVehicleRowForIntegrationHarness(
        'org-man',
        { vin: 'VINMAN001', make: 'M', model: 'X', year: 2024 } as never,
        'user-1',
      );
      expect(billingQuantity.onVehicleProvisioned).toHaveBeenCalledWith({
        organizationId: 'org-man',
        vehicleId: 'veh-manual',
        actorUserId: 'user-1',
      });

      const legacyKey = buildQuantityIdempotencyKey(['vehicle', 'connected', 'org-man', 'veh-manual']);
      const registryKey = buildRegistryActivateBillingIdempotencyKey('evt-x');
      expect(legacyKey).not.toBe(registryKey);
      expect(legacyKey).toBe('vehicle:connected:org-man:veh-manual');
    });
  });

  describe('Billing risk characterization (not reproduced E2E here)', () => {
    it('documents disjoint idempotency namespaces between legacy create and registry outbox rails', () => {
      const legacy = buildQuantityIdempotencyKey(['vehicle', 'connected', 'o', 'v']);
      const registry = buildRegistryActivateBillingIdempotencyKey('evt');
      expect(legacy).not.toEqual(registry);
    });
  });
});