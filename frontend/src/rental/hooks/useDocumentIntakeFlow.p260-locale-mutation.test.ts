// @vitest-environment happy-dom
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitForHook } from '../../test/renderHook';
import type { PublicDocumentExtraction } from '../lib/document-extraction.types';
import * as schemaFieldReview from '../lib/document-schema-field-review';
import { useDocumentIntakeFlow } from './useDocumentIntakeFlow';

const pollerLifecycle = {
  creates: 0,
  stops: 0,
};

const pollerInstances: Array<{
  stop: ReturnType<typeof vi.fn>;
  options: {
    fetchRecord: () => Promise<PublicDocumentExtraction>;
    onRecord: (record: PublicDocumentExtraction) => void;
  };
}> = [];

vi.mock('../lib/document-extraction-polling', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/document-extraction-polling')>();
  return {
    ...actual,
    createExtractionPoller: vi.fn((options: (typeof pollerInstances)[number]['options']) => {
      pollerLifecycle.creates += 1;
      const stop = vi.fn(() => {
        pollerLifecycle.stops += 1;
      });
      pollerInstances.push({ stop, options });
      return { stop };
    }),
  };
});

const { getDocumentExtraction, confirmDocumentExtraction } = vi.hoisted(() => ({
  getDocumentExtraction: vi.fn(),
  confirmDocumentExtraction: vi.fn(),
}));

vi.mock('../../lib/api', () => ({
  api: {
    documentExtraction: {
      metadata: () =>
        Promise.resolve({
          extensions: ['.pdf'],
          mimeTypes: ['application/pdf'],
          maxUploadBytes: 10 * 1024 * 1024,
          maxUploadMb: 10,
          classificationOptions: [],
          documentTypes: [],
        }),
    },
    vehicleIntelligence: {
      getDocumentExtraction,
      confirmDocumentExtraction,
    },
  },
}));

const VEHICLE_ID = 'veh-p260';
const EXTRACTION_ID = 'ext-p260';
const ACTION_PLAN_FINGERPRINT = 'action-plan-fingerprint-p260';

function readyRecord(overrides: Partial<PublicDocumentExtraction> = {}): PublicDocumentExtraction {
  return {
    id: EXTRACTION_ID,
    vehicleId: VEHICLE_ID,
    status: 'READY_FOR_REVIEW',
    documentType: 'SERVICE',
    extractedData: { eventDate: '2026-02-01' },
    allowedActions: ['confirm'],
    ...overrides,
  } as PublicDocumentExtraction;
}

function processingRecord(): PublicDocumentExtraction {
  return {
    id: EXTRACTION_ID,
    vehicleId: VEHICLE_ID,
    status: 'PROCESSING',
    processingStage: 'EXTRACTION',
    documentType: 'SERVICE',
    extractedData: {},
    allowedActions: ['confirm'],
  } as PublicDocumentExtraction;
}

