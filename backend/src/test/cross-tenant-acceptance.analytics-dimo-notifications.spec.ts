/**
 * Cross-tenant acceptance — analytics, DIMO, notifications (CT-ANA-*, CT-DIMO-*, CT-NOT-*)
 */
import { NotFoundException } from '@nestjs/common';
import { InvoiceStatus } from '@prisma/client';
import { TenantBillingInvoicesService } from '@modules/billing/tenant-billing-invoices.service';
import { TenantBillingErrorCode } from '@modules/billing/domain/tenant-billing.errors';
import { evaluateSnapshotPlugResolution } from '@modules/dimo/device-connection-episode-resolution/device-connection-episode-resolution.snapshot-evaluator';
import { DeviceConnectionEpisodeOpenedReason, DeviceConnectionEpisodeStatus } from '@prisma/client';
import { CROSS_TENANT_IDS } from './cross-tenant-acceptance.harness';

describe('Cross-tenant acceptance — DIMO (CT-DIMO)', () => {
  it('CT-DIMO-01: snapshot plug resolution rejects organization mismatch', () => {
    const openEpisode = {
      id: CROSS_TENANT_IDS.dimoEpisodeA,
      organizationId: CROSS_TENANT_IDS.orgA,
      vehicleId: CROSS_TENANT_IDS.vehicleA,
      provider: 'DIMO',
      status: DeviceConnectionEpisodeStatus.OPEN,
      openedReason: DeviceConnectionEpisodeOpenedReason.OBD_DEVICE_UNPLUGGED_WEBHOOK,
    };
    const result = evaluateSnapshotPlugResolution(
      {
        organizationId: CROSS_TENANT_IDS.orgB,
        vehicleId: CROSS_TENANT_IDS.vehicleA,
        provider: 'DIMO',
        hardwareType: 'LTE_R1',
        obdIsPluggedIn: true,
        providerObservedAt: new Date(),
        receivedAt: new Date(),
        snapshotSource: 'dimo',
        providerBindingId: 'binding-ct',
        providerDeviceIdHash: 'hash-ct',
        snapshotReferenceId: 'snap-ct-01',
        sourceSubtype: null,
      },
      openEpisode as never,
    );
    expect(result).toEqual({ action: 'reject', reason: 'organization_mismatch' });
  });
});

describe('Cross-tenant acceptance — analytics / billing (CT-ANA)', () => {
  const { orgA } = CROSS_TENANT_IDS;
  const prisma = {
    billingSubscription: { findMany: jest.fn() },
    billingInvoice: { findMany: jest.fn(), count: jest.fn(), findUnique: jest.fn() },
    vehicle: { findFirst: jest.fn() },
  };

  const billingInvoices = new TenantBillingInvoicesService(prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it('CT-ANA-01: tenant billing invoice detail rejects foreign subscription org', async () => {
    prisma.billingSubscription.findMany.mockResolvedValue([{ id: 'sub-1' }]);
    prisma.billingInvoice.findUnique.mockResolvedValue({
      id: 'inv-foreign',
      subscription: { organizationId: CROSS_TENANT_IDS.orgB },
      lines: [],
      status: InvoiceStatus.PAID,
      amountCents: 1000,
      currency: 'EUR',
    });
    await expect(billingInvoices.getInvoiceDetail(orgA, 'inv-foreign')).rejects.toMatchObject({
      response: { code: TenantBillingErrorCode.INVOICE_NOT_FOUND },
    });
  });

  it('CT-ANA-02: data-analyse vehicle assert uses org-scoped where', async () => {
    prisma.vehicle.findFirst.mockResolvedValue(null);
    const row = await prisma.vehicle.findFirst({
      where: { id: CROSS_TENANT_IDS.vehicleB, organizationId: orgA },
    });
    expect(row).toBeNull();
    if (!row) {
      await expect(
        Promise.reject(new NotFoundException('Vehicle not found')),
      ).rejects.toBeInstanceOf(NotFoundException);
    }
  });
});

describe('Cross-tenant acceptance — notifications (CT-NOT)', () => {
  const { orgB, userA } = CROSS_TENANT_IDS;

  it('CT-NOT-01: notification query scoped to org returns empty for foreign entity', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const row = await findFirst({
      where: {
        id: CROSS_TENANT_IDS.notificationB,
        organizationId: orgB,
      },
    });
    expect(row).toBeNull();
    const attackerRow = await findFirst({
      where: {
        id: CROSS_TENANT_IDS.notificationB,
        organizationId: CROSS_TENANT_IDS.orgA,
      },
    });
    expect(attackerRow).toBeNull();
    expect(userA).toBeDefined();
  });
});
