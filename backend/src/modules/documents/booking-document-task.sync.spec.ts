import { TaskCompletionMode } from '@prisma/client';
import { bookingDocumentPackageDedupKey } from './booking-document-phase.util';
import { DOCUMENT_TYPE } from './documents.constants';
import { createBookingTaskPipelineHarness } from '../tasks/booking-task-pipeline.harness';

describe('Booking document package task automation', () => {
  const orgId = 'org-booking-task-a';
  const bookingId = 'booking-task-a';

  const baseInput = {
    bookingId,
    vehicleId: 'vehicle-booking-a',
    customerId: 'cust-booking-a',
    phase: 'CONFIRMED',
    dedupKey: bookingDocumentPackageDedupKey('CONFIRMED', bookingId),
  };

  it('creates one DOCUMENT_REVIEW task for a single missing document with concrete checklist label', async () => {
    const { store, automation } = createBookingTaskPipelineHarness();

    await automation.syncBookingDocumentPackageTask(orgId, {
      ...baseInput,
      missingDocuments: [
        {
          documentType: DOCUMENT_TYPE.BOOKING_INVOICE,
          humanReadableLabel: 'Rechnung',
          reason: 'not_generated',
          actionType: 'GENERATE',
          canGenerateAutomatically: true,
          configurationProblem: false,
        },
      ],
    });

    const rows = store.tasksByDedupKey(orgId, baseInput.dedupKey);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.type).toBe('DOCUMENT_REVIEW');
    expect(rows[0]?.title).toBe('Dokumentenpaket unvollständig – 1 Dokument fehlt');
    const checklist = store.tables.taskChecklistItems.filter((i) => i.taskId === rows[0]?.id);
    expect(checklist).toHaveLength(1);
    expect(checklist[0]?.title).toBe('Rechnung');
    expect(checklist.some((i) => i.title === 'Dokumente')).toBe(false);
  });

  it('creates one package task with checklist entries for multiple missing documents', async () => {
    const { store, automation } = createBookingTaskPipelineHarness();

    await automation.syncBookingDocumentPackageTask(orgId, {
      ...baseInput,
      missingDocuments: [
        {
          documentType: DOCUMENT_TYPE.BOOKING_INVOICE,
          humanReadableLabel: 'Rechnung',
          reason: 'not_generated',
          actionType: 'GENERATE',
          canGenerateAutomatically: true,
          configurationProblem: false,
        },
        {
          documentType: DOCUMENT_TYPE.RENTAL_CONTRACT,
          humanReadableLabel: 'Mietvertrag',
          reason: 'not_generated',
          actionType: 'GENERATE',
          canGenerateAutomatically: true,
          configurationProblem: false,
        },
        {
          documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
          humanReadableLabel: 'Allgemeine Geschäftsbedingungen (AGB)',
          reason: 'not_generated',
          actionType: 'GENERATE',
          canGenerateAutomatically: true,
          configurationProblem: false,
        },
      ],
    });

    const row = store.tasksByDedupKey(orgId, baseInput.dedupKey)[0]!;
    expect(row.title).toBe('Dokumentenpaket unvollständig – 3 Dokumente fehlen');
    const titles = store.tables.taskChecklistItems
      .filter((i) => i.taskId === row.id)
      .map((i) => i.title);
    expect(titles).toEqual(
      expect.arrayContaining(['Rechnung', 'Mietvertrag', 'Allgemeine Geschäftsbedingungen (AGB)']),
    );
  });

  it('auto-resolves with DOCUMENT_PACKAGE_COMPLETE when nothing is missing', async () => {
    const { store, automation } = createBookingTaskPipelineHarness();

    await automation.syncBookingDocumentPackageTask(orgId, {
      ...baseInput,
      missingDocuments: [
        {
          documentType: DOCUMENT_TYPE.RENTAL_CONTRACT,
          humanReadableLabel: 'Mietvertrag',
          reason: 'not_generated',
          actionType: 'GENERATE',
          canGenerateAutomatically: true,
          configurationProblem: false,
        },
      ],
    });

    await automation.syncBookingDocumentPackageTask(orgId, {
      ...baseInput,
      missingDocuments: [],
    });

    const row = store.tasksByDedupKey(orgId, baseInput.dedupKey)[0]!;
    expect(row.status).toBe('DONE');
    expect(row.completionMode).toBe(TaskCompletionMode.AUTO_RESOLVED);
    expect(row.resolutionCode).toBe('DOCUMENT_PACKAGE_COMPLETE');
    expect(store.eventsForTask(row.id as string).some((e) => e.type === 'AUTO_RESOLVED')).toBe(true);
  });

  it('updates the same task on repeated sync without duplicates', async () => {
    const { store, automation } = createBookingTaskPipelineHarness();
    const missing = [
      {
        documentType: DOCUMENT_TYPE.DEPOSIT_RECEIPT,
        humanReadableLabel: 'Kautionsbeleg',
        reason: 'not_generated',
        actionType: 'GENERATE',
        canGenerateAutomatically: true,
        configurationProblem: false,
      },
    ];

    await automation.syncBookingDocumentPackageTask(orgId, { ...baseInput, missingDocuments: missing });
    await automation.syncBookingDocumentPackageTask(orgId, { ...baseInput, missingDocuments: missing });

    expect(store.tasksByDedupKey(orgId, baseInput.dedupKey)).toHaveLength(1);
  });

  it('materialises separate package tasks per booking phase', async () => {
    const { store, automation } = createBookingTaskPipelineHarness();

    await automation.syncBookingDocumentPackageTask(orgId, {
      ...baseInput,
      phase: 'CONFIRMED',
      dedupKey: bookingDocumentPackageDedupKey('CONFIRMED', bookingId),
      missingDocuments: [],
    });
    await automation.syncBookingDocumentPackageTask(orgId, {
      ...baseInput,
      phase: 'ACTIVE',
      dedupKey: bookingDocumentPackageDedupKey('ACTIVE', bookingId),
      missingDocuments: [
        {
          documentType: DOCUMENT_TYPE.HANDOVER_PICKUP,
          humanReadableLabel: 'Übergabeprotokoll (Abholung)',
          reason: 'not_generated',
          actionType: 'GENERATE',
          canGenerateAutomatically: true,
          configurationProblem: false,
        },
      ],
    });

    expect(store.tasksByDedupKey(orgId, bookingDocumentPackageDedupKey('ACTIVE', bookingId))).toHaveLength(1);
    expect(
      store.tasksByDedupKey(orgId, bookingDocumentPackageDedupKey('ACTIVE', bookingId))[0]?.title,
    ).toContain('1 Dokument fehlt');
  });

  it('supersedes legacy per-type document tasks when syncing package task', async () => {
    const { store, automation } = createBookingTaskPipelineHarness();
    store.tables.orgTasks.push({
      id: 'legacy-doc-1',
      organizationId: orgId,
      bookingId,
      vehicleId: 'vehicle-booking-a',
      dedupKey: `document:${DOCUMENT_TYPE.RENTAL_CONTRACT}:${bookingId}`,
      type: 'DOCUMENT_REVIEW',
      source: 'DOCUMENT',
      sourceType: 'DOCUMENT',
      status: 'OPEN',
      title: 'Legacy per-type',
      priority: 'NORMAL',
      createdAt: new Date(),
      updatedAt: new Date(),
      blocksVehicleAvailability: false,
      completionMode: null,
      resolutionCode: null,
    });
    const legacy = store.tables.orgTasks.find((t) => t.id === 'legacy-doc-1')!;

    await automation.syncBookingDocumentPackageTask(orgId, {
      ...baseInput,
      missingDocuments: [
        {
          documentType: DOCUMENT_TYPE.RENTAL_CONTRACT,
          humanReadableLabel: 'Mietvertrag',
          reason: 'not_generated',
          actionType: 'GENERATE',
          canGenerateAutomatically: true,
          configurationProblem: false,
        },
      ],
    });

    const legacyAfter = store.tables.orgTasks.find((t) => t.id === legacy.id)!;
    expect(legacyAfter.status).toBe('DONE');
    expect(legacyAfter.completionMode).toBe(TaskCompletionMode.SUPERSEDED);
  });

  it('marks checklist items done when a missing document is later generated', async () => {
    const { store, automation } = createBookingTaskPipelineHarness();

    await automation.syncBookingDocumentPackageTask(orgId, {
      ...baseInput,
      missingDocuments: [
        {
          documentType: DOCUMENT_TYPE.BOOKING_INVOICE,
          humanReadableLabel: 'Rechnung',
          reason: 'not_generated',
          actionType: 'GENERATE',
          canGenerateAutomatically: true,
          configurationProblem: false,
        },
        {
          documentType: DOCUMENT_TYPE.RENTAL_CONTRACT,
          humanReadableLabel: 'Mietvertrag',
          reason: 'not_generated',
          actionType: 'GENERATE',
          canGenerateAutomatically: true,
          configurationProblem: false,
        },
      ],
    });

    const row = store.tasksByDedupKey(orgId, baseInput.dedupKey)[0]!;

    await automation.syncBookingDocumentPackageTask(orgId, {
      ...baseInput,
      missingDocuments: [
        {
          documentType: DOCUMENT_TYPE.RENTAL_CONTRACT,
          humanReadableLabel: 'Mietvertrag',
          reason: 'not_generated',
          actionType: 'GENERATE',
          canGenerateAutomatically: true,
          configurationProblem: false,
        },
      ],
    });

    expect(store.tasksByDedupKey(orgId, baseInput.dedupKey)).toHaveLength(1);
    const checklist = store.tables.taskChecklistItems.filter((i) => i.taskId === row.id);
    const invoiceItem = checklist.find((i) => i.description === `documentSlot:${DOCUMENT_TYPE.BOOKING_INVOICE}`);
    const contractItem = checklist.find((i) => i.description === `documentSlot:${DOCUMENT_TYPE.RENTAL_CONTRACT}`);
    expect(invoiceItem?.isDone).toBe(true);
    expect(contractItem?.isDone).toBe(false);
  });

  it('stores structured metadata on the package task', async () => {
    const { store, automation } = createBookingTaskPipelineHarness();

    await automation.syncBookingDocumentPackageTask(orgId, {
      ...baseInput,
      missingDocuments: [
        {
          documentType: DOCUMENT_TYPE.FINAL_INVOICE,
          humanReadableLabel: 'Schlussrechnung',
          reason: 'not_generated',
          actionType: 'GENERATE',
          canGenerateAutomatically: true,
          configurationProblem: false,
        },
      ],
    });

    const metadata = store.tasksByDedupKey(orgId, baseInput.dedupKey)[0]?.metadata as {
      documentPackage?: { phase?: string; missingDocuments?: unknown[] };
    };
    expect(metadata.documentPackage?.phase).toBe('CONFIRMED');
    expect(metadata.documentPackage?.missingDocuments).toHaveLength(1);
  });
});
