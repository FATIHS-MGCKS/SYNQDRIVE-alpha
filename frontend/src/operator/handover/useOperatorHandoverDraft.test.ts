// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitForHook } from '../../test/renderHook';
import { createInitialHandoverState } from './operatorHandoverPayload';
import { useOperatorHandoverDraft } from './useOperatorHandoverDraft';

const booking = {
  id: 'booking-1',
  vehicleId: 'vehicle-1',
  customerId: 'customer-1',
  vehicleName: 'VW Golf',
  plate: 'B-XY 123',
  customerName: 'Max Mustermann',
  startDate: '2026-06-01',
  endDate: '2026-06-10',
  pickupLocation: 'Berlin',
};

vi.mock('../../lib/api', () => ({
  api: {
    bookings: {
      getHandoverDraft: vi.fn(),
      createHandoverDraft: vi.fn(),
      updateHandoverDraft: vi.fn(),
    },
  },
}));

import { api } from '../../lib/api';

describe('useOperatorHandoverDraft', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it('loads existing draft and hydrates form', async () => {
    const draftRecord = {
      id: 'session-1',
      organizationId: 'org-1',
      stationId: null,
      bookingId: booking.id,
      vehicleId: booking.vehicleId,
      kind: 'PICKUP' as const,
      status: 'DRAFT',
      currentStep: 'condition' as const,
      version: 2,
      draft: {
        schemaVersion: 1,
        currentStep: 'condition' as const,
        form: {
          odometerKm: '1000',
          fuelPercent: '80',
          fuelFull: false,
          performedAtLocal: '2026-07-25T10:00',
          checks: createInitialHandoverState(booking, 'PICKUP').checks,
          warningLightsNotes: '',
          notes: '',
          staffId: '',
          staffName: '',
          actualStationId: '',
          selectedDamageIds: [],
          tireMeasurementCaptured: false,
          technicalObservationDrafts: [],
        },
        uploadRefs: [],
        signatureStatus: {
          customer: { name: null, captured: false },
          staff: { name: null, captured: false },
        },
      },
      expiresAt: null,
      editable: true,
      expired: false,
    };

    vi.mocked(api.bookings.getHandoverDraft).mockResolvedValue({
      lifecycleStatus: 'DRAFT',
      draft: draftRecord,
    });

    const patchState = vi.fn();
    const setStep = vi.fn();
    const state = createInitialHandoverState(booking, 'PICKUP');

    const { result, unmount } = renderHook(() =>
      useOperatorHandoverDraft(
        true,
        'org-1',
        booking.id,
        'PICKUP',
        'vehicle',
        state,
        patchState,
        setStep,
      ),
    );

    await waitForHook(() => result.current.sessionId === 'session-1');
    expect(patchState).toHaveBeenCalled();
    expect(setStep).toHaveBeenCalledWith('condition');
    expect(result.current.saveStatus).toBe('saved');
    unmount();
  });
});
