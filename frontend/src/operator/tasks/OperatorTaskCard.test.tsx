import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { OperatorTaskCard } from './OperatorTaskCard';
import type { ApiTask } from '../../lib/api';

function task(partial: Partial<ApiTask> & Pick<ApiTask, 'id' | 'title' | 'type'>): ApiTask {
  return {
    organizationId: 'org-1',
    description: '',
    category: 'Custom',
    status: 'OPEN',
    priority: 'NORMAL',
    source: null,
    sourceType: 'MANUAL',
    dedupKey: null,
    vehicleId: 'vehicle-1',
    bookingId: 'booking-abc123',
    customerId: null,
    vendorId: null,
    alertId: null,
    documentId: null,
    fineId: null,
    invoiceId: null,
    serviceCaseId: null,
    assignedUserId: 'user-1',
    assignedUserName: 'Alex Operator',
    estimatedCostCents: null,
    actualCostCents: null,
    resolutionNote: null,
    blocksVehicleAvailability: false,
    metadata: null,
    isOverdue: false,
    dueDate: '2026-07-15T14:00:00.000Z',
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    createdAt: '2026-07-13T00:00:00.000Z',
    updatedAt: '2026-07-13T00:00:00.000Z',
    linkedObjects: [
      {
        type: 'VEHICLE',
        id: 'vehicle-1',
        primaryLabel: 'M-AB 1234',
        iconKey: 'vehicle',
        action: { type: 'OPEN_VEHICLE', vehicleId: 'vehicle-1' },
        isAvailable: true,
      },
      {
        type: 'BOOKING',
        id: 'booking-abc123',
        primaryLabel: 'BK-ABC123',
        iconKey: 'booking',
        action: { type: 'OPEN_BOOKING', bookingId: 'booking-abc123' },
        isAvailable: true,
      },
    ],
    ...partial,
  };
}

describe('OperatorTaskCard', () => {
  it('renders operative core fields and one primary action for mobile', () => {
    const html = renderToStaticMarkup(
      <OperatorTaskCard
        task={task({ id: '1', title: 'Reifen prüfen mit langem deutschen Aufgabentitel', type: 'TIRE_CHECK' })}
        onOpen={vi.fn()}
        onAction={vi.fn()}
      />,
    );

    expect(html).toContain('Reifen prüfen mit langem deutschen Aufgabentitel');
    expect(html).toContain('M-AB 1234 · BK-ABC123');
    expect(html).toContain('Verantwortlich:');
    expect(html).toContain('Alex Operator');
    expect(html).toContain('Starten');
    expect(html).toContain('min-h-[48px]');
    expect(html).not.toContain('NORMAL');
  });

  it('renders inline API error feedback from action handler', async () => {
    const html = renderToStaticMarkup(
      <OperatorTaskCard
        task={task({ id: '2', title: 'Wartend', type: 'TIRE_CHECK', status: 'WAITING' })}
        onOpen={vi.fn()}
        onAction={vi.fn()}
      />,
    );

    expect(html).toContain('Fortsetzen');
    expect(html).toContain('min-h-[44px]');
  });

  it('renders no action rail for terminal auto-resolved tasks', () => {
    const html = renderToStaticMarkup(
      <OperatorTaskCard
        task={task({
          id: '3',
          title: 'Automatisch erledigt',
          type: 'INVOICE_REQUIRED',
          status: 'DONE',
          completionMode: 'AUTO_RESOLVED',
        })}
        onOpen={vi.fn()}
      />,
    );

    expect(html).toContain('Automatisch erledigt');
    expect(html).not.toContain('Erledigen');
    expect(html).not.toContain('Kommentar');
  });
});
