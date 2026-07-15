import { describe, expect, it } from 'vitest';
import type { ApiTask } from '../../lib/api';
import {
  buildOperatorTaskDisplayModel,
  dedupeDisplayLabels,
  splitDisplaySubpoints,
} from './operatorTaskDisplay.utils';

function task(partial: Partial<ApiTask> & Pick<ApiTask, 'id' | 'title' | 'type'>): ApiTask {
  return {
    organizationId: 'org',
    description: '',
    category: 'Booking',
    status: 'OPEN',
    priority: 'NORMAL',
    source: null,
    sourceType: 'BOOKING',
    dedupKey: null,
    vehicleId: null,
    bookingId: null,
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
    isOverdue: false,
    dueDate: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    createdAt: '2026-07-13T00:00:00.000Z',
    updatedAt: '2026-07-13T00:00:00.000Z',
    ...partial,
  };
}

describe('operatorTaskDisplay.utils', () => {
  it('shows concrete missing document names with overflow', () => {
    const model = buildOperatorTaskDisplayModel(
      task({
        id: 'doc-1',
        title: 'Buchungsdokumente prüfen',
        type: 'DOCUMENT_REVIEW',
        bookingId: 'booking-abc123',
        dedupKey: 'document:package:CONFIRMED:booking-abc123',
        metadata: {
          documentPackage: {
            phase: 'CONFIRMED',
            missingDocuments: [
              { documentType: 'RENTAL_CONTRACT', humanReadableLabel: 'Mietvertrag' },
              { documentType: 'INVOICE', humanReadableLabel: 'Rechnung' },
              { documentType: 'DEPOSIT_RECEIPT', humanReadableLabel: 'Kautionsbeleg' },
              { documentType: 'TERMS', humanReadableLabel: 'Allgemeine Geschäftsbedingungen (AGB)' },
            ],
          },
        },
      }),
    );

    expect(model.subpoints).toEqual(['Mietvertrag', 'Rechnung', 'Kautionsbeleg']);
    expect(model.overflowCount).toBe(1);
    expect(model.bookingLine).toBe('BK-ABC123');
  });

  it('shows open booking preparation checklist items', () => {
    const model = buildOperatorTaskDisplayModel(
      task({
        id: 'prep-1',
        title: 'Buchung vorbereiten',
        type: 'BOOKING_PREPARATION',
        bookingId: 'booking-abc123',
        dedupKey: 'booking:prep:booking-abc123',
        checklist: [
          {
            id: 'c1',
            title: 'Pflichtdokumente vollständig',
            description: '',
            sortOrder: 0,
            isDone: false,
            isRequired: true,
            completedAt: null,
            completedByUserId: null,
          },
          {
            id: 'c2',
            title: 'Reinigung bestätigt',
            description: '',
            sortOrder: 1,
            isDone: true,
            isRequired: true,
            completedAt: '2026-07-13T00:00:00.000Z',
            completedByUserId: null,
          },
          {
            id: 'c3',
            title: 'Tank- oder Ladestand geprüft',
            description: '',
            sortOrder: 2,
            isDone: false,
            isRequired: true,
            completedAt: null,
            completedByUserId: null,
          },
        ],
      }),
    );

    expect(model.subpoints).toEqual(['Pflichtdokumente vollständig', 'Tank- oder Ladestand geprüft']);
    expect(model.overflowCount).toBe(0);
  });

  it('prefers linked object labels over derived booking and fleet fallbacks', () => {
    const model = buildOperatorTaskDisplayModel(
      task({
        id: 'linked-1',
        title: 'Buchung vorbereiten',
        type: 'BOOKING_PREPARATION',
        bookingId: 'booking-abc123',
        vehicleId: 'vehicle-1',
        linkedObjects: [
          { type: 'BOOKING', id: 'booking-abc123', primaryLabel: 'BK-ABC123' },
          { type: 'VEHICLE', id: 'vehicle-1', primaryLabel: 'B-SY 100' },
        ],
      }),
      {
        vehicleById: new Map([['vehicle-1', { license: 'OLD-PLATE', make: 'VW', model: 'Golf' }]]),
      },
    );

    expect(model.bookingLine).toBe('BK-ABC123');
    expect(model.vehicleLine).toBe('B-SY 100');
  });

  it('uses fleet plate when linked vehicle is unavailable', () => {
    const vehicleById = new Map([
      ['vehicle-1', { license: 'M-AB 1234', make: 'BMW', model: 'X1' }],
    ]);

    const model = buildOperatorTaskDisplayModel(
      task({
        id: 'vehicle-1',
        title: 'Reifen prüfen',
        type: 'TIRE_CHECK',
        vehicleId: 'vehicle-1',
      }),
      { vehicleById },
    );

    expect(model.vehicleLine).toBe('M-AB 1234');
  });

  it('falls back to make and model when vehicle has no license plate', () => {
    const vehicleById = new Map([
      ['vehicle-1', { license: '', make: 'VW', model: 'Golf' }],
    ]);

    const model = buildOperatorTaskDisplayModel(
      task({
        id: 'vehicle-2',
        title: 'Reifen prüfen',
        type: 'TIRE_CHECK',
        vehicleId: 'vehicle-1',
      }),
      { vehicleById },
    );

    expect(model.vehicleLine).toBe('VW Golf');
  });

  it('omits vehicle line when linked object and fleet lookup are unavailable', () => {
    const model = buildOperatorTaskDisplayModel(
      task({
        id: 'vehicle-3',
        title: 'Reifen prüfen',
        type: 'TIRE_CHECK',
        vehicleId: 'missing-vehicle',
      }),
    );

    expect(model.vehicleLine).toBeNull();
    expect(model.bookingLine).toBeNull();
  });

  it('deduplicates identical labels case-insensitively', () => {
    expect(dedupeDisplayLabels(['Dokumente', 'dokumente', ' Dokumente '])).toEqual(['Dokumente']);
    expect(
      splitDisplaySubpoints(['Mietvertrag', 'Mietvertrag', 'Rechnung', 'Rechnung', 'AGB', 'Kaution']),
    ).toEqual({
      subpoints: ['Mietvertrag', 'Rechnung', 'AGB'],
      overflowCount: 1,
    });
  });

  it('keeps long titles on the task while subpoints stay capped', () => {
    const longTitle =
      'Buchungsdokumente für Sonderfall mit sehr langem Titel und zusätzlichen Hinweisen zur Nachreichung prüfen';

    const model = buildOperatorTaskDisplayModel(
      task({
        id: 'long-1',
        title: longTitle,
        type: 'DOCUMENT_REVIEW',
        bookingId: 'booking-abc123',
        metadata: {
          documentPackage: {
            missingDocuments: [
              { humanReadableLabel: 'Mietvertrag' },
              { humanReadableLabel: 'Rechnung' },
              { humanReadableLabel: 'Kautionsbeleg' },
              { humanReadableLabel: 'Schlussrechnung' },
            ],
          },
        },
      }),
    );

    expect(model.subpoints).toHaveLength(3);
    expect(model.overflowCount).toBe(1);
  });

  it('does not emit generic Dokumente labels when concrete names exist', () => {
    const model = buildOperatorTaskDisplayModel(
      task({
        id: 'doc-2',
        title: 'Dokumente prüfen',
        type: 'DOCUMENT_REVIEW',
        metadata: {
          documentPackage: {
            missingDocuments: [{ humanReadableLabel: 'Mietvertrag' }],
          },
        },
      }),
    );

    expect(model.subpoints).toEqual(['Mietvertrag']);
    expect(model.subpoints).not.toContain('Dokumente');
  });
});
