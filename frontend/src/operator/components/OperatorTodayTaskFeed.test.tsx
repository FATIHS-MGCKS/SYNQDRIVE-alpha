import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ApiTask } from '../../lib/api';
import { buildBucketSlice } from '../hooks/operatorTodayFeed.utils';
import { OperatorTaskCard } from '../tasks/OperatorTaskCard';
import { OperatorTodayTaskFeed } from '../components/OperatorTodayTaskFeed';

function task(partial: Partial<ApiTask> & Pick<ApiTask, 'id' | 'title'>): ApiTask {
  return {
    organizationId: 'org-1',
    description: '',
    category: 'Custom',
    type: 'BOOKING_PREPARATION',
    status: 'OPEN',
    priority: partial.priority ?? 'NORMAL',
    source: null,
    sourceType: 'BOOKING',
    dedupKey: null,
    vehicleId: null,
    bookingId: 'booking-abc123',
    customerId: null,
    vendorId: null,
    alertId: null,
    documentId: null,
    fineId: null,
    invoiceId: null,
    serviceCaseId: null,
    assignedUserId: null,
    estimatedCostCents: null,
    actualCostCents: null,
    resolutionNote: null,
    blocksVehicleAvailability: false,
    metadata: null,
    isOverdue: partial.isOverdue ?? false,
    dueDate: partial.dueDate ?? null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    createdAt: '2026-07-13T00:00:00.000Z',
    updatedAt: '2026-07-13T00:00:00.000Z',
    bucket: partial.bucket,
    ...partial,
  };
}

const noop = vi.fn();

describe('OperatorTodayTaskFeed', () => {
  it('renders actionable buckets and hides empty sections', () => {
    const html = renderToStaticMarkup(
      <OperatorTodayTaskFeed
        buckets={{
          NOW: buildBucketSlice({
            bucket: 'NOW',
            tasks: [
              task({
                id: 'critical-1',
                title: 'Kritische Aufgabe mit sehr langem deutschen Titel zur Darstellung',
                priority: 'CRITICAL',
                bucket: 'NOW',
                isOverdue: true,
              }),
            ],
            loading: false,
            error: null,
            summary: null,
            previewLimit: 5,
          }),
          TODAY: buildBucketSlice({
            bucket: 'TODAY',
            tasks: [],
            loading: false,
            error: null,
            summary: null,
            previewLimit: 5,
          }),
          UPCOMING: buildBucketSlice({
            bucket: 'UPCOMING',
            tasks: [],
            loading: false,
            error: null,
            summary: null,
            previewLimit: 4,
          }),
          PLANNED: buildBucketSlice({
            bucket: 'PLANNED',
            tasks: [task({ id: 'planned-1', title: 'Geplante Erinnerung', bucket: 'PLANNED' })],
            loading: false,
            error: null,
            summary: null,
            previewLimit: 3,
          }),
        }}
        canViewUnassigned={false}
        vehicleById={new Map()}
        plannedOpen={false}
        onPlannedOpenChange={noop}
        onOpenTask={noop}
        onReload={noop}
        renderEntry={(entry) => (
          <OperatorTaskCard
            key={entry.task.id}
            task={entry.task}
            onOpen={noop}
          />
        )}
      />,
    );

    expect(html).toContain('Jetzt erforderlich');
    expect(html).toContain('Kritische Aufgabe mit sehr langem deutschen Titel zur Darstellung');
    expect(html).toContain('Geplant');
    expect(html).not.toContain('Heute fällig');
    expect(html).not.toContain('Demnächst');
  });

  it('renders only planned bucket when other buckets are empty', () => {
    const html = renderToStaticMarkup(
      <div className="dark">
        <OperatorTodayTaskFeed
          buckets={{
            PLANNED: buildBucketSlice({
              bucket: 'PLANNED',
              tasks: [
                task({ id: 'planned-1', title: 'Zukünftige Rechnung prüfen', bucket: 'PLANNED' }),
              ],
              loading: false,
              error: null,
              summary: null,
              previewLimit: 3,
            }),
          }}
          canViewUnassigned={false}
          vehicleById={new Map()}
          plannedOpen={true}
          onPlannedOpenChange={noop}
          onOpenTask={noop}
          onReload={noop}
          renderEntry={(entry) => (
            <OperatorTaskCard key={entry.task.id} task={entry.task} onOpen={noop} />
          )}
        />
      </div>,
    );

    expect(html).toContain('Geplant');
    expect(html).toContain('Zukünftige Rechnung prüfen');
    expect(html).not.toContain('Jetzt erforderlich');
  });

  it('renders team queue section for authorized users', () => {
    const html = renderToStaticMarkup(
      <OperatorTodayTaskFeed
        buckets={{
          UNASSIGNED: buildBucketSlice({
            bucket: 'UNASSIGNED',
            tasks: [task({ id: 'u1', title: 'Unzugewiesene Team-Aufgabe', bucket: 'UNASSIGNED' })],
            loading: false,
            error: null,
            summary: null,
            previewLimit: 4,
          }),
        }}
        canViewUnassigned
        vehicleById={new Map()}
        plannedOpen={false}
        onPlannedOpenChange={noop}
        onOpenTask={noop}
        onReload={noop}
        renderEntry={(entry) => (
          <OperatorTaskCard key={entry.task.id} task={entry.task} onOpen={noop} />
        )}
      />,
    );

    expect(html).toContain('Unzugewiesen');
    expect(html).toContain('Team-Queue');
    expect(html).toContain('Unzugewiesene Team-Aufgabe');
  });

  it('renders bucket error with retry in light markup', () => {
    const html = renderToStaticMarkup(
      <OperatorTodayTaskFeed
        buckets={{
          NOW: buildBucketSlice({
            bucket: 'NOW',
            tasks: [],
            loading: false,
            error: 'Netzwerkfehler',
            summary: null,
            previewLimit: 5,
          }),
        }}
        canViewUnassigned={false}
        vehicleById={new Map()}
        plannedOpen={false}
        onPlannedOpenChange={noop}
        onOpenTask={noop}
        onReload={noop}
        renderEntry={(entry) => (
          <OperatorTaskCard
            key={entry.task.id}
            task={entry.task}
            onOpen={noop}
          />
        )}
      />,
    );

    expect(html).toContain('Jetzt erforderlich nicht verfügbar');
    expect(html).toContain('Netzwerkfehler');
    expect(html).toContain('Erneut laden');
  });
});
