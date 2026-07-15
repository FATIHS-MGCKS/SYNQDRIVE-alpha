import { TaskLinkedObjectResolverService } from './task-linked-object-resolver.service';
import { TaskLinkedObjectActionType } from './task-linked-object.types';

function makePrisma() {
  return {
    vehicle: { findMany: jest.fn().mockResolvedValue([]) },
    booking: { findMany: jest.fn().mockResolvedValue([]) },
    customer: { findMany: jest.fn().mockResolvedValue([]) },
    orgInvoice: { findMany: jest.fn().mockResolvedValue([]) },
    vehicleDocumentExtraction: { findMany: jest.fn().mockResolvedValue([]) },
    dashboardInsight: { findMany: jest.fn().mockResolvedValue([]) },
    serviceCase: { findMany: jest.fn().mockResolvedValue([]) },
    fine: { findMany: jest.fn().mockResolvedValue([]) },
    vendor: { findMany: jest.fn().mockResolvedValue([]) },
  };
}

describe('TaskLinkedObjectResolverService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let svc: TaskLinkedObjectResolverService;

  beforeEach(() => {
    prisma = makePrisma();
    svc = new TaskLinkedObjectResolverService(prisma as any);
  });

  it('returns an empty array when the task has no links', async () => {
    await expect(svc.resolveForTask('org1', {})).resolves.toEqual([]);
    expect(prisma.vehicle.findMany).not.toHaveBeenCalled();
  });

  it('resolves a vehicle with plate, make/model and station', async () => {
    prisma.vehicle.findMany.mockResolvedValue([
      {
        id: 'veh-1',
        licensePlate: 'B-SY 100',
        make: 'BMW',
        model: '320d',
        vehicleName: null,
        status: 'AVAILABLE',
        homeStation: { name: 'Berlin Mitte' },
      },
    ]);

    const [vehicle] = await svc.resolveForTask('org1', { vehicleId: 'veh-1' });

    expect(prisma.vehicle.findMany).toHaveBeenCalledWith({
      where: { organizationId: 'org1', id: { in: ['veh-1'] } },
      select: expect.any(Object),
    });
    expect(vehicle).toMatchObject({
      type: 'VEHICLE',
      id: 'veh-1',
      primaryLabel: 'B-SY 100',
      secondaryLabel: 'BMW 320d · Berlin Mitte',
      iconKey: 'vehicle',
      isAvailable: true,
      action: { type: TaskLinkedObjectActionType.OPEN_VEHICLE, vehicleId: 'veh-1' },
    });
  });

  it('resolves a booking with friendly booking number', async () => {
    prisma.booking.findMany.mockResolvedValue([
      {
        id: 'booking-abc123',
        status: 'CONFIRMED',
        startDate: new Date('2026-08-01T10:00:00Z'),
        endDate: new Date('2026-08-05T18:00:00Z'),
        vehicle: { licensePlate: 'M-XY 9' },
        customer: { firstName: 'Max', lastName: 'Mustermann', company: null },
      },
    ]);

    const [booking] = await svc.resolveForTask('org1', { bookingId: 'booking-abc123' });

    expect(booking.primaryLabel).toBe('BK-ABC123');
    expect(booking.secondaryLabel).toContain('Max Mustermann');
    expect(booking.statusLabel).toBe('Bestätigt');
    expect(booking.action).toEqual({
      type: TaskLinkedObjectActionType.OPEN_BOOKING,
      bookingId: 'booking-abc123',
    });
  });

  it('resolves customer, invoice, document, alert, service case, fine and vendor', async () => {
    prisma.customer.findMany.mockResolvedValue([
      { id: 'cust-1', firstName: 'Anna', lastName: 'Schmidt', company: null, email: 'anna@example.com', phone: null },
    ]);
    prisma.orgInvoice.findMany.mockResolvedValue([
      {
        id: 'inv-1',
        title: 'Schlussrechnung',
        status: 'ISSUED',
        totalCents: 12500,
        currency: 'EUR',
        invoiceNumberDisplay: '2026-0042',
        legacyInvoiceNumber: null,
        invoiceNumber: null,
        sequenceYear: null,
        sequenceNumber: null,
      },
    ]);
    prisma.vehicleDocumentExtraction.findMany.mockResolvedValue([
      {
        id: 'doc-1',
        effectiveDocumentType: 'TUV_REPORT',
        documentType: 'TUV_REPORT',
        status: 'COMPLETED',
        sourceFileName: 'tuv.pdf',
      },
    ]);
    prisma.dashboardInsight.findMany.mockResolvedValue([
      { id: 'alert-1', title: 'Service überfällig', isActive: true, severity: 'WARNING', type: 'SERVICE_OVERDUE' },
    ]);
    prisma.serviceCase.findMany.mockResolvedValue([
      { id: 'case-1', title: 'TÜV nachholen', category: 'TUV_HU', status: 'OPEN' },
    ]);
    prisma.fine.findMany.mockResolvedValue([
      {
        id: 'fine-1',
        title: 'Parkverstoß',
        fineNumber: 'PV-2026-01',
        status: 'NEW',
        amountCents: 5500,
        currency: 'EUR',
      },
    ]);
    prisma.vendor.findMany.mockResolvedValue([
      { id: 'vendor-1', name: 'Werkstatt Nord', category: 'WORKSHOP', isActive: true, city: 'Hamburg' },
    ]);

    const linked = await svc.resolveForTask('org1', {
      customerId: 'cust-1',
      invoiceId: 'inv-1',
      documentId: 'doc-1',
      alertId: 'alert-1',
      serviceCaseId: 'case-1',
      fineId: 'fine-1',
      vendorId: 'vendor-1',
    });

    expect(linked.map((o) => o.type)).toEqual([
      'CUSTOMER',
      'SERVICE_CASE',
      'INVOICE',
      'DOCUMENT',
      'FINE',
      'VENDOR',
      'ALERT',
    ]);
    expect(linked.find((o) => o.type === 'CUSTOMER')).toMatchObject({
      primaryLabel: 'Anna Schmidt',
      secondaryLabel: 'anna@example.com',
    });
    expect(linked.find((o) => o.type === 'INVOICE')).toMatchObject({
      primaryLabel: '2026-0042',
      statusLabel: 'Ausgestellt',
    });
    expect(linked.find((o) => o.type === 'DOCUMENT')).toMatchObject({
      primaryLabel: 'TÜV/HU',
      secondaryLabel: 'tuv.pdf',
    });
    expect(linked.find((o) => o.type === 'SERVICE_CASE')).toMatchObject({
      primaryLabel: 'TÜV nachholen',
      secondaryLabel: 'TÜV/HU',
    });
  });

  it('marks missing tenant entities as unavailable without throwing', async () => {
    prisma.vehicle.findMany.mockResolvedValue([]);

    const [vehicle] = await svc.resolveForTask('org1', { vehicleId: 'veh-missing' });

    expect(vehicle.isAvailable).toBe(false);
    expect(vehicle.primaryLabel).toBe('Fahrzeug nicht verfügbar');
    expect(vehicle.unavailableReason).toContain('nicht mehr zugänglich');
    expect(vehicle.action).toEqual({
      type: TaskLinkedObjectActionType.OPEN_VEHICLE,
      vehicleId: 'veh-missing',
    });
  });

  it('scopes document lookups to the organization', async () => {
    await svc.resolveForTask('org1', { documentId: 'doc-1' });

    expect(prisma.vehicleDocumentExtraction.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['doc-1'] }, organizationId: 'org1' },
      select: expect.any(Object),
    });
  });

  it('batches all entity lookups in parallel without N+1 per type', async () => {
    await svc.resolveForTask('org1', {
      vehicleId: 'veh-1',
      bookingId: 'book-1',
      customerId: 'cust-1',
      invoiceId: 'inv-1',
      documentId: 'doc-1',
      alertId: 'alert-1',
      serviceCaseId: 'case-1',
      fineId: 'fine-1',
      vendorId: 'vendor-1',
    });

    expect(prisma.vehicle.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.booking.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.customer.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.orgInvoice.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.vehicleDocumentExtraction.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.dashboardInsight.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.serviceCase.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.fine.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.vendor.findMany).toHaveBeenCalledTimes(1);
  });
});
