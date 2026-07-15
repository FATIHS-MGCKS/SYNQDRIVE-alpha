import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TaskLinkedObject } from './types';
import {
  isOperatorLinkedObjectActionSupported,
  navigateTaskLinkedObject,
} from './taskLinkedObjectNavigation';
import type { TaskDetailLinkedObjectModel } from './taskDetailView.utils';

function linkedObject(
  partial: Partial<TaskLinkedObject> & Pick<TaskLinkedObject, 'type' | 'id' | 'primaryLabel' | 'action'>,
): TaskDetailLinkedObjectModel {
  return {
    type: partial.type,
    id: partial.id,
    typeLabel: partial.type,
    primaryLabel: partial.primaryLabel,
    secondaryLabel: partial.secondaryLabel ?? null,
    statusLabel: partial.statusLabel ?? null,
    isAvailable: partial.isAvailable ?? true,
    unavailableReason: partial.unavailableReason ?? null,
    raw: {
      iconKey: partial.type.toLowerCase(),
      ...partial,
      isAvailable: partial.isAvailable ?? true,
    } as TaskLinkedObject,
  };
}

describe('navigateTaskLinkedObject', () => {
  const rentalHandlers = {
    surface: 'rental' as const,
    openVehicle: vi.fn(),
    openBooking: vi.fn(),
    openCustomer: vi.fn(),
    openInvoice: vi.fn(),
    openDocument: vi.fn(),
    openAlert: vi.fn(),
    openServiceCase: vi.fn(),
    openFine: vi.fn(),
    openVendor: vi.fn(),
    onBlocked: vi.fn(),
  };

  const operatorHandlers = {
    surface: 'operator' as const,
    openVehicle: vi.fn(),
    openBooking: vi.fn(),
    onBlocked: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const cases: Array<{
    type: TaskLinkedObject['type'];
    action: TaskLinkedObject['action'];
    handler: keyof typeof rentalHandlers;
  }> = [
    { type: 'VEHICLE', action: { type: 'OPEN_VEHICLE', vehicleId: 'veh-1' }, handler: 'openVehicle' },
    { type: 'BOOKING', action: { type: 'OPEN_BOOKING', bookingId: 'book-1' }, handler: 'openBooking' },
    { type: 'CUSTOMER', action: { type: 'OPEN_CUSTOMER', customerId: 'cust-1' }, handler: 'openCustomer' },
    { type: 'INVOICE', action: { type: 'OPEN_INVOICE', invoiceId: 'inv-1' }, handler: 'openInvoice' },
    { type: 'DOCUMENT', action: { type: 'OPEN_DOCUMENT', documentId: 'doc-1' }, handler: 'openDocument' },
    { type: 'ALERT', action: { type: 'OPEN_ALERT', alertId: 'alert-1' }, handler: 'openAlert' },
    {
      type: 'SERVICE_CASE',
      action: { type: 'OPEN_SERVICE_CASE', serviceCaseId: 'case-1' },
      handler: 'openServiceCase',
    },
    { type: 'FINE', action: { type: 'OPEN_FINE', fineId: 'fine-1' }, handler: 'openFine' },
    { type: 'VENDOR', action: { type: 'OPEN_VENDOR', vendorId: 'vendor-1' }, handler: 'openVendor' },
  ];

  it.each(cases)('routes rental $type linked objects through SynqDrive navigation', ({ type, action, handler }) => {
    const object = linkedObject({
      type,
      id: 'entity-1',
      primaryLabel: 'Lesbarer Titel ohne UUID',
      action,
    });

    const result = navigateTaskLinkedObject(object, rentalHandlers, { taskVehicleId: 'veh-context' });

    expect(result.navigated).toBe(true);
    expect(rentalHandlers[handler]).toHaveBeenCalledTimes(1);
  });

  it('shows unavailable status for missing linked objects without navigation', () => {
    const object = linkedObject({
      type: 'BOOKING',
      id: 'missing-booking',
      primaryLabel: 'Buchung nicht verfügbar',
      isAvailable: false,
      unavailableReason: 'Das verknüpfte Objekt wurde gelöscht oder ist in dieser Organisation nicht mehr zugänglich.',
      action: { type: 'OPEN_BOOKING', bookingId: 'missing-booking' },
    });

    const result = navigateTaskLinkedObject(object, rentalHandlers);

    expect(result.navigated).toBe(false);
    expect(rentalHandlers.openBooking).not.toHaveBeenCalled();
    expect(rentalHandlers.onBlocked).toHaveBeenCalledWith(object.unavailableReason);
  });

  it('blocks operator navigation to desktop-only entities', () => {
    const object = linkedObject({
      type: 'INVOICE',
      id: 'inv-1',
      primaryLabel: 'FSM-2026-0001',
      action: { type: 'OPEN_INVOICE', invoiceId: 'inv-1' },
    });

    const result = navigateTaskLinkedObject(object, operatorHandlers);

    expect(result.navigated).toBe(false);
    expect(operatorHandlers.onBlocked).toHaveBeenCalled();
    expect(isOperatorLinkedObjectActionSupported('OPEN_INVOICE')).toBe(false);
  });

  it('allows operator vehicle and booking navigation only', () => {
    expect(isOperatorLinkedObjectActionSupported('OPEN_VEHICLE')).toBe(true);
    expect(isOperatorLinkedObjectActionSupported('OPEN_BOOKING')).toBe(true);
    expect(isOperatorLinkedObjectActionSupported('OPEN_CUSTOMER')).toBe(false);
  });

  it('reports missing rental permission handlers clearly', () => {
    const object = linkedObject({
      type: 'CUSTOMER',
      id: 'cust-1',
      primaryLabel: 'Erika Beispiel',
      action: { type: 'OPEN_CUSTOMER', customerId: 'cust-1' },
    });

    const result = navigateTaskLinkedObject(object, {
      surface: 'rental',
      onBlocked: rentalHandlers.onBlocked,
    });

    expect(result.navigated).toBe(false);
    expect(result.message).toContain('Kundennavigation');
    expect(rentalHandlers.onBlocked).toHaveBeenCalled();
  });
});
