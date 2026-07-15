/**
 * Task Domain V2 — Manual task creation form (areas 7 + 8)
 */
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  createChecklistDraft,
  EMPTY_MANUAL_TASK_FORM,
} from '../../lib/task-create-form.utils';
import { ManualTaskCreateForm } from './ManualTaskCreateForm';

const noop = vi.fn();

describe('ManualTaskCreateForm', () => {
  it('renders all core fields with accessible labels', () => {
    const html = renderToStaticMarkup(
      <ManualTaskCreateForm
        form={{
          ...EMPTY_MANUAL_TASK_FORM,
          title: 'HU fällig',
          description: 'Prüfung',
          estimatedDurationMinutes: '90',
          initialNote: 'Vorabinfo',
        }}
        errors={{}}
        checklistItems={[createChecklistDraft('TÜV-Termin', true)]}
        onFormChange={noop}
        onChecklistChange={noop}
        vehicleOptions={[{ value: 'veh-1', label: 'M-AB 1234' }]}
        assigneeOptions={[{ value: 'u1', label: 'Alex Operator' }]}
        stationOptions={[{ value: 'st-1', label: 'Berlin' }]}
        bookingOptions={[{ value: 'b1', label: 'BK-1001' }]}
        customerOptions={[{ value: 'c1', label: 'Anna Schmidt' }]}
        invoiceOptions={[{ value: 'i1', label: '2026-0042' }]}
        vendorOptions={[{ value: 'v1', label: 'Werkstatt Nord' }]}
        serviceCaseOptions={[{ value: 'sc1', label: 'TÜV nachholen' }]}
      />,
    );

    expect(html).toContain('data-testid="manual-task-create-form"');
    expect(html).toContain('Titel *');
    expect(html).toContain('Beschreibung');
    expect(html).toContain('Geschätzte Dauer');
    expect(html).toContain('Erste Notiz');
    expect(html).toContain('HU fällig');
    expect(html).toContain('Vorabinfo');
    expect(html).toContain('Checkliste');
    expect(html).toContain('Verknüpfungen');
  });

  it('shows field errors and supports locked vehicle context', () => {
    const html = renderToStaticMarkup(
      <ManualTaskCreateForm
        form={EMPTY_MANUAL_TASK_FORM}
        errors={{ title: 'Titel ist erforderlich', dueDate: 'Fälligkeit ungültig' }}
        checklistItems={[]}
        onFormChange={noop}
        onChecklistChange={noop}
        vehicleOptions={[]}
        assigneeOptions={[]}
        stationOptions={[]}
        bookingOptions={[]}
        customerOptions={[]}
        invoiceOptions={[]}
        vendorOptions={[]}
        serviceCaseOptions={[]}
        lockedVehicleId="veh-locked"
        showVehicleField={false}
      />,
    );

    expect(html).toContain('Titel ist erforderlich');
    expect(html).toContain('Fälligkeit ungültig');
    expect(html).not.toContain('name="vehicleId"');
    expect(html).not.toContain('>Fahrzeug</label>');
  });
});