describe('useDocumentIntakeFlow P2.2.60 locale mutation evidence', () => {
  beforeEach(() => {
    pollerLifecycle.creates = 0;
    pollerLifecycle.stops = 0;
    pollerInstances.length = 0;
    confirmDocumentExtraction.mockReset();
    getDocumentExtraction.mockReset();
    vi.restoreAllMocks();
  });

  it('parses confirm payload dates using current locale after same-mount locale switch', async () => {
    getDocumentExtraction.mockResolvedValue(readyRecord());
    confirmDocumentExtraction.mockImplementation(async (_vehicleId, _extractionId, payload) => ({
      ...readyRecord(),
      status: 'READY_FOR_REVIEW',
      confirmedData: undefined,
      extractedData: payload.confirmedData,
    }));

    const savedReviewSpy = vi.spyOn(schemaFieldReview, 'hasSavedFieldReview').mockReturnValue(true);

    const { result, rerender, unmount } = renderHook(
      ({ locale }: { locale: 'de' | 'en' }) =>
        useDocumentIntakeFlow({
          vehicleId: VEHICLE_ID,
          locale,
          mode: 'embedded',
        }),
      { initialProps: { locale: 'de' as const } },
    );

    await waitForHook(() => result.current.metadata != null);

    await act(async () => {
      await result.current.openExtraction(EXTRACTION_ID, null, VEHICLE_ID);
    });

    await waitForHook(() => result.current.flow === 'ready');

    act(() => {
      result.current.setEditedFields([
        {
          key: 'eventDate',
          label: 'Event date',
          fieldType: 'date',
          value: '01.02.2026',
        },
      ]);
      result.current.handleActionPlanPreviewState({
        preview: {
          canConfirm: true,
          fingerprint: ACTION_PLAN_FINGERPRINT,
          confirmBlockedReason: null,
        } as never,
        loading: false,
      });
    });

    await act(async () => {
      await result.current.handleConfirm();
    });

    expect(confirmDocumentExtraction).toHaveBeenCalledTimes(1);
    expect(confirmDocumentExtraction).toHaveBeenCalledWith(
      VEHICLE_ID,
      EXTRACTION_ID,
      {
        confirmedData: { eventDate: '2026-02-01' },
        actionPlanFingerprint: ACTION_PLAN_FINGERPRINT,
      },
    );

    confirmDocumentExtraction.mockClear();

    rerender({ locale: 'en' });

    act(() => {
      result.current.setEditedFields([
        {
          key: 'eventDate',
          label: 'Event date',
          fieldType: 'date',
          value: '01/02/2026',
        },
      ]);
    });

    await act(async () => {
      await result.current.handleConfirm();
    });

    expect(confirmDocumentExtraction).toHaveBeenCalledTimes(1);
    expect(confirmDocumentExtraction).toHaveBeenCalledWith(
      VEHICLE_ID,
      EXTRACTION_ID,
      {
        confirmedData: { eventDate: '2026-01-02' },
        actionPlanFingerprint: ACTION_PLAN_FINGERPRINT,
      },
    );

    confirmDocumentExtraction.mockClear();

    rerender({ locale: 'de' });

    act(() => {
      result.current.setEditedFields([
        {
          key: 'eventDate',
          label: 'Event date',
          fieldType: 'date',
          value: '01.02.2026',
        },
      ]);
    });

    await act(async () => {
      await result.current.handleConfirm();
    });

    expect(confirmDocumentExtraction).toHaveBeenCalledWith(
      VEHICLE_ID,
      EXTRACTION_ID,
      {
        confirmedData: { eventDate: '2026-02-01' },
        actionPlanFingerprint: ACTION_PLAN_FINGERPRINT,
      },
    );

    savedReviewSpy.mockRestore();
    unmount();
  });

  it('does not restart polling lifecycle when locale changes during active polling', async () => {
    getDocumentExtraction.mockResolvedValue(processingRecord());

    const { result, rerender, unmount } = renderHook(
      ({ locale }: { locale: 'de' | 'en' }) =>
        useDocumentIntakeFlow({
          vehicleId: VEHICLE_ID,
          locale,
          mode: 'embedded',
        }),
      { initialProps: { locale: 'de' as const } },
    );

    await waitForHook(() => result.current.metadata != null);

    await act(async () => {
      await result.current.openExtraction(EXTRACTION_ID, null, VEHICLE_ID);
    });

    expect(pollerLifecycle.creates).toBe(1);
    const lifecycleStartsBeforeLocale = pollerLifecycle.creates;

    rerender({ locale: 'en' });
    expect(pollerLifecycle.creates).toBe(lifecycleStartsBeforeLocale);
    expect(pollerLifecycle.stops).toBe(0);

    rerender({ locale: 'de' });
    expect(pollerLifecycle.creates).toBe(lifecycleStartsBeforeLocale);
    expect(pollerLifecycle.stops).toBe(0);

    const activePoller = pollerInstances[0];
    expect(activePoller).toBeDefined();

    getDocumentExtraction.mockResolvedValue(
      readyRecord({
        status: 'READY_FOR_REVIEW',
      }),
    );

    await act(async () => {
      await activePoller.options.onRecord(readyRecord());
    });

    expect(pollerLifecycle.creates).toBe(lifecycleStartsBeforeLocale);
    expect(result.current.flow).toBe('ready');

    unmount();
  });
});
