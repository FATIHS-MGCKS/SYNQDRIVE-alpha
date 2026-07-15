import { describe, expect, it } from 'vitest';
import {
  buildManualTaskCreatePayload,
  createChecklistDraft,
  EMPTY_MANUAL_TASK_FORM,
  parseEstimatedDurationMinutes,
  validateManualTaskForm,
} from './task-create-form.utils';

describe('task-create-form.utils', () => {
  it('maps all visible form fields into the API payload', () => {
    const payload = buildManualTaskCreatePayload(
      {
        ...EMPTY_MANUAL_TASK_FORM,
        title: ' HU fällig ',
        description: 'Prüfung',
        type: 'VEHICLE_INSPECTION',
        priority: 'High',
        assignedUserId: 'user-1',
        activatesAt: '2026-07-20T08:00',
        dueDate: '2026-07-25T17:00',
        estimatedDurationMinutes: '120',
        initialNote: 'Vorabinfo',
        vehicleId: 'veh-1',
        bookingId: 'book-1',
        customerId: 'cust-1',
        invoiceId: 'inv-1',
        documentId: 'doc-1',
        vendorId: 'ven-1',
        serviceCaseId: 'sc-1',
        stationId: 'station-1',
        blocksVehicleAvailability: true,
      },
      [
        createChecklistDraft('TÜV-Termin', true),
        createChecklistDraft('Dokumente', false),
      ],
    );

    expect(payload).toMatchObject({
      title: 'HU fällig',
      description: 'Prüfung',
      type: 'VEHICLE_INSPECTION',
      priority: 'HIGH',
      assignedUserId: 'user-1',
      estimatedDurationMinutes: 120,
      initialNote: 'Vorabinfo',
      vehicleId: 'veh-1',
      bookingId: 'book-1',
      customerId: 'cust-1',
      invoiceId: 'inv-1',
      documentId: 'doc-1',
      vendorId: 'ven-1',
      serviceCaseId: 'sc-1',
      stationId: 'station-1',
      blocksVehicleAvailability: true,
      source: 'MANUAL',
    });
    expect(payload.checklist).toEqual([
      { title: 'TÜV-Termin', sortOrder: 0, isRequired: true },
      { title: 'Dokumente', sortOrder: 1, isRequired: false },
    ]);
    expect(payload.activatesAt).toBeTruthy();
    expect(payload.dueDate).toBeTruthy();
  });

  it('validates title, timing and checklist titles', () => {
    expect(validateManualTaskForm(EMPTY_MANUAL_TASK_FORM)).toEqual({
      title: 'Titel ist erforderlich',
    });

    const timingErrors = validateManualTaskForm({
      ...EMPTY_MANUAL_TASK_FORM,
      title: 'Task',
      activatesAt: '2026-08-10T10:00',
      dueDate: '2026-08-01T10:00',
    });
    expect(timingErrors.dueDate).toContain('Aktivierung');

    const checklistErrors = validateManualTaskForm(
      { ...EMPTY_MANUAL_TASK_FORM, title: 'Task' },
      { checklistItems: [createChecklistDraft('   ')] },
    );
    expect(checklistErrors.checklist).toBeTruthy();
  });

  it('parses positive duration minutes only', () => {
    expect(parseEstimatedDurationMinutes('120')).toBe(120);
    expect(parseEstimatedDurationMinutes('0')).toBeUndefined();
    expect(parseEstimatedDurationMinutes('abc')).toBeUndefined();
  });
});
